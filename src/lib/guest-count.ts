import type { Prisma } from "@prisma/client";

// ─── Gästezahl bestätigt / unbestätigt ────────────────────────────────────────
// Entscheidung Mathias 31.10.2026: Liefert ein Kanal (v.a. Booking.com über Smoobu)
// keine verlässliche Gästezahl, darf das nicht still auf einen Notwert fallen —
// es wird groß angezeigt und muss geklärt werden.
//
// Unbestätigt = der Sync hat keine Gästezahl bekommen (Booking.guestCountUnknown, Notwert 1)
//               UND niemand hat sie korrigiert (guestCountManual: von Hand oder per Portal-Mail).
// Klärung: Portal-Mail-Import (setzt guestCountManual, Quelle "email"), Eingabe in der App
// bzw. MCP gaestezahl_korrigieren (Quelle "manual").

export interface GuestCountFields {
  guestCountUnknown?: boolean | null;
  guestCountManual?: boolean | null;
  guestCountSource?: string | null;
}

export function isGuestCountUnconfirmed(b: GuestCountFields): boolean {
  return !!b.guestCountUnknown && !b.guestCountManual;
}

/** Prisma-Filter für Buchungen mit unbestätigter Gästezahl */
export const UNCONFIRMED_GUEST_COUNT: Prisma.BookingWhereInput = { guestCountUnknown: true, guestCountManual: false };

export type GuestCountSource = "smoobu" | "von_hand" | "portal_mail" | "unbekannt";

/** Woher die Gästezahl stammt */
export function guestCountSource(b: GuestCountFields): GuestCountSource {
  if (b.guestCountManual) return b.guestCountSource === "email" ? "portal_mail" : "von_hand";
  return b.guestCountUnknown ? "unbekannt" : "smoobu";
}

/** Tage vor Anreise, ab denen eine unbestätigte Gästezahl per Push gemeldet wird */
export const GUEST_COUNT_WARN_DAYS = 30;
