import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { ChevronRight, Users } from "lucide-react";

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
  UNASSIGNED: "bg-orange-400",
  SELF_CLEAN: "bg-blue-400",
  ASSIGNED: "bg-blue-500",
  COMPLETED: "bg-green-500",
};

const cleaningLabel: Record<string, string> = {
  UNASSIGNED: "Offen",
  SELF_CLEAN: "Selbst",
  ASSIGNED: "Zugewiesen",
  COMPLETED: "Erledigt",
};

const laundryDot: Record<string, string> = {
  OPEN: "bg-red-400",
  ORDERED: "bg-amber-400",
  AVAILABLE: "bg-green-500",
};

const laundryLabel: Record<string, string> = {
  OPEN: "Offen",
  ORDERED: "Bestellt",
  AVAILABLE: "Vorhanden",
};

export function BookingTable({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-100 p-10 text-center">
        <p className="text-zinc-400 text-sm">Keine Buchungen gefunden</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {bookings.map((booking) => {
        const cleaningStatus = booking.cleaningAssignment?.status ?? "UNASSIGNED";
        const laundryStatus = booking.cleaningAssignment?.laundryStatus ?? "OPEN";

        return (
          <Link
            key={booking.id}
            href={`/bookings/${booking.id}`}
            className="flex items-center gap-4 bg-white rounded-xl border border-zinc-100 px-5 py-3.5 hover:border-zinc-200 hover:shadow-sm transition-all group"
          >
            {/* Apartment color bar */}
            <div
              className="w-1 h-8 rounded-full flex-shrink-0"
              style={{ backgroundColor: booking.apartment.color ?? "#18181b" }}
            />

            {/* Main info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-zinc-900 truncate">{booking.guestName}</span>
                <span className="text-zinc-400 text-xs">{booking.apartment.name}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {booking.guestCount}
                </span>
                <span>{formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}</span>
                {booking.channelName && (
                  <span className="bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-md">
                    {booking.channelName}
                  </span>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className={`w-1.5 h-1.5 rounded-full ${cleaningDot[cleaningStatus] ?? "bg-zinc-300"}`} />
                {cleaningLabel[cleaningStatus]}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className={`w-1.5 h-1.5 rounded-full ${laundryDot[laundryStatus] ?? "bg-zinc-300"}`} />
                {laundryLabel[laundryStatus]}
              </span>
            </div>

            <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-400 transition-colors" />
          </Link>
        );
      })}
    </div>
  );
}
