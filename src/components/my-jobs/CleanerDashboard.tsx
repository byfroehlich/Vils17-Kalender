"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateLong } from "@/lib/utils";
import {
  CheckCircle, AlertTriangle, Home, Clock, Users,
  ArrowRight, Star, List, Calendar,
} from "lucide-react";
import { startOfDay, startOfMonth, endOfMonth, addDays, isWithinInterval } from "date-fns";

interface Assignment {
  id: string;
  status: string;
  notes?: string | null;
  cleanerUnavailable: boolean;
  cleanerUnavailableNote?: string | null;
  cleaner?: { name: string } | null;
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

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "rgba(255,255,255,0.14)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.22)",
  borderRadius: 20,
  ...extra,
});

export function CleanerDashboard({
  assignments,
  isCleaner,
  isPrimary,
  userName,
}: {
  assignments: Assignment[];
  isCleaner: boolean;
  isPrimary: boolean;
  userName: string;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [unavailableId, setUnavailableId] = useState<string | null>(null);
  const [unavailableNote, setUnavailableNote] = useState("");

  const now = startOfDay(new Date());
  const in7 = addDays(now, 7);

  const upcoming = assignments.filter(
    (a) => a.status === "ASSIGNED" && new Date(a.booking.checkOut) >= now
  );
  const declined = upcoming.filter((a) => a.cleanerUnavailable);
  const next7 = upcoming.filter((a) =>
    isWithinInterval(new Date(a.booking.checkOut), { start: now, end: in7 })
  );

  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const completedThisMonth = assignments.filter(
    (a) =>
      a.status === "COMPLETED" &&
      isWithinInterval(new Date(a.booking.checkOut), { start: thisMonthStart, end: thisMonthEnd })
  );

  const nextJobs = upcoming.filter((a) => !a.cleanerUnavailable).slice(0, 3);

  async function markDone(bookingId: string, assignmentId: string) {
    setLoadingId(assignmentId);
    await fetch(`/api/bookings/${bookingId}/cleaning-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    setLoadingId(null);
    router.refresh();
  }

  async function submitUnavailable(a: Assignment) {
    setLoadingId(a.id);
    await fetch(`/api/bookings/${a.booking.id}/cleaner-unavailable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unavailable: true, note: unavailableNote }),
    });
    setUnavailableId(null);
    setUnavailableNote("");
    setLoadingId(null);
    router.refresh();
  }

  const firstName = userName.split(" ")[0];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em" }}>
            Hallo, {firstName} 👋
          </h1>
          {isPrimary && (
            <span style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.35)",
              color: "#fcd34d",
            }}>
              <Star style={{ width: 10, height: 10 }} fill="currentColor" />
              Hauptreiniger
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>
          {isPrimary ? "Du bist für alle Reinigungen verantwortlich." : "Deine zugewiesenen Reinigungsaufträge."}
        </p>
      </div>

      {/* Absagen-Banner */}
      {declined.length > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px",
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 16,
        }}>
          <AlertTriangle style={{ width: 20, height: 20, color: "#f87171", flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f87171", marginBottom: 2 }}>
              {declined.length} abgesagte {declined.length === 1 ? "Reinigung" : "Reinigungen"}
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>
              Bitte informiere deine Verwaltung.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { label: "Nächste 7 Tage", value: next7.length, sub: "Aufträge" },
          { label: "Gesamt offen", value: upcoming.filter((a) => !a.cleanerUnavailable).length, sub: "Aufträge" },
          { label: "Diesen Monat", value: completedThisMonth.length, sub: "erledigt" },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ ...glass({ borderRadius: 16, padding: "16px 14px", textAlign: "center" as const }) }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.95)", lineHeight: 1 }}>{value}</p>
            <p style={{ fontSize: 10, fontWeight: 600, color: "#14B8A6", marginTop: 3, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{sub}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Nav-Shortcuts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Link href="/my-jobs/list" style={{ textDecoration: "none" }}>
          <div style={{
            ...glass({ borderRadius: 16, padding: "14px 18px" }),
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(13,148,136,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <List style={{ width: 18, height: 18, color: "#14B8A6" }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.90)" }}>Liste</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Alle Aufträge</p>
            </div>
          </div>
        </Link>
        <Link href="/my-jobs/calendar" style={{ textDecoration: "none" }}>
          <div style={{
            ...glass({ borderRadius: 16, padding: "14px 18px" }),
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(13,148,136,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Calendar style={{ width: 18, height: 18, color: "#14B8A6" }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.90)" }}>Kalender</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Jahresübersicht</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Nächste Aufträge */}
      {nextJobs.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              Nächste Aufträge
            </p>
            {upcoming.length > 3 && (
              <Link href="/my-jobs/list" style={{ fontSize: 12, fontWeight: 600, color: "#14B8A6", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                Alle {upcoming.filter((a) => !a.cleanerUnavailable).length} →
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {nextJobs.map((a) => (
              <CompactJobCard
                key={a.id}
                assignment={a}
                isCleaner={isCleaner}
                loading={loadingId === a.id}
                onMarkDone={() => markDone(a.booking.id, a.id)}
                onUnavailable={() => { setUnavailableId(a.id); setUnavailableNote(""); }}
              />
            ))}
          </div>
        </section>
      )}

      {upcoming.length === 0 && (
        <div style={{ ...glass(), padding: "40px 24px", textAlign: "center" as const }}>
          <CheckCircle style={{ width: 40, height: 40, color: "#6ee7b7", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>Alles erledigt!</p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>Keine offenen Reinigungsaufträge.</p>
        </div>
      )}

      {/* Absage-Dialog */}
      {unavailableId && (() => {
        const a = assignments.find((x) => x.id === unavailableId)!;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, padding: "16px 16px max(calc(env(safe-area-inset-bottom) + 72px), 80px) 16px" }}>
            <div style={{ background: "#0c3d38", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 24, width: "100%", maxWidth: 480, padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: 6 }}>Ich kann nicht</h3>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 18 }}>
                {formatDateLong(a.booking.checkOut)} · {a.booking.apartment.name}
              </p>
              <textarea
                value={unavailableNote}
                onChange={(e) => setUnavailableNote(e.target.value)}
                placeholder="Grund (optional)…"
                rows={3}
                className="form-input"
                style={{ resize: "none", marginBottom: 16 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => submitUnavailable(a)}
                  disabled={loadingId === a.id}
                  style={{ flex: 1, padding: "12px 0", background: "rgba(239,68,68,0.85)", border: "none", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                >
                  {loadingId === a.id ? "Wird gesendet…" : "Absagen"}
                </button>
                <button
                  onClick={() => setUnavailableId(null)}
                  className="btn-secondary"
                  style={{ padding: "12px 18px" }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function CompactJobCard({
  assignment, isCleaner, loading, onMarkDone, onUnavailable,
}: {
  assignment: Assignment;
  isCleaner: boolean;
  loading: boolean;
  onMarkDone: () => void;
  onUnavailable: () => void;
}) {
  const b = assignment.booking;
  const aptColor = b.apartment.color ?? "#0D9488";

  return (
    <div style={{
      background: "rgba(255,255,255,0.12)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.20)",
      borderRadius: 18,
      overflow: "hidden",
    }}>
      <div style={{ height: 3, backgroundColor: aptColor }} />
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: aptColor, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" as const, letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {b.apartment.name}
            </span>
          </div>
          <p style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.2 }}>
            {formatDateLong(b.checkOut)}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            {b.departureTime && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
                <Clock style={{ width: 12, height: 12 }} /> bis {b.departureTime}
              </span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
              <Users style={{ width: 12, height: 12 }} /> {b.guestCount}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, flexShrink: 0 }}>
          <button
            onClick={onMarkDone}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
              background: loading ? "rgba(255,255,255,0.08)" : "rgba(16,185,129,0.85)",
              border: "none", borderRadius: 10, color: "white", fontWeight: 600, fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap" as const,
            }}
          >
            <CheckCircle style={{ width: 15, height: 15 }} />
            {loading ? "…" : "Erledigt"}
          </button>
          {isCleaner && (
            <button
              onClick={onUnavailable}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "7px 14px",
                background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.30)",
                borderRadius: 10, color: "#fca5a5", fontWeight: 600, fontSize: 12,
                cursor: "pointer", whiteSpace: "nowrap" as const,
              }}
            >
              <AlertTriangle style={{ width: 12, height: 12 }} />
              Kann nicht
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
