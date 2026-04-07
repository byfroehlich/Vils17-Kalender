import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface Assignment {
  id: string;
  status: string;
  isSelfClean: boolean;
  laundryStatus: string;
  cleaner?: { name: string } | null;
  booking: {
    id: string;
    guestName: string;
    guestCount: number;
    checkOut: Date;
    apartment: { name: string; color?: string | null; laundryBedsDivisor?: number | null; laundryTowelsPerGuest?: number | null; laundryKitchenCount?: number | null };
  };
}

const cleaningColors: Record<string, string> = {
  UNASSIGNED: "bg-orange-100 text-orange-800 border-orange-200",
  SELF_CLEAN:  "bg-sky-100 text-sky-800 border-sky-200",
  ASSIGNED:    "bg-blue-100 text-blue-800 border-blue-200",
  COMPLETED:   "bg-green-100 text-green-800 border-green-200",
};

const cleaningLabels: Record<string, string> = {
  UNASSIGNED: "Offen",
  SELF_CLEAN:  "Selbstreinigung",
  ASSIGNED:    "Zugewiesen",
  COMPLETED:   "Erledigt",
};

const laundryColors: Record<string, string> = {
  OPEN:      "bg-red-100 text-red-800 border-red-200",
  ORDERED:   "bg-amber-100 text-amber-800 border-amber-200",
  AVAILABLE: "bg-green-100 text-green-800 border-green-200",
};

const laundryLabels: Record<string, string> = {
  OPEN: "Offen", ORDERED: "Bestellt", AVAILABLE: "Vorhanden",
};

function calcLaundry(guestCount: number, apt: Assignment["booking"]["apartment"]) {
  return {
    beds: Math.ceil(guestCount / (apt.laundryBedsDivisor ?? 2)),
    towels: guestCount * (apt.laundryTowelsPerGuest ?? 1),
    kitchen: apt.laundryKitchenCount ?? 1,
  };
}

export function CleaningSchedule({ assignments }: { assignments: Assignment[] }) {
  const upcoming = assignments.filter(a => a.status !== "COMPLETED");
  const laundryItems = assignments.filter(a => a.laundryStatus === "ORDERED" || a.laundryStatus === "AVAILABLE");

  return (
    <div className="space-y-6">
      {/* Anstehende Reinigungen */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 mb-3">Anstehende Reinigungen</h2>
        {upcoming.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200 p-6 text-center text-zinc-400 text-sm">
            Keine anstehenden Reinigungen in den nächsten 60 Tagen.
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((a) => (
              <Link
                key={a.id}
                href={`/bookings/${a.booking.id}`}
                className="flex items-center gap-3 bg-white rounded-xl border border-zinc-200 px-4 py-3 hover:border-zinc-300 transition-colors group"
              >
                {/* Apartment-Farbe */}
                <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: a.booking.apartment.color ?? "#18181b" }} />

                {/* Datum */}
                <div className="w-20 flex-shrink-0">
                  <p className="text-xs font-semibold text-zinc-900">{formatDate(a.booking.checkOut)}</p>
                  <p className="text-xs text-zinc-400">Abreise</p>
                </div>

                {/* Buchung */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{a.booking.guestName}</p>
                  <p className="text-xs text-zinc-400">{a.booking.apartment.name} · {a.booking.guestCount} {a.booking.guestCount === 1 ? "Person" : "Personen"}</p>
                </div>

                {/* Reiniger */}
                <div className="hidden sm:block w-28 flex-shrink-0 text-right">
                  {a.isSelfClean ? (
                    <p className="text-xs text-zinc-500">Selbstreinigung</p>
                  ) : a.cleaner ? (
                    <p className="text-xs font-medium text-zinc-700">{a.cleaner.name}</p>
                  ) : (
                    <p className="text-xs text-orange-600 font-medium">Nicht zugewiesen</p>
                  )}
                </div>

                {/* Status */}
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${cleaningColors[a.status] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>
                  {cleaningLabels[a.status] ?? a.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Wäsche-Übersicht */}
      {laundryItems.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 mb-3">Wäsche-Übersicht</h2>
          <div className="space-y-2">
            {laundryItems.map((a) => {
              const qty = calcLaundry(a.booking.guestCount, a.booking.apartment);
              return (
                <Link
                  key={`laundry-${a.id}`}
                  href={`/bookings/${a.booking.id}`}
                  className="flex items-center gap-3 bg-white rounded-xl border border-zinc-200 px-4 py-3 hover:border-zinc-300 transition-colors"
                >
                  <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: a.booking.apartment.color ?? "#18181b" }} />
                  <div className="w-20 flex-shrink-0">
                    <p className="text-xs font-semibold text-zinc-900">{formatDate(a.booking.checkOut)}</p>
                    <p className="text-xs text-zinc-400">{a.booking.apartment.name}</p>
                  </div>
                  <div className="flex-1 flex items-center gap-2 flex-wrap">
                    <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md font-medium">🛏 {qty.beds} Sets</span>
                    <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md font-medium">🛁 {qty.towels} Tücher</span>
                    <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md font-medium">🍽 {qty.kitchen} Küche</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${laundryColors[a.laundryStatus] ?? ""}`}>
                    {laundryLabels[a.laundryStatus] ?? a.laundryStatus}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
