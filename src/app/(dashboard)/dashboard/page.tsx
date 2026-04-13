import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { UpcomingBookings } from "@/components/dashboard/UpcomingBookings";
import { WarningBanner } from "@/components/dashboard/WarningBanner";
import { SyncButton } from "@/components/dashboard/SyncButton";
import { WeekStrip } from "@/components/dashboard/WeekStrip";
import { CleaningToday } from "@/components/dashboard/CleaningToday";
import Link from "next/link";

const GERMAN_DAYS   = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
const GERMAN_MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");

  const orgId   = session.user.organizationId;
  const now     = new Date();
  const in7Days = addDays(now, 7);
  const in14Days = addDays(now, 14);
  const tomorrow = addDays(now, 1);

  const [
    activeNow,
    checkoutsWeek,
    checkinsWeek,
    nextBookings,
    problemBookingsRaw,
    weekBookings,
    cleaningAssignments,
  ] = await Promise.all([
    // Currently staying guests
    prisma.booking.count({
      where: {
        organizationId: orgId, status: "confirmed",
        checkIn: { lte: now }, checkOut: { gte: now },
      },
    }),
    // Checkouts this week
    prisma.booking.count({
      where: { organizationId: orgId, status: "confirmed", checkOut: { gte: now, lte: in7Days } },
    }),
    // Checkins this week
    prisma.booking.count({
      where: { organizationId: orgId, status: "confirmed", checkIn: { gte: now, lte: in7Days } },
    }),
    // Bookings checking out in the next 7 days
    prisma.booking.findMany({
      where: { organizationId: orgId, status: "confirmed", checkOut: { gte: now, lte: in7Days } },
      orderBy: { checkOut: "asc" },
      include: { apartment: true, cleaningAssignment: { include: { cleaner: true } } },
    }),
    // Problem bookings (upcoming with open cleaning or laundry)
    prisma.booking.findMany({
      where: {
        organizationId: orgId, status: "confirmed", checkIn: { gte: now, lte: in14Days },
        OR: [
          { cleaningAssignment: null },
          { cleaningAssignment: { status: "UNASSIGNED" } },
          { cleaningAssignment: { laundryStatus: "OPEN" } },
        ],
      },
      orderBy: { checkIn: "asc" },
      include: {
        apartment: { select: { name: true } },
        cleaningAssignment: { select: { status: true, laundryStatus: true } },
      },
    }),
    // Bookings for WeekStrip — broad 14-day window so client-side week calc works across timezones
    prisma.booking.findMany({
      where: {
        organizationId: orgId, status: "confirmed",
        checkIn: { lte: addDays(now, 14) }, checkOut: { gte: addDays(now, -7) },
      },
      include: { apartment: { select: { name: true, color: true } } },
    }),
    // Today's + tomorrow's cleaning assignments
    prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        booking: {
          status: "confirmed",
          checkOut: { gte: startOfDay(now), lte: endOfDay(tomorrow) },
        },
      },
      orderBy: { booking: { checkOut: "asc" } },
      include: {
        cleaner: { select: { name: true } },
        booking: {
          select: {
            guestName: true,
            departureTime: true,
            apartment: { select: { name: true, color: true } },
          },
        },
      },
    }),
  ]);

  // Dreher detection: same apartment, checkout and checkin on same day
  const dreherBookingIds = new Set<string>();
  for (const a of nextBookings) {
    const aOut = a.checkOut.toISOString().slice(0, 10);
    for (const b of nextBookings) {
      if (a.id !== b.id && a.apartmentId === b.apartmentId) {
        if (b.checkIn.toISOString().slice(0, 10) === aOut) {
          dreherBookingIds.add(a.id);
          dreherBookingIds.add(b.id);
        }
      }
    }
  }

  const problemBookings = problemBookingsRaw.map((b) => ({
    id: b.id,
    guestName: b.guestName,
    checkIn: b.checkIn,
    apartment: b.apartment,
    cleaningUnassigned: b.cleaningAssignment?.status === "UNASSIGNED",
    laundryOpen: b.cleaningAssignment?.laundryStatus === "OPEN",
  }));

  const dateStr = `${GERMAN_DAYS[now.getDay()]}, ${now.getDate()}. ${GERMAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const initials = (session.user.name ?? "V17")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <div style={{ color: "rgba(255,255,255,0.95)" }}>
        {/* Header */}
        <div
          className="flex items-start justify-between mb-5"
          style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0s" }}
        >
          <div>
            <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, color: "rgba(255,255,255,0.95)" }}>
              Vils17
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{dateStr}</p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <SyncButton />
            <div
              style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "linear-gradient(135deg, #0D9488, #0F766E)",
                border: "2px solid rgba(255,255,255,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0,
              }}
            >
              {initials}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Stats — 3 Karten */}
          <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.05s", opacity: 0 }}>
            <StatsCards
              activeNow={activeNow}
              checkoutsWeek={checkoutsWeek}
              checkinsWeek={checkinsWeek}
            />
          </div>

          {/* Warnungen */}
          {problemBookings.length > 0 && (
            <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.08s", opacity: 0 }}>
              <WarningBanner bookings={problemBookings} />
            </div>
          )}

          {/* Wochenkalender */}
          <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.1s", opacity: 0 }}>
            <WeekStrip bookings={weekBookings} />
          </div>

          {/* Buchungen */}
          <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.15s", opacity: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{
                fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.8px", color: "rgba(255,255,255,0.35)",
              }}>
                Buchungen
              </p>
              <Link href="/bookings" style={{ fontSize: 12, fontWeight: 600, color: "#14B8A6", textDecoration: "none" }}>
                Alle →
              </Link>
            </div>
            <UpcomingBookings bookings={nextBookings} dreherIds={dreherBookingIds} />
          </div>

          {/* Reinigung heute */}
          <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.2s", opacity: 0 }}>
            <CleaningToday assignments={cleaningAssignments} />
          </div>
        </div>
      </div>
    </>
  );
}
