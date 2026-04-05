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
  // type: "reservation" | "cancellation" | "blocked"
  type: z.string().optional(),
  "is-blocked-booking": z.boolean().optional(),
  // Datum: Smoobu nutzt "arrival" und "departure"
  arrival: z.string().optional(),
  departure: z.string().optional(),
  // check-in/check-out sind bei Smoobu UHRZEITEN (meist leer), keine Daten
  "check-in": z.string().optional().nullable(),
  "check-out": z.string().optional().nullable(),
  // Gast
  "guest-name": z.string().optional().nullable(),
  firstname: z.string().optional().nullable(),
  lastname: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  adults: z.number().optional().nullable(),
  children: z.number().optional().nullable(),
  // Kanal (verschachteltes Objekt)
  channel: z.object({
    id: z.number().optional(),
    name: z.string().optional(),
  }).optional().nullable(),
  // Preis
  price: z.number().optional().nullable(),
  // Notizen
  notice: z.string().optional().nullable(),
  // Wohnung
  apartment: z.object({ id: z.number(), name: z.string().optional() }).optional(),
}).passthrough();

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

      // Stornierungen und gesperrte Zeiträume überspringen
      if (r.type === "blocked" || r.type === "cancellation") continue;
      if (r["is-blocked-booking"] === true) continue;

      // Datum: Smoobu nutzt "arrival" und "departure"
      // check-in/check-out sind Uhrzeiten (meist leer) – NICHT für Datum verwenden
      const checkIn = extractDate(r, "arrival");
      const checkOut = extractDate(r, "departure");

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

      // Kanalname aus dem verschachtelten channel-Objekt
      const channelName = r.channel?.name ?? null;

      results.push({
        externalId: r.id,
        apartmentExternalId: apartmentId,
        guestName: extractString(r, "guest-name", "firstname") ?? "Unbekannt",
        guestEmail: (r.email as string | null) ?? null,
        guestPhone: (r.phone as string | null) ?? null,
        guestCount: ((r.adults as number) ?? 1) + ((r.children as number) ?? 0),
        checkIn,
        checkOut,
        // check-in/check-out sind bei Smoobu die Uhrzeiten
        arrivalTime: extractString(r, "check-in") || null,
        departureTime: extractString(r, "check-out") || null,
        channelName,
        status: "confirmed",
      });
    }

    return results;
  }
}
