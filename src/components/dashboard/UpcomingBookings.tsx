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

const cleaningDot: Record<string, string> = {
  UNASSIGNED: "bg-orange-400",
  SELF_CLEAN: "bg-blue-400",
  ASSIGNED: "bg-blue-500",
  COMPLETED: "bg-green-500",
};

const cleaningLabel: Record<string, string> = {
  UNASSIGNED: "Reinigung offen",
  SELF_CLEAN: "Selbstreinigung",
  ASSIGNED: "Reiniger zugewiesen",
  COMPLETED: "Erledigt",
};

const laundryDot: Record<string, string> = {
  OPEN: "bg-red-400",
  ORDERED: "bg-amber-400",
  AVAILABLE: "bg-green-500",
};

const laundryLabel: Record<string, string> = {
  OPEN: "Wäsche offen",
  ORDERED: "Wäsche bestellt",
  AVAILABLE: "Wäsche vorhanden",
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

              {/* Status Dots */}
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <span className={`w-1.5 h-1.5 rounded-full ${cleaningDot[cleaningStatus] ?? "bg-zinc-300"}`} />
                  {cleaningLabel[cleaningStatus] ?? cleaningStatus}
                  {cleaningStatus === "ASSIGNED" && assignment?.cleaner?.name && (
                    <span className="text-zinc-400">· {assignment.cleaner.name}</span>
                  )}
                </span>
                <span className="text-zinc-200">·</span>
                <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <span className={`w-1.5 h-1.5 rounded-full ${laundryDot[laundryStatus] ?? "bg-zinc-300"}`} />
                  {laundryLabel[laundryStatus] ?? laundryStatus}
                </span>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-400 flex-shrink-0 transition-colors" />
          </Link>
        );
      })}
    </div>
  );
}
