import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Users, ChevronRight } from "lucide-react";

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

// Badge-Stil: bg + Text + ob es "Handlungsbedarf" hat (= auffälliger)
const cleaningBadge: Record<string, { bg: string; text: string; urgent: boolean; label: string }> = {
  UNASSIGNED: { bg: "bg-orange-100 border border-orange-300", text: "text-orange-800", urgent: true,  label: "⚠ Reinigung offen" },
  SELF_CLEAN:  { bg: "bg-blue-100  border border-blue-200",   text: "text-blue-800",   urgent: false, label: "✓ Selbstreinigung" },
  ASSIGNED:    { bg: "bg-blue-100  border border-blue-200",   text: "text-blue-800",   urgent: false, label: "✓ Reiniger zugewiesen" },
  COMPLETED:   { bg: "bg-green-100 border border-green-200",  text: "text-green-800",  urgent: false, label: "✓ Erledigt" },
};

const laundryBadge: Record<string, { bg: string; text: string; urgent: boolean; label: string }> = {
  OPEN:      { bg: "bg-red-100    border border-red-300",    text: "text-red-800",    urgent: true,  label: "⚠ Wäsche offen" },
  ORDERED:   { bg: "bg-amber-100  border border-amber-200",  text: "text-amber-800",  urgent: false, label: "◷ Wäsche bestellt" },
  AVAILABLE: { bg: "bg-green-100  border border-green-200",  text: "text-green-800",  urgent: false, label: "✓ Wäsche vorhanden" },
};

export function UpcomingBookings({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-100 p-10 text-center">
        <p className="text-zinc-400 text-sm">Keine Buchungen in den nächsten Tagen</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bookings.map((booking) => {
        const assignment = booking.cleaningAssignment;
        const cleaningStatus = assignment?.status ?? "UNASSIGNED";
        const laundryStatus = assignment?.laundryStatus ?? "OPEN";

        return (
          <Link
            key={booking.id}
            href={`/bookings/${booking.id}`}
            className="flex items-center gap-4 bg-white rounded-2xl border border-zinc-100 px-5 py-4 hover:border-zinc-200 hover:shadow-sm transition-all group"
          >
            {/* Apartment Farbe */}
            <div
              className="w-1 self-stretch rounded-full flex-shrink-0"
              style={{ backgroundColor: booking.apartment.color ?? "#18181b" }}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-semibold text-zinc-900 text-base truncate">
                  {booking.guestName}
                </span>
                <span className="text-zinc-400 text-xs flex-shrink-0">{booking.apartment.name}</span>
              </div>

              <div className="flex items-center gap-4 text-sm text-zinc-500 mb-2.5">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {booking.guestCount} {booking.guestCount === 1 ? "Person" : "Personen"}
                </span>
                <span>
                  {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}
                  {booking.departureTime && <span className="text-zinc-400"> bis {booking.departureTime}</span>}
                </span>
              </div>

              {/* Status Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const cb = cleaningBadge[cleaningStatus];
                  const lb = laundryBadge[laundryStatus];
                  return (
                    <>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${cb?.bg ?? ""} ${cb?.text ?? "text-zinc-500"}`}>
                        {cb?.label ?? cleaningStatus}
                        {cleaningStatus === "ASSIGNED" && assignment?.cleaner?.name && (
                          <span className="ml-1 opacity-70">· {assignment.cleaner.name}</span>
                        )}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${lb?.bg ?? ""} ${lb?.text ?? "text-zinc-500"}`}>
                        {lb?.label ?? laundryStatus}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-400 flex-shrink-0 transition-colors" />
          </Link>
        );
      })}
    </div>
  );
}
