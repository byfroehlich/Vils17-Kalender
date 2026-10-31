import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { UpcomingBookings } from "@/components/dashboard/UpcomingBookings";
import { WarningBanner } from "@/components/dashboard/WarningBanner";
import { AbsagenBanner } from "@/components/dashboard/AbsagenBanner";
import { SyncButton } from "@/components/dashboard/SyncButton";
import { WeekStrip } from "@/components/dashboard/WeekStrip";
import { CleaningToday } from "@/components/dashboard/CleaningToday";
import { LaundryStockHint } from "@/components/dashboard/LaundryStockHint";
import { GuestCountBanner } from "@/components/dashboard/GuestCountBanner";
import { UNCONFIRMED_GUEST_COUNT } from "@/lib/guest-count";
import { loadLaundryPlan } from "@/lib/laundry-proposal";
import { laundryAlert, LAUNDRY_ALERT_DAYS, LAUNDRY_ALERT_SHORT_NOTICE_DAYS } from "@/lib/laundry-order";
import { laundryText, LAUNDRY_ITEMS } from "@/lib/laundry-quantity";
import { todayVienna, day } from "@/lib/mcp/format";
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

  const orgInfo = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { lastSyncAt: true },
  });

  const [
    activeNow,
    checkoutsToday,
    checkinsToday,
    nextBookings,
    problemBookingsRaw,
    weekBookings,
    cleaningAssignments,
    declinedAssignments,
  ] = await Promise.all([
    // Currently staying guests
    prisma.booking.count({
      where: {
        organizationId: orgId, status: "confirmed",
        checkIn: { lte: now }, checkOut: { gte: now },
      },
    }),
    // Checkouts today
    prisma.booking.count({
      where: { organizationId: orgId, status: "confirmed", checkOut: { gte: startOfDay(now), lte: endOfDay(now) } },
    }),
    // Checkins today
    prisma.booking.count({
      where: { organizationId: orgId, status: "confirmed", checkIn: { gte: startOfDay(now), lte: endOfDay(now) } },
    }),
    // Bookings checking out in the next 7 days
    prisma.booking.findMany({
      where: { organizationId: orgId, status: "confirmed", checkOut: { gte: now, lte: in7Days } },
      orderBy: { checkOut: "asc" },
      include: { apartment: true, cleaningAssignment: { include: { cleaner: true } } },
    }),
    // Problem bookings: anstehende Reinigung nicht organisiert. Wäsche zählt hier nicht —
    // sie läuft über den Bestand (Hinweis unten, Entscheidung Mathias 31.10.2026)
    prisma.booking.findMany({
      where: {
        organizationId: orgId, status: "confirmed", checkIn: { gte: now, lte: in14Days },
        OR: [
          { cleaningAssignment: null },
          { cleaningAssignment: { status: "UNASSIGNED", isSelfClean: false } },
        ],
      },
      orderBy: { checkIn: "asc" },
      include: {
        apartment: { select: { name: true } },
        cleaningAssignment: { select: { status: true } },
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
            id: true,
            guestName: true,
            departureTime: true,
            apartment: { select: { name: true, color: true } },
          },
        },
      },
    }),
    // Abgesagte Reinigungen (cleanerUnavailable) für zukünftige Buchungen
    prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        cleanerUnavailable: true,
        booking: { status: "confirmed", checkIn: { gte: startOfDay(now) } },
      },
      orderBy: { booking: { checkIn: "asc" } },
      include: {
        cleaner: { select: { name: true } },
        booking: {
          select: {
            id: true,
            checkIn: true,
            apartment: { select: { name: true } },
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
    cleaningUnassigned: !b.cleaningAssignment || b.cleaningAssignment.status === "UNASSIGNED",
  }));

  // Gästezahl unbekannt (Kanal lieferte keine) — alle kommenden Buchungen, bis geklärt
  const unconfirmedGuestCounts = await prisma.booking.findMany({
    where: { organizationId: orgId, status: "confirmed", checkOut: { gte: now }, ...UNCONFIRMED_GUEST_COUNT },
    orderBy: { checkIn: "asc" },
    select: { id: true, guestName: true, checkIn: true, channelName: true, guestCount: true, apartment: { select: { name: true } } },
  });

  // Wäsche nach Bestand: reicht es für die nächsten 14 Tage?
  const laundryHint = await (async () => {
    const today = todayVienna(now);
    const r = await loadLaundryPlan({ organizationId: orgId, today, days: LAUNDRY_ALERT_DAYS });
    const alert = laundryAlert(r.plan);
    if (alert.noStock) {
      return { headline: "Wäsche: Bestand im Keller noch nicht erfasst", detail: "Ohne Zählung lässt sich nicht sagen, ob die Wäsche reicht.", urgent: false };
    }
    if (!alert.orderNeeded) return null;
    const first = r.plan.firstShortage;
    const de = (d: Date) => day(d).split("-").reverse().slice(0, 2).join(".") + ".";
    const inDays = first ? Math.round((first.day.getTime() - today.getTime()) / 86_400_000) : null;
    const parts: string[] = [];
    if (alert.orderItems.length) parts.push(`Bestellen: ${laundryText(r.plan.order)}`);
    if (alert.shortItems.length) parts.push(`vor der nächsten Lieferung knapp: ${alert.shortItems.map((k) => LAUNDRY_ITEMS.find((i) => i.key === k)?.label ?? k).join(", ")}`);
    if (r.plan.unconfirmedArrivals) parts.push(`enthält ${r.plan.unconfirmedArrivals} unbestätigte Gästezahl${r.plan.unconfirmedArrivals === 1 ? "" : "en"} (volle Belegung angenommen)`);
    return {
      headline: first ? `Wäsche reicht nicht ab ${de(first.day)}` : "Wäsche reicht nicht für die nächsten 14 Tage",
      detail: parts.join(" · "),
      urgent: inDays !== null && inDays <= LAUNDRY_ALERT_SHORT_NOTICE_DAYS,
    };
  })();

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
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", marginTop: 3 }}>{dateStr}</p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <SyncButton lastSyncAt={orgInfo?.lastSyncAt?.toISOString() ?? null} />
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
              checkoutsToday={checkoutsToday}
              checkinsToday={checkinsToday}
            />
          </div>

          {/* Gästezahl unbekannt — ganz oben, rot */}
          {unconfirmedGuestCounts.length > 0 && (
            <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.06s", opacity: 0 }}>
              <GuestCountBanner bookings={unconfirmedGuestCounts} />
            </div>
          )}

          {/* Absagen-Warnung */}
          {declinedAssignments.length > 0 && (
            <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.07s", opacity: 0 }}>
              <AbsagenBanner assignments={declinedAssignments} />
            </div>
          )}

          {/* Warnungen */}
          {problemBookings.length > 0 && (
            <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.08s", opacity: 0 }}>
              <WarningBanner bookings={problemBookings} />
            </div>
          )}

          {/* Wäsche nach Bestand */}
          {laundryHint && (
            <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.09s", opacity: 0 }}>
              <LaundryStockHint {...laundryHint} />
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
                letterSpacing: "0.8px", color: "rgba(255,255,255,0.65)",
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
