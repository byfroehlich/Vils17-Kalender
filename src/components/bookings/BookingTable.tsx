import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Users } from "lucide-react";

interface Booking {
  id: string;
  guestName: string;
  guestCount: number;
  checkIn: Date;
  checkOut: Date;
  channelName?: string | null;
  apartment: { name: string; color?: string | null };
  cleaningAssignment?: {
    status: string;
    laundryStatus: string;
    cleaner?: { name: string } | null;
  } | null;
}

const cleaningDot: Record<string, string> = {
  UNASSIGNED: "#f97316",
  SELF_CLEAN:  "#38bdf8",
  ASSIGNED:    "#14B8A6",
  COMPLETED:   "#4ade80",
};
const cleaningLabel: Record<string, string> = {
  UNASSIGNED: "Offen", SELF_CLEAN: "Selbst", ASSIGNED: "Zugewiesen", COMPLETED: "Erledigt",
};
const laundryDot: Record<string, string> = {
  OPEN: "#ef4444", ORDERED: "#f59e0b", AVAILABLE: "#4ade80",
};
const laundryLabel: Record<string, string> = {
  OPEN: "Offen", ORDERED: "Bestellt", AVAILABLE: "Vorhanden",
};

const glass = {
  background: "rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
} as React.CSSProperties;

export function BookingTable({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <div style={{ ...glass, padding: "40px 24px", textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Keine Buchungen gefunden</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {bookings.map((booking) => {
        const cleaningStatus = booking.cleaningAssignment?.status ?? "UNASSIGNED";
        const laundryStatus  = booking.cleaningAssignment?.laundryStatus ?? "OPEN";

        return (
          <Link
            key={booking.id}
            href={`/bookings/${booking.id}`}
            style={{ display: "flex", alignItems: "center", gap: 14, ...glass, padding: "12px 16px", textDecoration: "none" }}
          >
            {/* Apartment color bar */}
            <div style={{ width: 4, height: 36, borderRadius: 4, flexShrink: 0, backgroundColor: booking.apartment.color ?? "#18181b" }} />

            {/* Main info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.95)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {booking.guestName}
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{booking.apartment.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 3, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Users style={{ width: 12, height: 12 }} />
                  {booking.guestCount}
                </span>
                <span>{formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}</span>
                {booking.channelName && (
                  <span style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 6 }}>
                    {booking.channelName}
                  </span>
                )}
              </div>
            </div>

            {/* Status dots */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cleaningDot[cleaningStatus] ?? "#6b7280", flexShrink: 0, display: "inline-block" }} />
                <span className="hidden sm:inline">{cleaningLabel[cleaningStatus]}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: laundryDot[laundryStatus] ?? "#6b7280", flexShrink: 0, display: "inline-block" }} />
                <span className="hidden sm:inline">{laundryLabel[laundryStatus]}</span>
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
