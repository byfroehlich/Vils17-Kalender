import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "date-fns";

export async function getMyJobsData() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isCleaner = session.user.role === "CLEANER";
  const orgId = session.user.organizationId;
  const now = startOfDay(new Date());

  if (isCleaner) {
    // Wohnungen für die ich zuständig bin — zwei Quellen, damit die Kontrollansicht
    // nicht ausgerechnet dann blind wird, wenn die feste Zuweisung verdreht ist:
    //   1. fest zugewiesen (Einstellungen → Wohnungszuweisung)
    //   2. Wohnungen in denen ich schon abgesagt habe — dort war ich zuständig
    // Bewusst NICHT "wo ich irgendeinen Auftrag habe": eine einmalige Aushilfe in
    // einer fremden Wohnung würde sonst deren komplette Planung als "übernommen"
    // in die eigene Absagen-Liste spülen.
    const [preferredApts, declinedIn] = await Promise.all([
      prisma.apartment.findMany({
        where: { organizationId: orgId, preferredCleanerId: session.user.id },
        select: { id: true, name: true },
      }),
      prisma.cleaningAssignment.findMany({
        where: { organizationId: orgId, declinedById: session.user.id },
        select: { booking: { select: { apartmentId: true } } },
      }),
    ]);

    const myAptIds = Array.from(
      new Set([
        ...preferredApts.map((a) => a.id),
        ...declinedIn.map((a) => a.booking.apartmentId),
      ])
    );

    const myAssignmentsRaw = await prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        booking: { status: "confirmed" },
        OR: [
          { cleanerId: session.user.id, status: { in: ["ASSIGNED", "COMPLETED"] } },
          // Eigene Absage (noch nicht übernommen)
          { cleanerId: session.user.id, status: "UNASSIGNED", cleanerUnavailable: true },
          // Von mir abgesagt — bleibt sichtbar, auch wenn jemand anderes übernommen hat
          { declinedById: session.user.id },
          // Absagen in MEINER Wohnung — sehe ich immer, egal wer abgesagt hat
          { cleanerUnavailable: true, booking: { apartmentId: { in: myAptIds } } },
          // Jobs in MEINER Wohnung, die aktuell jemand anderes hat (Absage, Claim
          // oder Admin-Zuweisung) — zur Kontrolle ob etwas verdreht wurde
          { status: "ASSIGNED", cleanerId: { not: session.user.id }, booking: { apartmentId: { in: myAptIds } } },
        ],
      },
      orderBy: { booking: { checkIn: "asc" } },
      include: {
        booking: { include: { apartment: true } },
        cleaner: { select: { name: true, cleanerRate: true } },
      },
    });

    // "takenByOther": Job gehört zu mir (Absage-Historie oder meine Wohnung),
    // ist aber aktuell bei jemand anderem → als "abgesagt" mit Info anzeigen
    const myAssignments = myAssignmentsRaw.map((a) => ({
      ...a,
      takenByOther:
        (a.declinedById === session.user.id && a.cleanerId !== session.user.id) ||
        (a.status === "ASSIGNED" &&
          a.cleanerId !== null &&
          a.cleanerId !== session.user.id &&
          myAptIds.includes(a.booking.apartmentId)),
      // Fremde Absage in meiner Wohnung — kann von mir übernommen werden
      foreignDecline: a.cleanerUnavailable && a.cleanerId !== session.user.id,
    }));

    const openAssignments = await prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        status: "UNASSIGNED",
        booking: { status: "confirmed", checkIn: { gte: now } },
        // Nicht als "offen" zeigen: eigene Absagen und Absagen in meiner Wohnung
        // (beide erscheinen unter "Abgesagt"). Fremde Absagen in anderen
        // Wohnungen erscheinen hier schlicht als freier Job.
        NOT: [
          { cleanerId: session.user.id, cleanerUnavailable: true },
          { cleanerUnavailable: true, booking: { apartmentId: { in: myAptIds } } },
        ],
      },
      orderBy: { booking: { checkIn: "asc" } },
      include: {
        booking: { include: { apartment: true } },
      },
    });

    const enriched = await enrichWithNextGuests(orgId, myAssignments, openAssignments);

    return {
      myAssignments: enriched.my,
      openAssignments: enriched.open,
      isCleaner: true as const,
      userName: session.user.name ?? "",
      // Offizielle Wohnungszuweisung — wird in der Liste angezeigt, damit eine
      // fehlende oder falsche Zuweisung sofort auffällt statt still zu wirken
      myApartmentNames: preferredApts.map((a) => a.name),
    };
  }

  // Admin/Manager: alle Aufträge der Org
  const allAssignments = await prisma.cleaningAssignment.findMany({
    where: {
      organizationId: orgId,
      booking: { status: "confirmed" },
      OR: [
        { status: { in: ["ASSIGNED", "COMPLETED"] } },
        { status: "UNASSIGNED", cleanerUnavailable: true },
      ],
    },
    orderBy: { booking: { checkIn: "asc" } },
    include: {
      booking: { include: { apartment: true } },
      cleaner: { select: { name: true, cleanerRate: true } },
    },
  });

  const enriched = await enrichWithNextGuests(orgId, allAssignments, []);

  return {
    myAssignments: enriched.my,
    openAssignments: enriched.open as typeof allAssignments & { nextGuestCount: number | null }[],
    isCleaner: false as const,
    userName: session.user.name ?? "",
    myApartmentNames: [] as string[],
  };
}

async function enrichWithNextGuests<
  T extends { booking: { apartmentId: string; checkOut: Date } },
  U extends { booking: { apartmentId: string; checkOut: Date } },
>(orgId: string, my: T[], open: U[]) {
  const allAptIds = new Set([
    ...my.map((a) => a.booking.apartmentId),
    ...open.map((a) => a.booking.apartmentId),
  ]);

  if (allAptIds.size === 0) {
    return {
      my: my.map((a) => ({ ...a, nextGuestCount: null as number | null })),
      open: open.map((a) => ({ ...a, nextGuestCount: null as number | null })),
    };
  }

  // Alle zukünftigen Buchungen für die relevanten Wohnungen
  const futureBookings = await prisma.booking.findMany({
    where: {
      organizationId: orgId,
      status: "confirmed",
      apartmentId: { in: Array.from(allAptIds) },
    },
    select: { apartmentId: true, checkIn: true, guestCount: true },
    orderBy: { checkIn: "asc" },
  });

  function nextGuests(aptId: string, afterDate: Date): number | null {
    const found = futureBookings.find(
      (b) => b.apartmentId === aptId && new Date(b.checkIn) >= afterDate
    );
    return found?.guestCount ?? null;
  }

  return {
    my: my.map((a) => ({ ...a, nextGuestCount: nextGuests(a.booking.apartmentId, a.booking.checkOut) })),
    open: open.map((a) => ({ ...a, nextGuestCount: nextGuests(a.booking.apartmentId, a.booking.checkOut) })),
  };
}
