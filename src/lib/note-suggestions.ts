import { prisma } from "./prisma";
import { fetchGuestMessages } from "./guest-messages";
import { recordSeen } from "./message-seen";
import { detectSpecialRequests } from "./special-requests";
import { sendPushToRole, sendPushToUsers } from "./push";
import { logAudit } from "./audit";
import { ActionError, type Actor } from "./booking-actions";
import { todayVienna, addDays } from "./mcp/format";

// ─── Hinweise für die Reinigung aus dem Gästechat ─────────────────────────────
// Entscheidung Mathias 31.10.2026: EIN Feld (CleaningAssignment.notes = „Hinweis für die Reinigung“).
// Mathias pflegt es nicht von Hand — Sonderwünsche werden in den Gästechats erkannt und als
// Vorschlag (NoteSuggestion, PENDING) abgelegt. Übernehmen hängt den Text an notes an und
// benachrichtigt die zuständige Reinigungskraft; Verwerfen schließt den Vorschlag.
// Jede Gästenachricht wird höchstens einmal verwertet (unique organizationId + messageId).
// Nachrichtentexte nie ins Audit-Log.

/** Mindestabstand zwischen zwei Chat-Durchläufen (Smoobu nicht überlasten) */
export const NOTE_SCAN_INTERVAL_MS = 30 * 60 * 1000;
/** Gescannt werden Buchungen mit Anreise ab heute in den nächsten N Tagen */
export const NOTE_SCAN_DAYS = 60;

const de = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().slice(0, 2).join(".") + ".";
const shortApt = (name: string) => name.split(/\s+No\.|\s+-\s+/)[0]?.trim() || name;

export interface NoteScanResult {
  scanned: number;
  created: number;
  skipped: boolean;
  errors: number;
}

/**
 * Durchsucht die Gästechats kommender Buchungen nach Sonderwünschen und legt neue Vorschläge an.
 * Gedrosselt über Organization.noteScanAt (Vorgabe 30 Min; `force` ignoriert das). Idempotent.
 * Neue Vorschläge → eine gebündelte Push-Nachricht an Admin/Verwaltung.
 */
export async function scanNoteSuggestions(organizationId: string, opts: { force?: boolean; now?: Date } = {}): Promise<NoteScanResult> {
  const now = opts.now ?? new Date();
  const result: NoteScanResult = { scanned: 0, created: 0, skipped: false, errors: 0 };

  // Drosselung atomar „reservieren“ — Cron, App-Takt und geöffnete Apps können gleichzeitig kommen
  if (!opts.force) {
    const claimed = await prisma.organization.updateMany({
      where: { id: organizationId, OR: [{ noteScanAt: null }, { noteScanAt: { lt: new Date(now.getTime() - NOTE_SCAN_INTERVAL_MS) } }] },
      data: { noteScanAt: now },
    });
    if (claimed.count === 0) return { ...result, skipped: true };
  } else {
    await prisma.organization.update({ where: { id: organizationId }, data: { noteScanAt: now } });
  }

  const today = todayVienna(now);
  const bookings = await prisma.booking.findMany({
    where: {
      organizationId,
      status: "confirmed",
      smoobuId: { not: null },
      // Nur kommende Anreisen: der Hinweis gehört zum Reinigungsauftrag dieser Anreise
      checkIn: { gte: today, lt: addDays(today, NOTE_SCAN_DAYS) },
    },
    orderBy: { checkIn: "asc" },
    select: { id: true, smoobuId: true, checkIn: true, apartment: { select: { name: true } } },
  });

  const known = new Set(
    (await prisma.noteSuggestion.findMany({ where: { organizationId }, select: { messageId: true } })).map((s) => s.messageId)
  );

  const fresh: { checkIn: Date; apartment: string; labels: string[] }[] = [];
  for (const b of bookings) {
    let messages;
    try {
      ({ messages } = await fetchGuestMessages(b.smoobuId!, 2));
    } catch (e) {
      result.errors++;
      console.error("[hinweise] Chat nicht lesbar:", e instanceof Error ? e.message : e);
      continue;
    }
    result.scanned++;
    await recordSeen(organizationId, b.id, messages).catch(() => null);
    for (const m of messages) {
      if (m.von !== "gast" || known.has(m.id)) continue;
      const hit = detectSpecialRequests(m.text);
      if (!hit) continue;
      const created = await prisma.noteSuggestion.createMany({
        data: [{ organizationId, bookingId: b.id, messageId: m.id, proposedText: hit.labels.join(", "), excerpt: hit.excerpt, extraBeds: hit.extraBeds }],
        skipDuplicates: true,
      });
      known.add(m.id);
      if (created.count) {
        result.created++;
        fresh.push({ checkIn: b.checkIn, apartment: b.apartment.name, labels: hit.labels });
      }
    }
  }

  if (fresh.length) {
    const first = fresh[0]!;
    await sendPushToRole(organizationId, ["ADMIN", "MANAGER"], {
      title: fresh.length === 1
        ? `Sonderwunsch erkannt: ${shortApt(first.apartment)} ${de(first.checkIn)} – übernehmen?`
        : `${fresh.length} Sonderwünsche erkannt – übernehmen?`,
      body: fresh.slice(0, 4).map((f) => `${shortApt(f.apartment)} ${de(f.checkIn)}: ${f.labels.join(", ")}`).join(" · "),
      url: "/messages",
    });
  }
  return result;
}

/** Offene Vorschläge (für /messages und MCP) */
export async function listNoteSuggestions(organizationId: string, status: "PENDING" | "ALL" = "PENDING") {
  return prisma.noteSuggestion.findMany({
    where: { organizationId, ...(status === "PENDING" ? { status: "PENDING" } : {}) },
    orderBy: [{ booking: { checkIn: "asc" } }, { createdAt: "asc" }],
    include: {
      booking: {
        select: {
          id: true, guestName: true, checkIn: true, checkOut: true, channelName: true,
          apartment: { select: { name: true } },
          cleaningAssignment: { select: { notes: true, extraBeds: true, status: true, cleaner: { select: { name: true } } } },
        },
      },
    },
  });
}

/**
 * Übernimmt einen Vorschlag: Text (ggf. geändert) an den Hinweis für die Reinigung anhängen,
 * optional Zusatzbetten setzen, zuständige Reinigungskraft benachrichtigen.
 */
export async function acceptNoteSuggestion(params: {
  organizationId: string;
  id: string;
  text?: string | null;
  extraBeds?: number | null;
  actor: Actor;
}) {
  const s = await prisma.noteSuggestion.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    include: { booking: { select: { id: true, checkIn: true, apartment: { select: { name: true } } } } },
  });
  if (!s) throw new ActionError("Vorschlag nicht gefunden", 404);
  if (s.status !== "PENDING") throw new ActionError("Vorschlag wurde schon entschieden", 409);
  const assignment = await prisma.cleaningAssignment.findFirst({ where: { bookingId: s.bookingId, organizationId: params.organizationId } });
  if (!assignment) throw new ActionError("Zu dieser Buchung gibt es keinen Reinigungsauftrag", 404);

  const text = (params.text ?? s.proposedText).trim();
  if (!text) throw new ActionError("Hinweistext fehlt", 400);
  const extraBeds = params.extraBeds ?? (s.extraBeds > assignment.extraBeds ? s.extraBeds : null);
  if (extraBeds != null && (extraBeds < 0 || extraBeds > 3)) throw new ActionError("Zusatzbetten 0–3", 400);

  // Schon enthalten (z.B. zweite Nachricht mit demselben Wunsch) → nicht doppelt anhängen
  const existing = assignment.notes?.trim() ?? "";
  const notes = existing.toLowerCase().includes(text.toLowerCase()) ? existing : existing ? `${existing}\n${text}` : text;

  const claimed = await prisma.noteSuggestion.updateMany({
    where: { id: s.id, status: "PENDING" },
    data: { status: "ACCEPTED", decidedAt: new Date(), decidedById: params.actor.userId ?? null },
  });
  if (!claimed.count) throw new ActionError("Vorschlag wurde schon entschieden", 409);

  await prisma.cleaningAssignment.update({
    where: { id: assignment.id },
    data: { notes, ...(extraBeds != null ? { extraBeds } : {}) },
  });

  await logAudit({
    organizationId: params.organizationId,
    userId: params.actor.userId,
    action: "note_suggestion.accepted",
    entityType: "NoteSuggestion",
    entityId: s.id,
    details: { bookingId: s.bookingId, geaendert: params.text != null && params.text.trim() !== s.proposedText, zusatzbetten: extraBeds ?? assignment.extraBeds, ...(params.actor.via ? { via: params.actor.via } : {}) },
  });

  let notified = false;
  if (notes !== existing && assignment.cleanerId && assignment.status === "ASSIGNED") {
    await sendPushToUsers([assignment.cleanerId], {
      title: `⭐ Hinweis für deine Reinigung: ${shortApt(s.booking.apartment.name)} ${de(s.booking.checkIn)}`,
      body: text,
      url: "/my-jobs/list",
    }).catch(() => null);
    notified = true;
  }
  return { notes, extraBeds: extraBeds ?? assignment.extraBeds, notified };
}

export async function rejectNoteSuggestion(params: { organizationId: string; id: string; actor: Actor }) {
  const r = await prisma.noteSuggestion.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "PENDING" },
    data: { status: "REJECTED", decidedAt: new Date(), decidedById: params.actor.userId ?? null },
  });
  if (!r.count) throw new ActionError("Vorschlag nicht gefunden oder schon entschieden", 404);
  await logAudit({
    organizationId: params.organizationId,
    userId: params.actor.userId,
    action: "note_suggestion.rejected",
    entityType: "NoteSuggestion",
    entityId: params.id,
    details: params.actor.via ? { via: params.actor.via } : {},
  });
}
