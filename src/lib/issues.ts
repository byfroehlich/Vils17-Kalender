import { z } from "zod";
import { prisma } from "./prisma";
import { sendPushToRole } from "./push";
import { logAudit } from "./audit";
import { channelGroup, day } from "./mcp/format";

// ─── Mängel & Verbrauchsmaterial ──────────────────────────────────────────────
// Entscheidung Mathias 31.10.2026: Beim „Erledigt“ beantwortet die Reinigung Pflicht-
// fragen — Inventar in Ordnung? Verbrauchsmaterial (Reiniger, Lappen, …) nachkaufen?
// Jede Meldung hängt am Aufenthalt davor (möglicher Verursacher). Airbnb verlangt,
// dass der Gast binnen 14 Tagen nach Abreise angeschrieben wird — die Frist wird
// angezeigt. Push sofort an Admin/Verwaltung.

export const ISSUE_KINDS = ["DAMAGE", "SUPPLY"] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

/** data:image/jpeg;base64,… → Bytes; nur Bilder, höchstens 3 MB */
export function parsePhoto(dataUrl: string | null | undefined): { photo: Buffer; photoType: string } | null {
  if (!dataUrl) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new IssueError("Foto im falschen Format (JPEG, PNG oder WebP).");
  const photo = Buffer.from(m[2]!, "base64");
  if (photo.length > MAX_PHOTO_BYTES) throw new IssueError("Foto zu groß (max. 3 MB).");
  return { photo, photoType: m[1]! };
}

export class IssueError extends Error {}

export const checkSchema = z.object({
  inventoryOk: z.boolean(),
  damage: z.string().trim().max(1000).optional(),
  damagePhoto: z.string().max(5_000_000).optional(),
  suppliesOk: z.boolean(),
  supplies: z.string().trim().max(1000).optional(),
  drainsOk: z.boolean(),
  drain: z.string().trim().max(1000).optional(),
}).strict().superRefine((v, ctx) => {
  if (!v.drainsOk && !v.drain) ctx.addIssue({ code: "custom", path: ["drain"], message: "Bitte beschreiben, welcher Abfluss schlecht läuft." });
  if (!v.inventoryOk && !v.damage) ctx.addIssue({ code: "custom", path: ["damage"], message: "Bitte kurz beschreiben, was kaputt ist oder fehlt." });
  if (!v.suppliesOk && !v.supplies) ctx.addIssue({ code: "custom", path: ["supplies"], message: "Bitte angeben, was nachgekauft werden muss." });
});
export type CleaningCheck = z.infer<typeof checkSchema>;

/** Aufenthalt, nach dem diese Reinigung stattfindet (gleiche Wohnung, Abreise ≤ Anreise) */
export async function previousBooking(organizationId: string, bookingId: string) {
  const b = await prisma.booking.findFirst({ where: { id: bookingId, organizationId }, select: { apartmentId: true, checkIn: true } });
  if (!b) return null;
  return prisma.booking.findFirst({
    where: { organizationId, apartmentId: b.apartmentId, status: "confirmed", id: { not: bookingId }, checkOut: { lte: b.checkIn } },
    orderBy: { checkOut: "desc" },
    select: { id: true, guestName: true, checkIn: true, checkOut: true, channelName: true },
  });
}

/** Bis wann man bei Airbnb den Gast anschreiben muss (14 Tage nach Abreise); sonst null */
export function claimDeadline(prev: { channelName: string | null; checkOut: Date } | null): Date | null {
  if (!prev || channelGroup(prev.channelName) !== "Airbnb") return null;
  return new Date(prev.checkOut.getTime() + 14 * 86_400_000);
}

async function notify(organizationId: string, apartmentName: string, kind: IssueKind, text: string, who: string | null) {
  await sendPushToRole(organizationId, ["ADMIN", "MANAGER"], {
    title: kind === "DAMAGE" ? "⚠️ Schaden gemeldet" : "🧴 Nachkaufen",
    body: `${apartmentName}: ${text.slice(0, 140)}${who ? ` (${who})` : ""}`,
    url: "/issues",
  }).catch(() => null);
}

/** Antworten des Pflicht-Checks beim Erledigen speichern und melden */
export async function recordCleaningCheck(params: {
  organizationId: string;
  bookingId: string;
  check: CleaningCheck;
  actor: { userId?: string; name?: string | null };
}) {
  const assignment = await prisma.cleaningAssignment.findFirst({
    where: { bookingId: params.bookingId, organizationId: params.organizationId },
    select: { id: true, booking: { select: { apartmentId: true, apartment: { select: { name: true } } } } },
  });
  if (!assignment) throw new IssueError("Reinigung nicht gefunden.");
  const photo = parsePhoto(params.check.damagePhoto);
  const prev = await previousBooking(params.organizationId, params.bookingId);
  const base = {
    organizationId: params.organizationId,
    apartmentId: assignment.booking.apartmentId,
    assignmentId: assignment.id,
    previousBookingId: prev?.id ?? null,
    reportedById: params.actor.userId ?? null,
    reportedByName: params.actor.name ?? null,
  };
  const created: { kind: IssueKind; text: string }[] = [];
  if (!params.check.inventoryOk && params.check.damage) {
    await prisma.issue.create({ data: { ...base, kind: "DAMAGE", text: params.check.damage, ...(photo ?? {}) } });
    created.push({ kind: "DAMAGE", text: params.check.damage });
  }
  if (!params.check.suppliesOk && params.check.supplies) {
    await prisma.issue.create({ data: { ...base, kind: "SUPPLY", text: params.check.supplies } });
    created.push({ kind: "SUPPLY", text: params.check.supplies });
  }
  if (!params.check.drainsOk && params.check.drain) {
    const text = `Abfluss: ${params.check.drain}`;
    await prisma.issue.create({ data: { ...base, kind: "DAMAGE", text } });
    created.push({ kind: "DAMAGE", text });
  }
  await prisma.cleaningAssignment.update({ where: { id: assignment.id }, data: { checkedAt: new Date() } });
  for (const c of created) await notify(params.organizationId, assignment.booking.apartment.name, c.kind, c.text, params.actor.name ?? null);
  if (created.length) {
    await logAudit({
      organizationId: params.organizationId, userId: params.actor.userId, action: "issue.reported",
      entityType: "CleaningAssignment", entityId: assignment.id,
      details: { schaden: created.some((c) => c.kind === "DAMAGE"), abfluss: !params.check.drainsOk, nachkaufen: created.some((c) => c.kind === "SUPPLY"), foto: Boolean(photo) },
    });
  }
  return { created: created.length };
}

/** Von Hand erfassen (Admin, MCP) */
export async function createIssue(params: {
  organizationId: string;
  apartmentId: string;
  kind: IssueKind;
  text: string;
  photo?: string | null;
  actor: { userId?: string; name?: string | null };
}) {
  const apt = await prisma.apartment.findFirst({ where: { id: params.apartmentId, organizationId: params.organizationId }, select: { id: true, name: true } });
  if (!apt) throw new IssueError("Wohnung nicht gefunden.");
  const photo = parsePhoto(params.photo);
  const issue = await prisma.issue.create({
    data: {
      organizationId: params.organizationId, apartmentId: apt.id, kind: params.kind, text: params.text.trim(),
      reportedById: params.actor.userId ?? null, reportedByName: params.actor.name ?? null, ...(photo ?? {}),
    },
    select: { id: true },
  });
  await logAudit({ organizationId: params.organizationId, userId: params.actor.userId, action: "issue.created", entityType: "Issue", entityId: issue.id, details: { art: params.kind } });
  return issue;
}

export async function setIssueDone(params: { organizationId: string; id: string; done: boolean; note?: string | null; actor: { userId?: string } }) {
  const issue = await prisma.issue.findFirst({ where: { id: params.id, organizationId: params.organizationId }, select: { id: true } });
  if (!issue) throw new IssueError("Eintrag nicht gefunden.");
  await prisma.issue.update({ where: { id: issue.id }, data: { doneAt: params.done ? new Date() : null, doneNote: params.done ? params.note ?? null : null } });
  await logAudit({ organizationId: params.organizationId, userId: params.actor.userId, action: params.done ? "issue.done" : "issue.reopened", entityType: "Issue", entityId: issue.id });
}

export interface IssueView {
  id: string;
  kind: IssueKind;
  text: string;
  apartment: string;
  createdAt: Date;
  reportedBy: string | null;
  hasPhoto: boolean;
  done: boolean;
  doneAt: Date | null;
  doneNote: string | null;
  previous: { id: string; guest: string; checkIn: string; checkOut: string; channel: string } | null;
  /** Airbnb: Gast bis dahin anschreiben */
  claimDeadline: string | null;
}

export async function listIssues(organizationId: string, opts: { open?: boolean; limit?: number } = {}): Promise<IssueView[]> {
  const rows = await prisma.issue.findMany({
    where: { organizationId, ...(opts.open === undefined ? {} : opts.open ? { doneAt: null } : { NOT: { doneAt: null } }) },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
    select: { id: true, kind: true, text: true, apartmentId: true, createdAt: true, reportedByName: true, photoType: true, doneAt: true, doneNote: true, previousBookingId: true },
  });
  const apts = new Map((await prisma.apartment.findMany({ where: { organizationId }, select: { id: true, name: true } })).map((a) => [a.id, a.name]));
  const prevIds = rows.map((r) => r.previousBookingId).filter((x): x is string => Boolean(x));
  const prevs = new Map((await prisma.booking.findMany({ where: { id: { in: prevIds } }, select: { id: true, guestName: true, checkIn: true, checkOut: true, channelName: true } })).map((b) => [b.id, b]));
  return rows.map((r) => {
    const p = r.previousBookingId ? prevs.get(r.previousBookingId) ?? null : null;
    const deadline = r.kind === "DAMAGE" ? claimDeadline(p) : null;
    return {
      id: r.id,
      kind: r.kind as IssueKind,
      text: r.text,
      apartment: apts.get(r.apartmentId) ?? "?",
      createdAt: r.createdAt,
      reportedBy: r.reportedByName,
      hasPhoto: Boolean(r.photoType),
      done: Boolean(r.doneAt),
      doneAt: r.doneAt,
      doneNote: r.doneNote,
      previous: p ? { id: p.id, guest: p.guestName, checkIn: day(p.checkIn), checkOut: day(p.checkOut), channel: channelGroup(p.channelName) } : null,
      claimDeadline: deadline ? day(deadline) : null,
    };
  });
}
