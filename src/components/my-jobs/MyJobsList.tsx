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
      <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "48px 24px", textAlign: "center" }}>
        <ClipboardList style={{ width: 48, height: 48, color: "rgba(255,255,255,0.15)", margin: "0 auto 16px" }} />
        <p style={{ fontSize: 17, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>Keine Aufträge ausstehend.</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>Sie werden benachrichtigt wenn ein Auftrag zugewiesen wird.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Ausstehende Aufträge */}
      {pending.length > 0 && (
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
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
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
            Erledigt ({done.length})
          </h2>
          <div className="space-y-3" style={{ opacity: 0.55 }}>
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
  const aptColor = b.apartment.color ?? "#3b82f6";

  return (
    <div style={{
      background: "rgba(255,255,255,0.08)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: isDone
        ? "1px solid rgba(16,185,129,0.3)"
        : "1px solid rgba(255,255,255,0.14)",
      borderRadius: 20,
      overflow: "hidden",
    }}>
      {/* Farbstreifen oben */}
      <div style={{ height: 4, backgroundColor: aptColor, width: "100%" }} />

      <div style={{ padding: 20 }}>
        {/* Wohnung + Status */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: aptColor, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              {b.apartment.name}
            </span>
          </div>
          {isDone && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#6ee7b7", fontSize: 13, fontWeight: 600 }}>
              <CheckCircle style={{ width: 16, height: 16 }} />
              Erledigt
            </span>
          )}
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <Home style={{ width: 22, height: 22, color: "rgba(255,255,255,0.3)", marginTop: 2, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Reinigung nach Abreise</p>
              <p style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.15, marginTop: 2 }}>
                {formatDateLong(b.checkOut)}
              </p>
              {b.departureTime && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Abreise bis {b.departureTime} Uhr</p>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Clock style={{ width: 22, height: 22, color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Nächste Anreise</p>
              <p style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 1 }}>
                {formatDateLong(b.checkIn)}
                {b.arrivalTime && ` ab ${b.arrivalTime} Uhr`}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Users style={{ width: 22, height: 22, color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
            <p style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
              {b.guestCount} {b.guestCount === 1 ? "Person" : "Personen"}
            </p>
          </div>

          {assignment.notes && (
            <div style={{ padding: "12px 14px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#fcd34d", marginBottom: 4 }}>Hinweise:</p>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)" }}>{assignment.notes}</p>
            </div>
          )}
        </div>

        {/* Erledigt-Button */}
        {!isDone && onMarkDone && (
          <button
            onClick={onMarkDone}
            disabled={loading}
            style={{
              marginTop: 20,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "16px 24px",
              background: loading ? "rgba(255,255,255,0.1)" : "rgba(16,185,129,0.85)",
              border: "none",
              borderRadius: 14,
              color: "white",
              fontWeight: 700,
              fontSize: 18,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            <CheckCircle style={{ width: 22, height: 22 }} />
            {loading ? "Wird gespeichert..." : "Als erledigt markieren"}
          </button>
        )}
      </div>
    </div>
  );
}
