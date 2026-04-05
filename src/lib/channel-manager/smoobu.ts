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
    console.log("[SmoobuAdapter] Apartments raw response keys:", Object.keys(raw ?? {}));
    console.log("[SmoobuAdapter] Apartments raw response:", JSON.stringify(raw).slice(0, 500));

    // Smoobu gibt { apartments: [...] } zurück – explizit prüfen
    const items: unknown[] = Array.isArray(raw.apartments)
      ? raw.apartments
      : Array.isArray(raw)
        ? raw
        : [];

    if (items.length === 0) {
      console.warn("[SmoobuAdapter] Keine Apartments in der API-Antwort. Rohdaten:", JSON.stringify(raw).slice(0, 300));
    }

    return items
      .map((item) => {
        const parsed = SmoobuApartmentSchema.safeParse(item);
        if (!parsed.success) {
          console.warn("[SmoobuAdapter] Ungültige Apartment-Daten:", parsed.error.flatten(), "Item:", JSON.stringify(item));
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
    console.log("[SmoobuAdapter] Reservations raw response keys:", Object.keys(raw ?? {}));

    // Explizit prüfen ob raw.bookings ein Array ist
    const bookings: unknown[] = Array.isArray(raw.bookings)
      ? raw.bookings
      : Array.isArray(raw)
        ? raw
        : [];

    console.log(`[SmoobuAdapter] Buchungen gefunden: ${bookings.length}`);

    if (bookings.length === 0) {
      console.warn("[SmoobuAdapter] Keine Buchungen. Rohdaten:", JSON.stringify(raw).slice(0, 500));
    } else {
      const first = bookings[0] as Record<string, unknown>;
      console.log("[SmoobuAdapter] Erste Buchung - Felder:", Object.keys(first).join(", "));
      console.log("[SmoobuAdapter] Erste Buchung - type:", first.type, "| arrival:", first.arrival, "| check-in:", first["check-in"], "| departure:", first.departure, "| check-out:", first["check-out"]);
    }

    const results: NormalizedReservation[] = [];

    for (const item of bookings) {
      const parsed = SmoobuReservationSchema.safeParse(item);
      if (!parsed.success) {
        console.warn("[SmoobuAdapter] Buchung übersprungen (Validierungsfehler):", parsed.error.flatten());
        continue;
      }

      const r = parsed.data;

      // Nur gesperrte Zeiträume überspringen – alles andere verarbeiten
      if (r.type === "blocked") continue;

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
