import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Users } from "lucide-react";

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

const glass = {
  background: "rgba(255,255,255,0.1)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 20,
  boxShadow: "0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.15)",
} as React.CSSProperties;

type BadgeInfo = { bg: string; text: string; label: string };

const cleaningBadge: Record<string, BadgeInfo> = {
  UNASSIGNED: { bg: "rgba(239,68,68,0.18)",   text: "#FCA5A5", label: "⚠ Reinigung offen"  },
  SELF_CLEAN: { bg: "rgba(13,148,136,0.18)",  text: "#5EEAD4", label: "✓ Selbstreinigung"  },
  ASSIGNED:   { bg: "rgba(13,148,136,0.18)",  text: "#5EEAD4", label: "✓ Zugewiesen"        },
  COMPLETED:  { bg: "rgba(34,197,94,0.18)",   text: "#86EFAC", label: "✓ Erledigt"          },
};

const laundryBadge: Record<string, BadgeInfo> = {
  OPEN:      { bg: "rgba(239,68,68,0.18)",   text: "#FCA5A5", label: "⚠ Wäsche offen"    },
  ORDERED:   { bg: "rgba(245,158,11,0.18)",  text: "#FCD34D", label: "◷ Wäsche bestellt"  },
  AVAILABLE: { bg: "rgba(34,197,94,0.18)",   text: "#86EFAC", label: "✓ Wäsche vorhanden" },
};

function Badge({ bg, text, label }: BadgeInfo) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "4px 10px", borderRadius: 20,
      background: bg, color: text,
      fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" as const,
    }}>
      {label}
    </span>
  );
}

export function UpcomingBookings({ bookings, dreherIds }: { bookings: Booking[]; dreherIds: Set<string> }) {
  if (bookings.length === 0) {
    return (
      <div style={{ ...glass, padding: "40px 24px", textAlign: "center" }}>
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
        const cb = cleaningBadge[cleaningStatus];
        const lb = laundryBadge[laundryStatus];

        return (
          <Link key={booking.id} href={`/bookings/${booking.id}`} style={{ display: "block", textDecoration: "none" }}>
            <div style={{ ...glass, padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 14, transition: "border-color 0.15s" }}>
              {/* Apartment-Farbbalken */}
              <div style={{
                width: 4, alignSelf: "stretch", borderRadius: 4, flexShrink: 0,
                backgroundColor: booking.apartment.color ?? "#18181b",
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Dreher-Alert */}
                {isDreher && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(239,68,68,0.18)",
                    border: "1px solid rgba(239,68,68,0.4)",
                    borderRadius: 10, padding: "5px 10px", marginBottom: 10,
                  }}>
                    <span style={{ fontSize: 14 }}>⚡</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#FCA5A5" }}>
                      Nur 5 Stunden Wechselzeit — Abreise &amp; Anreise gleicher Tag!
                    </span>
                  </div>
                )}

                {/* Name + Wohnung */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6, flexWrap: "wrap" as const }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.2 }}>
                    {booking.guestName}
                  </span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>
                    {booking.apartment.name}
                  </span>
                </div>

                {/* Personen + Datum */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 10, flexWrap: "wrap" as const }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Users style={{ width: 13, height: 13 }} />
                    {booking.guestCount} {booking.guestCount === 1 ? "Person" : "Personen"}
                  </span>
                  <span>
                    {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}
                    {booking.departureTime && (
                      <span style={{ color: "rgba(255,255,255,0.3)" }}> bis {booking.departureTime}</span>
                    )}
                  </span>
                </div>

                {/* Status Badges */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {cb && (
                    <Badge
                      bg={cb.bg}
                      text={cb.text}
                      label={
                        (cleaningStatus === "ASSIGNED" || cleaningStatus === "COMPLETED") && assignment?.cleaner?.name
                          ? `${cb.label} · ${assignment.cleaner.name}`
                          : cb.label
                      }
                    />
                  )}
                  {lb && <Badge {...lb} />}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
