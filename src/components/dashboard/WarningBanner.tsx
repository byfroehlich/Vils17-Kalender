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
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <p className="font-semibold text-amber-900">
            {bookings.length === 1
              ? "1 Buchung braucht Aufmerksamkeit"
              : `${bookings.length} Buchungen brauchen Aufmerksamkeit`}
          </p>
          <p className="text-sm text-amber-700">Reinigung oder Wäsche nicht organisiert</p>
        </div>
      </div>

      <div className="space-y-2">
        {bookings.map((b) => (
          <Link
            key={b.id}
            href={`/bookings/${b.id}`}
            className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100 hover:border-amber-300 transition-colors group"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="min-w-0">
                <span className="font-medium text-zinc-900 text-sm truncate block">
                  {b.guestName}
                </span>
                <span className="text-xs text-zinc-500">
                  {b.apartment.name} · Anreise {formatDate(b.checkIn)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              {b.cleaningUnassigned && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-100 text-orange-700 text-xs font-medium">
                  Reinigung offen
                </span>
              )}
              {b.laundryOpen && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-medium">
                  Wäsche offen
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
