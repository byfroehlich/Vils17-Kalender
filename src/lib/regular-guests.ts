import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { sendPushToRole } from "./push";
import { logAudit } from "./audit";

// ─── Stammgast-Liste ──────────────────────────────────────────────────────────
// Entscheidung Mathias 31.10.2026: Gäste scannen den QR-Code in der Gästemappe,
// landen auf vils17.at/stammgast/ und tragen sich freiwillig ein. Rechtsgrundlage
// ist ihre ausdrückliche Einwilligung (Art. 6 Abs. 1 lit. a DSGVO; Werbung per
// E-Mail/WhatsApp in Österreich § 174 TKG 2021) — deshalb je Kanal getrennt, mit
// Zeitpunkt und dem genau angezeigten Text, jederzeit widerrufbar.
// Personenbezogene Daten gehen nie in Logs, Audit oder Push-Texte.

/** Seiten, die das Formular absenden dürfen (CORS). */
export const ALLOWED_ORIGINS = ["https://vils17.at", "https://www.vils17.at"] as const;

/** Höchstens so viele Eintragungen je IP im Zeitfenster. */
export const SIGNUP_LIMIT = 5;
export const SIGNUP_WINDOW_MS = 10 * 60_000;

export const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Bitte Ihren Namen angeben.").max(80, "Name ist zu lang."),
    email: z.string().trim().toLowerCase().max(200).email("Bitte eine gültige E-Mail-Adresse angeben."),
    phone: z
      .string()
      .trim()
      .max(40)
      .regex(/^[+\d][\d\s()/.-]{4,}$/, "Bitte eine gültige Telefonnummer angeben.")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    apartment: z
      .enum(["penthouse", "lodge"])
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    consentEmail: z.boolean().default(false),
    consentWhatsapp: z.boolean().default(false),
    consentText: z.string().trim().min(10, "Einwilligungstext fehlt.").max(1000),
    // Honeypot — Menschen sehen das Feld nicht und lassen es leer
    website: z.string().optional(),
    source: z.string().trim().regex(/^[a-z0-9_-]{1,40}$/).optional(),
  })
  .refine((v) => v.consentEmail || v.consentWhatsapp, {
    message: "Bitte mindestens eine Einwilligung ankreuzen.",
    path: ["consentEmail"],
  })
  .refine((v) => !v.consentWhatsapp || !!v.phone, {
    message: "Für WhatsApp bitte eine Telefonnummer angeben.",
    path: ["phone"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

// ─── Begrenzung je IP (im Speicher, je Instanz) ───────────────────────────────

const hits = new Map<string, number[]>();

/** true = erlaubt. Zählt den Versuch mit. */
export function allowSignup(ip: string, now = Date.now()): boolean {
  if (hits.size > 5_000) {
    hits.forEach((v, k) => {
      const last = v[v.length - 1];
      if (last === undefined || now - last >= SIGNUP_WINDOW_MS) hits.delete(k);
    });
  }
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < SIGNUP_WINDOW_MS);
  if (recent.length >= SIGNUP_LIMIT) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

export function resetSignupLimit() {
  hits.clear();
}

// ─── Organisation ─────────────────────────────────────────────────────────────

/** Öffentliche Seite → Organisation: ENV PUBLIC_ORG_SLUG, sonst die erste angelegte. */
export async function resolvePublicOrganizationId(): Promise<string | null> {
  const slug = process.env.PUBLIC_ORG_SLUG?.trim();
  const org = slug
    ? await prisma.organization.findUnique({ where: { slug }, select: { id: true } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return org?.id ?? null;
}

// ─── Eintragen / Abmelden ─────────────────────────────────────────────────────

export function newUnsubscribeToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Trägt einen Stammgast ein. Gleiche E-Mail → Eintrag aktualisieren (neue
 * Einwilligung, wieder angemeldet), nie doppelt. Bei Neueintragung Push an
 * Admin/Verwaltung — ohne Namen oder Kontaktdaten.
 */
export async function signupRegularGuest(
  organizationId: string,
  input: SignupInput,
  now = new Date()
): Promise<{ created: boolean; id: string }> {
  const data = {
    name: input.name,
    phone: input.phone ?? null,
    apartment: input.apartment ?? null,
    consentEmail: input.consentEmail,
    consentWhatsapp: input.consentWhatsapp,
    consentText: input.consentText,
    consentAt: now,
    unsubscribedAt: null,
    source: input.source ?? "gaestemappe",
  };
  const existing = await prisma.regularGuest.findUnique({
    where: { organizationId_email: { organizationId, email: input.email } },
    select: { id: true },
  });
  const row = existing
    ? await prisma.regularGuest.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.regularGuest.create({
        data: { ...data, organizationId, email: input.email, unsubscribeToken: newUnsubscribeToken() },
        select: { id: true },
      });

  await logAudit({
    organizationId,
    action: existing ? "regular_guest.updated" : "regular_guest.signup",
    entityType: "RegularGuest",
    entityId: row.id,
    details: { email: input.consentEmail, whatsapp: input.consentWhatsapp, quelle: data.source },
  });

  if (!existing) {
    await sendPushToRole(organizationId, ["ADMIN", "MANAGER"], {
      title: "⭐ Neuer Stammgast eingetragen",
      body: `Über die Gästemappe – Einwilligung: ${[input.consentEmail && "E-Mail", input.consentWhatsapp && "WhatsApp"].filter(Boolean).join(" + ")}`,
    }).catch(() => null);
  }
  return { created: !existing, id: row.id };
}

/** Abmelden über den Link. Liefert false, wenn das Token unbekannt ist. */
export async function unsubscribeRegularGuest(token: string, now = new Date()): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return false;
  const guest = await prisma.regularGuest.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, organizationId: true, unsubscribedAt: true },
  });
  if (!guest) return false;
  if (!guest.unsubscribedAt) {
    await prisma.regularGuest.update({ where: { id: guest.id }, data: { unsubscribedAt: now } });
    await logAudit({
      organizationId: guest.organizationId,
      action: "regular_guest.unsubscribed",
      entityType: "RegularGuest",
      entityId: guest.id,
      details: { weg: "link" },
    });
  }
  return true;
}

/** Link zum Abmelden für Mails/Nachrichten an Stammgäste. */
export function unsubscribeUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://vils17-kalender.onrender.com").replace(/\/$/, "");
  return `${base}/api/public/stammgast/abmelden?token=${encodeURIComponent(token)}`;
}
