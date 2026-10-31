import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadTodos, loadWeek, sortTodos, type TodoItem } from "@/lib/todo";
import { DEFAULT_RESERVE } from "@/lib/laundry-order";
import { resetDb, seedWorld } from "./fixtures";

let world: Awaited<ReturnType<typeof seedWorld>>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  await resetDb();
  world = await seedWorld();
});
afterEach(() => vi.useRealTimers());

describe("Zu erledigen", () => {
  it("sortiert rot → bernstein → neutral, dann nach Termin", () => {
    const mk = (key: string, severity: TodoItem["severity"], date: string | null): TodoItem => ({ key, kind: "mangel", severity, date, label: key, href: "/" });
    const r = sortTodos([mk("n", "neutral", "2026-11-01"), mk("a2", "amber", null), mk("a1", "amber", "2026-11-03"), mk("r", "red", "2026-11-20")]);
    expect(r.map((i) => i.key)).toEqual(["r", "a1", "a2", "n"]);
  });

  it("sammelt Absagen, Reinigungen ohne Kraft, Gästezahl, Mängel, Hinweise, Hundegebühr, Wäsche", async () => {
    await prisma.booking.update({ where: { id: world.bookings.b3.id }, data: { guestCountUnknown: true } });
    await prisma.issue.create({ data: { organizationId: world.org.id, apartmentId: world.lodge.id, kind: "DAMAGE", text: "Abfluss: Dusche läuft langsam ab", photoType: "image/jpeg" } });
    await prisma.issue.create({ data: { organizationId: world.org.id, apartmentId: world.penthouse.id, kind: "SUPPLY", text: "Spülmittel" } });
    await prisma.noteSuggestion.create({ data: { organizationId: world.org.id, bookingId: world.bookings.b3.id, messageId: "m1", proposedText: "Kinderbett", excerpt: "…" } });

    const r = await loadTodos(world.org.id, { withChats: false });
    const kinds = r.items.map((i) => i.kind);
    // b5: Absage Vanessa (Penthouse 01.11.) → rot, ganz oben
    expect(r.items[0]!.kind).toBe("absage");
    expect(r.items[0]!.severity).toBe("red");
    expect(r.items[0]!.label).toMatch(/Penthouse So 01\.11\. \(Vanessa\)/);
    // b3: Lodge 05.11. ohne Reinigungskraft (nicht doppelt als Absage)
    expect(r.items.filter((i) => i.kind === "ohne_reinigung").map((i) => i.href)).toEqual([`/bookings/${world.bookings.b3.id}`]);
    expect(kinds).toContain("gaestezahl");
    const drain = r.items.find((i) => i.label.startsWith("Abfluss"))!;
    expect(drain.photo).toBe(true);
    expect(drain.severity).toBe("amber");
    expect(r.items.find((i) => i.label.startsWith("Einkauf"))!.severity).toBe("neutral");
    expect(r.items.find((i) => i.kind === "hinweis")!.href).toBe("/messages#hinweise");
    // b2: Booking.com mit Hund, nicht angefordert
    expect(r.items.find((i) => i.kind === "hundegebuehr")!.label).toMatch(/anfordern/);
    // Ohne Kellerbestand: Hinweis „Bestand erfassen“
    expect(r.items.find((i) => i.kind === "waesche")!.label).toMatch(/Bestand im Keller erfassen/);
  });

  it("leer → keine Punkte", async () => {
    await resetDb();
    const org = await prisma.organization.create({ data: { name: "Leer", slug: "leer" } });
    await prisma.laundryCount.create({ data: { organizationId: org.id, countedOn: new Date("2026-10-29T00:00:00Z"), quantities: { ...DEFAULT_RESERVE } } });
    const r = await loadTodos(org.id, { withChats: false });
    expect(r.items).toEqual([]);
  });
});

describe("Diese Woche", () => {
  it("An- und Abreisen der nächsten 7 Tage mit Reinigungskraft und Hinweis", async () => {
    await prisma.cleaningAssignment.update({ where: { bookingId: world.bookings.b2.id }, data: { notes: "Kinderbett" } });
    const week = await loadWeek(world.org.id);
    expect(week).toHaveLength(7);
    expect(week[0]!.label).toBe("Heute");
    const today = week[0]!.entries;
    const arr = today.find((e) => e.type === "anreise" && e.bookingId === world.bookings.b2.id)!;
    expect(arr.cleaner).toBe("Kerstin");
    expect(arr.hasNote).toBe(true);
    const nov2 = week.find((d) => d.day === "2026-11-02")!;
    expect(nov2.entries.some((e) => e.type === "abreise" && e.apartmentName === "Lodge")).toBe(true);
    // Storno taucht nicht auf
    expect(week.flatMap((d) => d.entries).some((e) => e.bookingId === world.bookings.b6.id)).toBe(false);
  });
});
