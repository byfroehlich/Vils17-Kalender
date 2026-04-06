import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface ProblemBooking {
  id: string;
  guestName: string;
  checkIn: Date;
  apartment: { name: string };
  cleaningUnassigned: boolean;
  laundryOpen: boolean;
}

export function WarningBanner({ bookings }: { bookings: ProblemBooking[] }) {
  if (bookings.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <p className="font-semibold text-amber-900 text-sm">
            {bookings.length === 1
              ? "1 Buchung braucht Aufmerksamkeit"
              : `${bookings.length} Buchungen brauchen Aufmerksamkeit`}
          </p>
          <p className="text-xs text-amber-700">Reinigung oder Wäsche nicht organisiert</p>
        </div>
      </div>

      <div className="space-y-2">
        {bookings.map((b) => (
          <Link
            key={b.id}
            href={`/bookings/${b.id}`}
            className="block bg-white rounded-xl px-4 py-3 border border-amber-100 hover:border-amber-300 transition-colors"
          >
            {/* Zeile 1: Name + Datum */}
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="font-semibold text-zinc-900 text-sm truncate">
                {b.guestName}
              </span>
              <span className="text-xs text-zinc-400 flex-shrink-0">
                {formatDate(b.checkIn)}
              </span>
            </div>
            {/* Zeile 2: Apartment + Badges */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-500 truncate">{b.apartment.name}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {b.cleaningUnassigned && (
                  <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 text-xs font-medium whitespace-nowrap">
                    Reinigung
                  </span>
                )}
                {b.laundryOpen && (
                  <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-xs font-medium whitespace-nowrap">
                    Wäsche
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
