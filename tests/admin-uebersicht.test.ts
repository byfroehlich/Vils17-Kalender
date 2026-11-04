import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadWeek, splitTodoLabel, todoAction, type TodoItem } from "@/lib/todo";
import { loadOccupancy, occupiedNights } from "@/lib/occupancy";
import { resetDb, seedWorld } from "./fixtures";

// Neue Admin-Übersicht (Entscheidung Mathias 01.11.2026): Zeilen mit Knopf, Belegung des Monats,
// „Diese Woche“ mit Saugroboter und unbestätigter Gästezahl.

const mk = (p: Partial<TodoItem>): TodoItem => ({ key: "k", kind: "mangel", severity: "amber", date: null, label: "x", href: "/", ...p });
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("Knöpfe und Zeilen", () => {
  it("benennt den Knopf je Art", () => {
    expect(todoAction(mk({ kind: "absage", severity: "red" }))).toBe("Zuweisen");
    expect(todoAction(mk({ kind: "ohne_reinigung" }))).toBe("Zuweisen");
    expect(todoAction(mk({ kind: "gaestezahl" }))).toBe("Klären");
    expect(todoAction(mk({ kind: "waesche", key: "waesche-bestellen" }))).toBe("Bestellen");
    expect(todoAction(mk({ kind: "waesche", key: "waesche-bestand", severity: "neutral" }))).toBe("Erfassen");
    expect(todoAction(mk({ kind: "mangel" }))).toBe("Ansehen");
    expect(todoAction(mk({ kind: "hinweis" }))).toBe("Prüfen");
    expect(todoAction(mk({ kind: "chat" }))).toBe("Antworten");
    expect(todoAction(mk({ kind: "hundegebuehr", severity: "amber" }))).toBe("Anfordern");
    expect(todoAction(mk({ kind: "hundegebuehr", severity: "neutral" }))).toBe("Ansehen");
  });

  it("teilt „Titel – Zusatz“ in zwei Zeilen", () => {
    expect(splitTodoLabel("Absage: Penthouse Fr 06.11. (Kerstin) – neue Reinigungskraft nötig")).toEqual({ title: "Absage: Penthouse Fr 06.11. (Kerstin)", sub: "neue Reinigungskraft nötig" });
    expect(splitTodoLabel("Gästezahl unbekannt: Lodge Mi 04.11.")).toEqual({ title: "Gästezahl unbekannt: Lodge Mi 04.11.", sub: null });
  });
});

describe("Belegung", () => {
  it("zählt Nächte: Anreisetag belegt, Abreisetag frei, Monatsgrenzen beachtet", () => {
    const n = occupiedNights([{ checkIn: d("2026-10-30"), checkOut: d("2026-11-02") }, { checkIn: d("2026-11-29"), checkOut: d("2026-12-03") }], d("2026-11-01"), 30);
    expect(n.slice(0, 3)).toEqual([true, false, false]); // 1.11. belegt, 2.11. Abreise frei
    expect(n[28]).toBe(true);  // 29.11.
    expect(n[29]).toBe(true);  // 30.11.
    expect(n.filter(Boolean).length).toBe(3);
  });

  it("lädt beide Wohnungen für den laufenden Monat, nur bestätigte Buchungen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
    await resetDb();
    const world = await seedWorld();
    const occ = await loadOccupancy(world.org.id);
    vi.useRealTimers();
    expect(occ.days).toBe(31);
    expect(occ.todayIndex).toBe(29);
    expect(occ.apartments.map((a) => a.name).sort()).toEqual(["Lodge", "Penthouse"]);
    for (const a of occ.apartments) {
      expect(a.nights.length).toBe(31);
      expect(a.booked).toBe(a.nights.filter(Boolean).length);
    }
  });
});

describe("Diese Woche – Zusatzangaben", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("markiert Saugroboter bei Abreise und unbestätigte Gästezahl bei Anreise", async () => {
    await resetDb();
    const world = await seedWorld();
    await prisma.apartment.updateMany({ where: { organizationId: world.org.id }, data: { dreameEnabled: true } });
    await prisma.booking.updateMany({ where: { organizationId: world.org.id }, data: { guestCountUnknown: true, guestCountManual: false } });
    const week = await loadWeek(world.org.id);
    const entries = week.flatMap((x) => x.entries);
    const ab = entries.filter((e) => e.type === "abreise");
    const an = entries.filter((e) => e.type === "anreise");
    expect(ab.length + an.length).toBeGreaterThan(0);
    for (const e of ab) expect(e.robot).toBe(true);
    for (const e of an) expect(e.guestsUnconfirmed).toBe(true);
  });
});
