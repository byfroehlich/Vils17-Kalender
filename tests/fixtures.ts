import { prisma } from "@/lib/prisma";
import { generateToken, type Scope } from "@/lib/mcp/tokens";

/** Leert alle Tabellen (Reihenfolge wegen Fremdschlüsseln egal dank CASCADE). */
export async function resetDb() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  );
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`
    );
  }
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

/**
 * Kleine, realistische Testwelt:
 *  - Lodge (Kerstin), Penthouse (Vanessa, 70 € ab 01.10.2026)
 *  - Buchungen über Airbnb, Booking.com und direkt, eine storniert
 */
export async function seedWorld() {
  const org = await prisma.organization.create({
    data: { name: "Vils17", slug: "vils17", lastSyncAt: new Date("2026-10-29T07:00:00Z") },
  });
  const admin = await prisma.user.create({
    data: { organizationId: org.id, name: "Mathias", email: "m@test.at", passwordHash: "x", role: "ADMIN" },
  });
  const vanessa = await prisma.user.create({
    data: { organizationId: org.id, name: "Vanessa", email: "v@test.at", passwordHash: "x", role: "CLEANER", cleanerRate: 50 },
  });
  const kerstin = await prisma.user.create({
    data: { organizationId: org.id, name: "Kerstin", email: "k@test.at", passwordHash: "x", role: "CLEANER", cleanerRate: 50 },
  });
  const lodge = await prisma.apartment.create({
    data: {
      organizationId: org.id, name: "Lodge No. 17 - Vils", smoobuId: 101, active: true,
      preferredCleanerId: kerstin.id, laundryBedsDivisor: 2, laundryTowelsPerGuest: 2, laundryKitchenCount: 1,
    },
  });
  const penthouse = await prisma.apartment.create({
    data: {
      organizationId: org.id, name: "Penthouse No. 17 - Vils", smoobuId: 102, active: true,
      preferredCleanerId: vanessa.id, cleaningRate: 70, cleaningRateCleanerId: vanessa.id,
      cleaningRateFrom: d("2026-10-01"),
    },
  });

  const mk = (o: {
    apt: string; guest: string; ci: string; co: string; n: number; ch: string | null;
    price: number | null; status?: string; pets?: number; premium?: boolean;
  }) =>
    prisma.booking.create({
      data: {
        organizationId: org.id, apartmentId: o.apt, guestName: o.guest, guestCount: o.n,
        checkIn: d(o.ci), checkOut: d(o.co), channelName: o.ch, price: o.price,
        status: o.status ?? "confirmed", petCount: o.pets ?? null, arrivalTime: "15:00", departureTime: "10:00",
        ...(o.premium ? { premiumRate: 70, premiumRateCleanerId: vanessa.id } : {}),
      },
    });

  // Lodge: Oktober + November
  const b1 = await mk({ apt: lodge.id, guest: "Anna Berger", ci: "2026-10-03", co: "2026-10-06", n: 2, ch: "Airbnb", price: 450 });
  const b2 = await mk({ apt: lodge.id, guest: "Bernd Huber", ci: "2026-10-30", co: "2026-11-02", n: 4, ch: "Booking.com", price: 600, pets: 1 });
  const b3 = await mk({ apt: lodge.id, guest: "Clara Wolf", ci: "2026-11-05", co: "2026-11-08", n: 3, ch: null, price: 390 });
  // Penthouse
  const b4 = await mk({ apt: penthouse.id, guest: "Dieter Maier", ci: "2026-10-10", co: "2026-10-12", n: 2, ch: "Airbnb", price: 300 });
  const b5 = await mk({ apt: penthouse.id, guest: "Eva Klein", ci: "2026-11-01", co: "2026-11-04", n: 5, ch: "Booking.com", price: 750, premium: true });
  const b6 = await mk({ apt: penthouse.id, guest: "Frank Storno", ci: "2026-11-10", co: "2026-11-12", n: 2, ch: "Airbnb", price: 280, status: "cancelled" });

  // Reinigungen
  await prisma.cleaningAssignment.create({ data: { organizationId: org.id, bookingId: b1.id, cleanerId: kerstin.id, status: "COMPLETED", rate: 50, paidOut: true, paidOutAt: new Date("2026-10-20T10:00:00Z") } });
  await prisma.cleaningAssignment.create({ data: { organizationId: org.id, bookingId: b4.id, cleanerId: vanessa.id, status: "COMPLETED", rate: 50 } });
  await prisma.cleaningAssignment.create({ data: { organizationId: org.id, bookingId: b2.id, cleanerId: kerstin.id, status: "ASSIGNED" } });
  await prisma.cleaningAssignment.create({ data: { organizationId: org.id, bookingId: b3.id, status: "UNASSIGNED" } });
  await prisma.cleaningAssignment.create({
    data: { organizationId: org.id, bookingId: b5.id, cleanerId: vanessa.id, status: "UNASSIGNED", cleanerUnavailable: true, cleanerUnavailableNote: "krank", declinedById: vanessa.id },
  });

  return { org, admin, vanessa, kerstin, lodge, penthouse, bookings: { b1, b2, b3, b4, b5, b6 } };
}

export async function createToken(organizationId: string, scopes: Scope[], name = "Test") {
  const t = generateToken();
  await prisma.mcpToken.create({
    data: { organizationId, name, hash: t.hash, prefix: t.prefix, scopes },
  });
  return t.token;
}
