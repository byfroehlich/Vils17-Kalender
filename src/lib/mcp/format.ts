// ─── Ausgabeformate der MCP-Tools ─────────────────────────────────────────────
// Geld: Zahl in Euro mit 2 Nachkommastellen UND Text ("1.234,50 €").
// Zeitpunkte: ISO 8601 mit Offset in Europe/Vienna. Buchungsdaten sind
// Kalendertage (in der DB UTC-Mitternacht) → "YYYY-MM-DD".

export const TZ = "Europe/Vienna";

export interface Money {
  betrag: number;
  text: string;
}

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function money(value: number): Money {
  const betrag = Math.round(value * 100) / 100;
  return { betrag, text: eur.format(betrag).replace(/ /g, " ") };
}

/** Kalendertag einer Buchung (UTC-Mitternacht gespeichert) → "2026-11-03" */
export function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "2026-11-03" → UTC-Mitternacht (Speicherformat der Buchungen) */
export function parseDay(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new Error(`Ungültiges Datum: ${s} (erwartet JJJJ-MM-TT)`);
  return d;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** Heutiger Kalendertag in Wien als UTC-Mitternacht */
export function todayVienna(now = new Date()): Date {
  return parseDay(new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now));
}

/** Zeitpunkt → ISO 8601 mit Wiener Offset, z.B. 2026-10-29T08:15:00+01:00 */
export function viennaIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "longOffset",
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  const offset = (parts.timeZoneName ?? "GMT").replace("GMT", "") || "+00:00";
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}${offset}`;
}

/** Nächte zwischen zwei Kalendertagen */
export function nightsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

/** Monatsschlüssel "2026-11" eines Kalendertags */
export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Kanal vereinheitlichen: Airbnb / Booking.com / Direkt */
export function channelGroup(name: string | null | undefined): "Airbnb" | "Booking.com" | "Direkt" {
  const n = (name ?? "").toLowerCase();
  if (n.includes("airbnb")) return "Airbnb";
  if (n.includes("booking")) return "Booking.com";
  return "Direkt";
}

// ─── Seitenweise Listen ───────────────────────────────────────────────────────
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

export function decodeCursor(cursor: string | undefined | null): number {
  if (!cursor) return 0;
  try {
    const o = JSON.parse(Buffer.from(cursor, "base64url").toString()).o;
    return Number.isInteger(o) && o >= 0 ? o : 0;
  } catch {
    return 0;
  }
}
