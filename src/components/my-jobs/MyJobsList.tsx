"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateLong } from "@/lib/utils";
import { Home, Users, Clock, CheckCircle, ClipboardList } from "lucide-react";

interface Assignment {
  id: string;
  status: string;
  notes?: string | null;
  booking: {
    id: string;
    guestCount: number;
    checkOut: Date;
    checkIn: Date;
    arrivalTime?: string | null;
    departureTime?: string | null;
    apartment: { name: string; color?: string | null };
  };
}

export function MyJobsList({ assignments }: { assignments: Assignment[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const pending = assignments.filter((a) => a.status === "ASSIGNED");
  const done = assignments.filter((a) => a.status === "COMPLETED");

  async function markDone(bookingId: string, assignmentId: string) {
    setLoading(assignmentId);
    await fetch(`/api/bookings/${bookingId}/cleaning-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    setLoading(null);
    router.refresh();
  }

  if (assignments.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
        <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-xl text-gray-400">Keine Aufträge ausstehend.</p>
        <p className="text-gray-300 mt-1">Sie werden benachrichtigt wenn ein Auftrag zugewiesen wird.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Ausstehende Aufträge */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-gray-700 mb-3">
            Ausstehend ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((a) => (
              <JobCard
                key={a.id}
                assignment={a}
                onMarkDone={() => markDone(a.booking.id, a.id)}
                loading={loading === a.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* Erledigte Aufträge */}
      {done.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-gray-500 mb-3">
            Erledigt ({done.length})
          </h2>
          <div className="space-y-3 opacity-60">
            {done.map((a) => (
              <JobCard key={a.id} assignment={a} loading={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function JobCard({
  assignment,
  onMarkDone,
  loading,
}: {
  assignment: Assignment;
  onMarkDone?: () => void;
  loading: boolean;
}) {
  const b = assignment.booking;
  const isDone = assignment.status === "COMPLETED";

  return (
    <div
      className={`bg-white rounded-2xl border-2 p-6 ${
        isDone ? "border-green-200" : "border-blue-200"
      }`}
    >
      {/* Wohnung */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: b.apartment.color ?? "#3b82f6" }}
        />
        <span className="font-bold text-gray-500 uppercase tracking-wide">
          {b.apartment.name}
        </span>
        {isDone && (
          <span className="ml-auto flex items-center gap-1 text-green-600 font-semibold">
            <CheckCircle className="w-5 h-5" />
            Erledigt
          </span>
        )}
      </div>

      {/* Details */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Home className="w-6 h-6 text-gray-400 mt-0.5" />
          <div>
            <p className="text-sm text-gray-500">Reinigung nach Abreise</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatDateLong(b.checkOut)}
            </p>
            {b.departureTime && (
              <p className="text-gray-500">Abreise bis {b.departureTime} Uhr</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-gray-400" />
          <div>
            <p className="text-sm text-gray-500">Nächste Anreise</p>
            <p className="text-lg font-semibold text-gray-800">
              {formatDateLong(b.checkIn)}
              {b.arrivalTime && ` ab ${b.arrivalTime} Uhr`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-gray-400" />
          <p className="text-lg font-semibold text-gray-800">
            {b.guestCount} {b.guestCount === 1 ? "Person" : "Personen"}
          </p>
        </div>

        {assignment.notes && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <p className="font-semibold text-yellow-800 text-sm mb-1">Hinweise:</p>
            <p className="text-yellow-900">{assignment.notes}</p>
          </div>
        )}
      </div>

      {/* Erledigt-Button */}
      {!isDone && onMarkDone && (
        <button
          onClick={onMarkDone}
          disabled={loading}
          className="mt-5 w-full flex items-center justify-center gap-2 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold rounded-xl text-xl transition-colors"
        >
          <CheckCircle className="w-6 h-6" />
          {loading ? "Wird gespeichert..." : "Als erledigt markieren"}
        </button>
      )}
    </div>
  );
}
