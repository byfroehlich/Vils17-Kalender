import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { UpcomingBookings } from "@/components/dashboard/UpcomingBookings";
import { WarningBanner } from "@/components/dashboard/WarningBanner";
import { SyncButton } from "@/components/dashboard/SyncButton";

const GERMAN_DAYS   = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
const GERMAN_MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");
  // MANAGER darf Dashboard sehen

  const orgId = session.user.organizationId;
  const now = new Date();
  const in7Days  = addDays(now, 7);
  const in14Days = addDays(now, 14);

  const [upcomingCheckouts, upcomingCheckins, openCleanings, openLaundry, nextBookings, problemBookingsRaw] =
    await Promise.all([
      prisma.booking.count({
        where: { organizationId: orgId, status: "confirmed", checkOut: { gte: now, lte: in7Days } },
      }),
      prisma.booking.count({
        where: { organizationId: orgId, status: "confirmed", checkIn: { gte: now, lte: in7Days } },
      }),
      prisma.booking.count({
        where: {
          organizationId: orgId, status: "confirmed", checkOut: { gte: now, lte: in7Days },
          OR: [{ cleaningAssignment: { status: "UNASSIGNED" } }, { cleaningAssignment: null }],
        },
      }),
      prisma.booking.count({
        where: {
          organizationId: orgId, status: "confirmed", checkOut: { gte: now, lte: in14Days },
          OR: [{ cleaningAssignment: { laundryStatus: "OPEN" } }, { cleaningAssignment: null }],
        },
      }),
      prisma.booking.findMany({
        where: { organizationId: orgId, status: "confirmed", checkOut: { gte: now } },
        orderBy: { checkOut: "asc" },
        take: 10,
        include: { apartment: true, cleaningAssignment: { include: { cleaner: true } } },
      }),
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
    ]);

  // Dreher-Erkennung: gleiche Wohnung, Abreise und Anreise am selben Tag
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

  return (
    <>
      {/* Hintergrund-Gradient */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background: [
            "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(13,148,136,0.4) 0%, transparent 60%)",
            "radial-gradient(ellipse 60% 50% at 80% 20%, rgba(15,118,110,0.3) 0%, transparent 55%)",
            "radial-gradient(ellipse 70% 60% at 50% 80%, rgba(20,184,166,0.2) 0%, transparent 60%)",
            "linear-gradient(160deg, #020f0e 0%, #041f1c 40%, #051a18 100%)",
          ].join(", "),
        }}
      />

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
              V17
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Stats */}
          <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.05s", opacity: 0 }}>
            <StatsCards
              upcomingCheckouts={upcomingCheckouts}
              upcomingCheckins={upcomingCheckins}
              openCleanings={openCleanings}
              openLaundry={openLaundry}
            />
          </div>

          {/* Warnungen */}
          {problemBookings.length > 0 && (
            <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.1s", opacity: 0 }}>
              <WarningBanner bookings={problemBookings} />
            </div>
          )}

          {/* Buchungen */}
          <div style={{ animation: "fadeUp 0.4s ease forwards", animationDelay: "0.15s", opacity: 0 }}>
            <p style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.8px", color: "rgba(255,255,255,0.35)", marginBottom: 10,
            }}>
              Nächste Buchungen
            </p>
            <UpcomingBookings bookings={nextBookings} dreherIds={dreherBookingIds} />
          </div>
        </div>
      </div>
    </>
  );
}
