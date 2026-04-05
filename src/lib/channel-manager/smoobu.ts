import { z } from "zod";
import type { ChannelManagerAdapter, NormalizedApartment, NormalizedReservation } from "./types";

const SMOOBU_API_BASE = "https://login.smoobu.com/api";

function getHeaders() {
  return {
    "Api-Key": process.env.SMOOBU_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

// ─── Zod-Schemas für rohe Smoobu-Antworten ───────────────────────────────────
// Smoobu-Feldnamen sind mit Bindestrichen (check-in, guest-name, etc.)
// Felder die manchmal fehlen sind optional gemacht.

const SmoobuApartmentSchema = z.object({
  id: z.number(),
  name: z.string(),
});

const SmoobuReservationSchema = z.object({
  id: z.number(),
  type: z.string().optional(), // "reservation" | "blocked"
  // Datums-Felder: Smoobu nutzt "arrival"/"departure" (nicht "check-in"/"check-out")
  arrival: z.string().optional(),
  departure: z.string().optional(),
  // Fallback-Varianten (ältere API-Versionen)
  "check-in": z.string().optional(),
  "check-out": z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  // Gast
  "guest-name": z.string().optional(),
  guestName: z.string().optional(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  adults: z.number().optional().nullable(),
  children: z.number().optional().nullable(),
  // Zeiten
  "arrival-time": z.string().optional().nullable(),
  "departure-time": z.string().optional().nullable(),
  // Kanal
  "channel-name": z.string().optional().nullable(),
  channelName: z.string().optional().nullable(),
  // Wohnung
  apartment: z.object({ id: z.number(), name: z.string().optional() }).optional(),
  "apartment-id": z.number().optional(),
}).passthrough(); // unbekannte Felder durchlassen statt fehler

type SmoobuReservation = z.infer<typeof SmoobuReservationSchema>;

// ─── Hilfsfunktion: Datum aus mehreren möglichen Feldnamen lesen ──────────────

function extractDate(res: SmoobuReservation, ...fields: string[]): Date | null {
  for (const field of fields) {
    const val = (res as Record<string, unknown>)[field];
    if (typeof val === "string" && val.length > 0) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function extractString(res: SmoobuReservation, ...fields: string[]): string | null {
  for (const field of fields) {
    const val = (res as Record<string, unknown>)[field];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return null;
}

// ─── Smoobu Adapter ───────────────────────────────────────────────────────────

export class SmoobuAdapter implements ChannelManagerAdapter {
  readonly name = "Smoobu";

  async fetchApartments(): Promise<NormalizedApartment[]> {
    const res = await fetch(`${SMOOBU_API_BASE}/apartments`, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Smoobu Apartments API ${res.status}: ${res.statusText}`);
    }

    const raw = await res.json();
    const items: unknown[] = raw.apartments ?? raw ?? [];

    return items
      .map((item) => {
        const parsed = SmoobuApartmentSchema.safeParse(item);
        if (!parsed.success) {
          console.warn("[SmoobuAdapter] Ungültige Apartment-Daten:", parsed.error.flatten());
          return null;
        }
        return { externalId: parsed.data.id, name: parsed.data.name };
      })
      .filter((a): a is NormalizedApartment => a !== null);
  }

  async fetchReservations(params: { from: string; to: string }): Promise<NormalizedReservation[]> {
    const url = new URL(`${SMOOBU_API_BASE}/reservations`);
    url.searchParams.set("from", params.from);
    url.searchParams.set("to", params.to);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("page", "1");

    const res = await fetch(url.toString(), { headers: getHeaders() });

    if (!res.ok) {
      throw new Error(`Smoobu Reservations API ${res.status}: ${res.statusText}`);
    }

    const raw = await res.json();

    // Debug: beim ersten Sync Felder loggen damit wir das Format kennen
    const bookings: unknown[] = raw.bookings ?? raw ?? [];
    if (bookings.length > 0) {
      console.log("[SmoobuAdapter] Beispiel-Buchung (Felder):", Object.keys(bookings[0] as object).join(", "));
      console.log("[SmoobuAdapter] Beispiel-Buchung (Daten):", JSON.stringify(bookings[0]));
    }

    const results: NormalizedReservation[] = [];

    for (const item of bookings) {
      const parsed = SmoobuReservationSchema.safeParse(item);
      if (!parsed.success) {
        console.warn("[SmoobuAdapter] Buchung übersprungen (Validierungsfehler):", parsed.error.flatten());
        continue;
      }

      const r = parsed.data;

      // Nur echte Buchungen, keine gesperrten Zeiträume
      if (r.type && r.type !== "reservation") continue;

      // Datum aus allen bekannten Feldnamen versuchen
      const checkIn = extractDate(r, "arrival", "check-in", "checkIn", "check_in");
      const checkOut = extractDate(r, "departure", "check-out", "checkOut", "check_out");

      if (!checkIn || !checkOut) {
        console.warn(
          `[SmoobuAdapter] Buchung ${r.id}: Datum nicht gefunden. Verfügbare Felder:`,
          Object.keys(r).join(", ")
        );
        continue;
      }

      const apartmentId = r.apartment?.id ?? r["apartment-id"];
      if (!apartmentId) {
        console.warn(`[SmoobuAdapter] Buchung ${r.id}: keine Apartment-ID`);
        continue;
      }

      results.push({
        externalId: r.id,
        apartmentExternalId: apartmentId,
        guestName: extractString(r, "guest-name", "guestName") ?? "Unbekannt",
        guestEmail: (r.email as string | null) ?? null,
        guestPhone: (r.phone as string | null) ?? null,
        guestCount: (r.adults ?? 1) + (r.children ?? 0),
        checkIn,
        checkOut,
        arrivalTime: extractString(r, "arrival-time", "arrivalTime"),
        departureTime: extractString(r, "departure-time", "departureTime"),
        channelName: extractString(r, "channel-name", "channelName"),
        status: "confirmed",
      });
    }

    return results;
  }
}
