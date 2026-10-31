import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { findPreviousDeparture, loadDepartureData, previousDepartureText, shortDayLabel } from "@/lib/departures";
import { resetDb, seedWorld } from "./fixtures";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("Abreise der Vorgäste", () => {
  const bookings = [
    { apartmentId: "L", checkIn: d("2026-11-01"), checkOut: d("2026-11-04") },
    { apartmentId: "L", checkIn: d("2026-11-04"), checkOut: d("2026-11-06") },
    { apartmentId: "P", checkIn: d("2026-11-01"), checkOut: d("2026-11-03") },
  ];

  it("gleicher Tag, Vortag, mehrere Tage, keine Vorgäste", () => {
    expect(findPreviousDeparture(bookings, "L", d("2026-11-04"))).toEqual({ day: "2026-11-04", daysBefore: 0 });
    expect(findPreviousDeparture(bookings, "L", d("2026-11-07"))).toEqual({ day: "2026-11-06", daysBefore: 1 });
    expect(findPreviousDeparture(bookings, "P", d("2026-11-06"))).toEqual({ day: "2026-11-03", daysBefore: 3 });
    expect(findPreviousDeparture(bookings, "P", d("2026-11-01"))).toBeNull();
    // länger als 30 Tage leer → keine Vorgäste
    expect(findPreviousDeparture(bookings, "P", d("2026-12-20"))).toBeNull();
  });

  it("Text für die Reinigungskraft", () => {
    expect(shortDayLabel("2026-11-04")).toBe("Mi 04.11.");
    expect(previousDepartureText({ day: "2026-11-04", daysBefore: 0 })).toBe("Mi 04.11. (gleicher Tag)");
    expect(previousDepartureText({ day: "2026-11-06", daysBefore: 1 })).toBe("Fr 06.11. (Vortag frei)");
    expect(previousDepartureText({ day: "2026-11-03", daysBefore: 3 })).toBe("Di 03.11. (3 Tage vorher frei)");
  });
});

describe("loadDepartureData", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
    await resetDb();
  });
  afterEach(() => vi.useRealTimers());

  it("liefert Abreisen beider Wohnungen ohne Gastnamen, ohne Stornos", async () => {
    const w = await seedWorld();
    const r = await loadDepartureData(w.org.id);
    expect(JSON.stringify(r.departures)).not.toMatch(/Berger|Huber|Wolf|Maier|Klein|Storno/);
    const days = r.departures.map((x) => `${x.day} ${x.apartmentName.split(" ")[0]}`);
    expect(days).toContain("2026-11-02 Lodge");
    expect(days).toContain("2026-11-04 Penthouse");
    expect(days).not.toContain("2026-11-12 Penthouse"); // storniert
    // Clara (Lodge, Anreise 05.11.) — Vorgäste Bernd reisen am 02.11. ab
    expect(r.previousDeparture(w.lodge.id, w.bookings.b3.checkIn)).toEqual({ day: "2026-11-02", daysBefore: 3 });
    expect(await prisma.booking.count()).toBeGreaterThan(0);
  });
});
