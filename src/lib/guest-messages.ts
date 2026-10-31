import { z } from "zod";
import { smoobuRequest } from "./smoobu-auth";

// ─── Gästenachrichten über Smoobu ─────────────────────────────────────────────
// Smoobu führt die Chats von Airbnb und Booking.com in seinem Posteingang
// zusammen. Lesen und Antworten laufen über die Buchungs-ID bei Smoobu.
// Doku: https://docs.smoobu.com/ → Messages
//   GET  /api/reservations/{id}/messages?page=&onlyRelatedToGuest=
//   POST /api/reservations/{id}/messages/send-message-to-guest {subject?, messageBody}
// Gesendet wird nur über die MCP-Schnittstelle nach Mathias' Bestätigung.

const SMOOBU_API_BASE = "https://login.smoobu.com/api";

export class GuestMessageError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

// Nachgiebig: Die Doku nennt das HTML-Feld einmal htmlMessage, einmal messageHtml.
const messageSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    subject: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    htmlMessage: z.string().nullable().optional(),
    messageHtml: z.string().nullable().optional(),
    type: z.union([z.number(), z.string()]),
  })
  .passthrough();

const pageSchema = z
  .object({
    page_count: z.number().optional(),
    page: z.number().optional(),
    total_items: z.number().optional(),
    messages: z.array(messageSchema).default([]),
  })
  .passthrough();

export interface GuestMessage {
  id: string;
  /** "gast" = vom Gast eingegangen, "gastgeber" = von uns gesendet */
  von: "gast" | "gastgeber";
  betreff: string | null;
  text: string;
  /** Zeitpunkt laut Smoobu (ISO), falls die Antwort einen liefert — die öffentliche Doku nennt keinen */
  zeit: string | null;
}

const TIME_FIELDS = ["createdAt", "created_at", "sentAt", "sent_at", "date", "created", "timestamp"] as const;
function messageTime(m: Record<string, unknown>): string | null {
  for (const f of TIME_FIELDS) {
    const v = m[f];
    if (typeof v !== "string" && typeof v !== "number") continue;
    const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v.includes("T") || v.includes("Z") ? v : v.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/** HTML grob zu Text, falls Smoobu keinen Klartext liefert */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalize(m: z.infer<typeof messageSchema>): GuestMessage {
  const html = m.htmlMessage ?? m.messageHtml ?? "";
  const text = (m.message ?? "").trim() || stripHtml(html);
  return {
    id: String(m.id),
    von: Number(m.type) === 1 ? "gast" : "gastgeber",
    betreff: m.subject?.trim() || null,
    text,
    zeit: messageTime(m as Record<string, unknown>),
  };
}

/**
 * Holt alle Seiten der Gästenachrichten einer Buchung (höchstens maxPages).
 * Reihenfolge wie von Smoobu geliefert.
 */
export async function fetchGuestMessages(smoobuId: number, maxPages = 5): Promise<{ messages: GuestMessage[]; complete: boolean }> {
  const out: GuestMessage[] = [];
  let page = 1;
  let pageCount = 1;
  do {
    const url = new URL(`${SMOOBU_API_BASE}/reservations/${smoobuId}/messages`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("onlyRelatedToGuest", "true");
    const res = await smoobuRequest("GET", url.toString());
    if (!res.ok) {
      throw new GuestMessageError(
        res.status === 404 ? "Buchung bei Smoobu nicht gefunden" : `Smoobu antwortet mit Status ${res.status}`,
        res.status
      );
    }
    const parsed = pageSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new GuestMessageError("Unerwartete Antwort von Smoobu (Nachrichten)");
    out.push(...parsed.data.messages.map(normalize).filter((m) => !isAutomationMessage(m)));
    pageCount = parsed.data.page_count ?? 1;
    page++;
  } while (page <= pageCount && page <= maxPages);
  return { messages: out, complete: page > pageCount };
}

/**
 * Systemnachrichten von Smoobu (Schlüssel-/Zugangsautomatik) sind kein Gespräch
 * mit dem Gast und würden „wartet auf Antwort“ verfälschen.
 */
export function isAutomationMessage(m: Pick<GuestMessage, "betreff" | "text">): boolean {
  return /^automation for booking/i.test(m.betreff ?? "") || /will be granted access/i.test(m.text);
}

/** Schickt eine Nachricht an den Gast. Nur nach Bestätigung aufrufen. */
export async function sendGuestMessage(smoobuId: number, messageBody: string, subject?: string): Promise<void> {
  const body = { ...(subject ? { subject } : {}), messageBody };
  const res = await smoobuRequest("POST", `${SMOOBU_API_BASE}/reservations/${smoobuId}/messages/send-message-to-guest`, body);
  if (res.status !== 201 && !res.ok) {
    const detail = await res
      .json()
      .then((j: { detail?: string; title?: string }) => j?.detail || j?.title || "")
      .catch(() => "");
    throw new GuestMessageError(`Senden fehlgeschlagen (Smoobu ${res.status}${detail ? `: ${String(detail).slice(0, 200)}` : ""})`, res.status);
  }
}

/**
 * Wartet der Gast auf Antwort? Ja, wenn die letzte Nachricht vom Gast ist.
 * Smoobu liefert keinen Zeitstempel je Nachricht; die Reihenfolge wird über die
 * Nachrichten-ID bestimmt (aufsteigend = später), falls numerisch.
 */
export function lastMessage(messages: GuestMessage[]): GuestMessage | null {
  if (!messages.length) return null;
  const numeric = messages.every((m) => /^\d+$/.test(m.id));
  if (!numeric) return messages[messages.length - 1] ?? null;
  return [...messages].sort((a, b) => Number(a.id) - Number(b.id))[messages.length - 1] ?? null;
}
