import Link from "next/link";
import { formatDate, getCleaningStatusColor, getLaundryStatusColor } from "@/lib/utils";
import { Users, Calendar, Brush, WashingMachine, ChevronRight } from "lucide-react";

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

export function UpcomingBookings({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <p className="text-gray-400 text-xl">Keine Buchungen in den nächsten Tagen</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => {
        const assignment = booking.cleaningAssignment;
        const cleaningStatus = assignment?.status ?? "UNASSIGNED";
        const laundryStatus = assignment?.laundryStatus ?? "OPEN";

        const cleaningLabel: Record<string, string> = {
          UNASSIGNED: "Reinigung: Offen",
          SELF_CLEAN: "Selbstreinigung",
          ASSIGNED: `Reiniger: ${assignment?.cleaner?.name ?? "–"}`,
          COMPLETED: "Reinigung: Erledigt",
        };

        const laundryLabel: Record<string, string> = {
          OPEN: "Wäsche: Offen",
          ORDERED: "Wäsche: Bestellt",
          AVAILABLE: "Wäsche: Vorhanden",
        };

        return (
          <Link
            key={booking.id}
            href={`/bookings/${booking.id}`}
            className="block bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Apartment + Gast */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: booking.apartment.color ?? "#3b82f6" }}
                  />
                  <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    {booking.apartment.name}
                  </span>
                </div>

                <h3 className="text-2xl font-bold text-gray-900 mb-1 truncate">
                  {booking.guestName}
                </h3>

                {/* Details */}
                <div className="flex flex-wrap gap-4 text-base text-gray-600 mt-2">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-5 h-5 text-gray-400" />
                    {booking.guestCount}{" "}
                    {booking.guestCount === 1 ? "Person" : "Personen"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}
                    {booking.departureTime && (
                      <span className="text-gray-400">bis {booking.departureTime}</span>
                    )}
                  </span>
                </div>

                {/* Status-Badges */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${getCleaningStatusColor(cleaningStatus)}`}
                  >
                    <Brush className="w-4 h-4" />
                    {cleaningLabel[cleaningStatus] ?? cleaningStatus}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${getLaundryStatusColor(laundryStatus)}`}
                  >
                    <WashingMachine className="w-4 h-4" />
                    {laundryLabel[laundryStatus] ?? laundryStatus}
                  </span>
                </div>
              </div>

              <ChevronRight className="w-6 h-6 text-gray-300 flex-shrink-0 mt-1" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
