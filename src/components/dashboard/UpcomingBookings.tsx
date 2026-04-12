import Link from "next/link";
import { differenceInCalendarDays, startOfDay } from "date-fns";

interface Booking {
  id: string;
  guestName: string;
  guestCount: number;
  checkIn: Date;
  checkOut: Date;
  arrivalTime?: string | null;
  departureTime?: string | null;
  apartment: { name: string; color?: string | null };
  cleaningAssignment?: {
    status: string;
    laundryStatus: string;
    cleaner?: { name: string } | null;
  } | null;
}

const MONTHS_SHORT = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

function fmtShort(d: Date): string {
  const dd = new Date(d);
  return `${dd.getDate()}. ${MONTHS_SHORT[dd.getMonth()]}`;
}

function bookingDateLabel(checkIn: Date, checkOut: Date): string {
  const nights = Math.max(1, differenceInCalendarDays(new Date(checkOut), new Date(checkIn)));
  return `${fmtShort(checkIn)} – ${fmtShort(checkOut)} · ${nights} ${nights === 1 ? "Nacht" : "Nächte"}`;
}

type StatusPill = { label: string; bg: string; color: string } | null;

function getDateStatus(checkIn: Date, checkOut: Date): StatusPill {
  const today    = startOfDay(new Date());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const inDay    = startOfDay(new Date(checkIn));
  const outDay   = startOfDay(new Date(checkOut));

  if (inDay <= today && outDay >= today) {
    return { label: "Aktiv", bg: "rgba(99,102,241,0.25)", color: "#a5b4fc" };
  }
  if (outDay.getTime() === today.getTime() || outDay.getTime() === tomorrow.getTime()) {
    return { label: "Checkout", bg: "rgba(245,158,11,0.22)", color: "#FCD34D" };
  }
  if (inDay.getTime() === today.getTime() || inDay.getTime() === tomorrow.getTime()) {
    return { label: "Check-in", bg: "rgba(16,185,129,0.22)", color: "#6ee7b7" };
  }
  return null;
}

type BadgeInfo = { bg: string; text: string; label: string };

const cleaningBadge: Record<string, BadgeInfo> = {
  UNASSIGNED: { bg: "rgba(239,68,68,0.18)",  text: "#FCA5A5", label: "⚠ Reinigung offen" },
  SELF_CLEAN: { bg: "rgba(13,148,136,0.18)", text: "#5EEAD4", label: "✓ Selbstreinigung" },
  ASSIGNED:   { bg: "rgba(13,148,136,0.18)", text: "#5EEAD4", label: "✓ Zugewiesen"      },
  COMPLETED:  { bg: "rgba(34,197,94,0.18)",  text: "#86EFAC", label: "✓ Erledigt"         },
};
const laundryBadge: Record<string, BadgeInfo> = {
  OPEN:      { bg: "rgba(239,68,68,0.18)",  text: "#FCA5A5", label: "⚠ Wäsche offen"    },
  ORDERED:   { bg: "rgba(245,158,11,0.18)", text: "#FCD34D", label: "◷ Wäsche bestellt"  },
  AVAILABLE: { bg: "rgba(34,197,94,0.18)",  text: "#86EFAC", label: "✓ Wäsche vorhanden" },
};

function SmallBadge({ bg, text, label }: BadgeInfo) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 9px", borderRadius: 20,
      background: bg, color: text,
      fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" as const,
    }}>
      {label}
    </span>
  );
}

const glass = {
  background: "rgba(255,255,255,0.1)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 18,
  boxShadow: "0 4px 20px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.12)",
} as React.CSSProperties;

export function UpcomingBookings({ bookings, dreherIds }: { bookings: Booking[]; dreherIds: Set<string> }) {
  if (bookings.length === 0) {
    return (
      <div style={{ ...glass, padding: "36px 24px", textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Keine Buchungen in den nächsten Tagen</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bookings.map((booking) => {
        const assignment     = booking.cleaningAssignment;
        const cleaningStatus = assignment?.status ?? "UNASSIGNED";
        const laundryStatus  = assignment?.laundryStatus ?? "OPEN";
        const isDreher       = dreherIds.has(booking.id);
        const cb             = cleaningBadge[cleaningStatus];
        const lb             = laundryBadge[laundryStatus];
        const datePill       = getDateStatus(booking.checkIn, booking.checkOut);

        return (
          <Link key={booking.id} href={`/bookings/${booking.id}`} style={{ display: "block", textDecoration: "none" }}>
            <div style={{ ...glass, padding: "14px 16px", display: "flex", alignItems: "stretch", gap: 12, transition: "border-color 0.15s" }}>
              {/* Apartment color bar */}
              <div style={{
                width: 4, borderRadius: 4, flexShrink: 0,
                backgroundColor: booking.apartment.color ?? "#18181b",
                alignSelf: "stretch",
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Dreher alert */}
                {isDreher && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(239,68,68,0.15)",
                    border: "1px solid rgba(239,68,68,0.35)",
                    borderRadius: 10, padding: "4px 10px", marginBottom: 8,
                  }}>
                    <span style={{ fontSize: 13 }}>⚡</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#FCA5A5" }}>
                      Nur 5 Stunden Wechselzeit — Abreise &amp; Anreise gleicher Tag!
                    </span>
                  </div>
                )}

                {/* Row 1: Guest name + date status pill */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.2, minWidth: 0 }}>
                    {booking.guestName}
                  </span>
                  {datePill && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                      padding: "3px 10px", borderRadius: 20,
                      background: datePill.bg, color: datePill.color,
                    }}>
                      {datePill.label}
                    </span>
                  )}
                </div>

                {/* Row 2: Date range + nights */}
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>
                  {bookingDateLabel(booking.checkIn, booking.checkOut)}
                </p>

                {/* Row 3: Apartment name */}
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
                  {booking.apartment.name}
                  {booking.departureTime && (
                    <span style={{ color: "rgba(255,255,255,0.25)" }}> · bis {booking.departureTime} Uhr</span>
                  )}
                </p>

                {/* Row 4: Status badges */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
                  {cb && (
                    <SmallBadge
                      bg={cb.bg}
                      text={cb.text}
                      label={
                        (cleaningStatus === "ASSIGNED" || cleaningStatus === "COMPLETED") && assignment?.cleaner?.name
                          ? `${cb.label} · ${assignment.cleaner.name}`
                          : cb.label
                      }
                    />
                  )}
                  {lb && <SmallBadge {...lb} />}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
