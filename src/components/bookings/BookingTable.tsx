import Link from "next/link";
import { formatDate, getCleaningStatusColor, getLaundryStatusColor } from "@/lib/utils";
import { ChevronRight, Users, Brush, WashingMachine } from "lucide-react";

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

export function BookingTable({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400 text-xl">
        Keine bevorstehenden Buchungen
      </div>
    );
  }

  const cleaningLabel: Record<string, string> = {
    UNASSIGNED: "Offen",
    SELF_CLEAN: "Selbst",
    ASSIGNED: "Zugewiesen",
    COMPLETED: "Erledigt",
  };

  const laundryLabel: Record<string, string> = {
    OPEN: "Offen",
    ORDERED: "Bestellt",
    AVAILABLE: "Vorhanden",
  };

  return (
    <div className="space-y-2">
      {bookings.map((booking) => {
        const cleaningStatus = booking.cleaningAssignment?.status ?? "UNASSIGNED";
        const laundryStatus = booking.cleaningAssignment?.laundryStatus ?? "OPEN";

        return (
          <Link
            key={booking.id}
            href={`/bookings/${booking.id}`}
            className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            {/* Farbpunkt Wohnung */}
            <span
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: booking.apartment.color ?? "#3b82f6" }}
            />

            {/* Infos */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-bold text-gray-900 text-xl">{booking.guestName}</span>
                <span className="text-gray-400 text-sm">{booking.apartment.name}</span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-gray-500">
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {booking.guestCount}
                </span>
                <span>
                  {formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}
                </span>
                {booking.channelName && (
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                    {booking.channelName}
                  </span>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold border ${getCleaningStatusColor(cleaningStatus)}`}
              >
                <Brush className="w-3.5 h-3.5" />
                {cleaningLabel[cleaningStatus] ?? cleaningStatus}
              </span>
              <span
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold border ${getLaundryStatusColor(laundryStatus)}`}
              >
                <WashingMachine className="w-3.5 h-3.5" />
                {laundryLabel[laundryStatus] ?? laundryStatus}
              </span>
            </div>

            <ChevronRight className="w-5 h-5 text-gray-300" />
          </Link>
        );
      })}
    </div>
  );
}
