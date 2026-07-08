"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateLong } from "@/lib/utils";
import {
  CheckCircle, AlertTriangle, Clock, Users,
  List, Calendar, Zap, Euro,
} from "lucide-react";
import { startOfDay, startOfMonth, endOfMonth, addDays, isWithinInterval } from "date-fns";

interface Assignment {
  id: string;
  status: string;
  paidOut: boolean;
  notes?: string | null;
  cleanerUnavailable: boolean;
  cleanerUnavailableNote?: string | null;
  cleaner?: { name: string; cleanerRate: number } | null;
  nextGuestCount?: number | null;
  booking: {
    id: string;
    guestCount: number;
    checkOut: Date | string;
    checkIn: Date | string;
    arrivalTime?: string | null;
    departureTime?: string | null;
    apartment: { name: string; color?: string | null };
  };
}

interface OpenAssignment {
  id: string;
  nextGuestCount?: number | null;
  booking: {
    id: string;
    guestCount: number;
    checkOut: Date;
    checkIn: Date;
    departureTime?: string | null;
    arrivalTime?: string | null;
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
  myAssignments,
  openAssignments,
  isCleaner,
  userName,
}: {
  myAssignments: Assignment[];
  openAssignments: OpenAssignment[];
  isCleaner: boolean;
  userName: string;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [unavailableId, setUnavailableId] = useState<string | null>(null);
  const [unavailableNote, setUnavailableNote] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);

  const now = startOfDay(new Date());
  const in7 = addDays(now, 7);

  const upcoming = myAssignments.filter(
    (a) => (a.status === "ASSIGNED" || (a.status === "UNASSIGNED" && a.cleanerUnavailable)) && new Date(a.booking.checkIn) >= now
  );
  const declined = upcoming.filter((a) => a.cleanerUnavailable);
  const next7 = upcoming.filter((a) =>
    isWithinInterval(new Date(a.booking.checkIn), { start: now, end: in7 })
  );
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const completedThisMonth = myAssignments.filter(
    (a) =>
      a.status === "COMPLETED" &&
      isWithinInterval(new Date(a.booking.checkIn), { start: thisMonthStart, end: thisMonthEnd })
  );

  async function claimJob(bookingId: string) {
    setLoadingId(bookingId);
    setClaimError(null);
    const res = await fetch(`/api/bookings/${bookingId}/claim`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      setClaimError(data.error ?? "Fehler beim Zusagen");
    }
    setLoadingId(null);
    router.refresh();
  }

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
  const nextJobs = upcoming.filter((a) => !a.cleanerUnavailable).slice(0, 3);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em" }}>
          Hallo, {firstName} 👋
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
          Deine Reinigungsaufträge
        </p>
      </div>

      {/* Absagen-Banner */}
      {declined.length > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px",
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 16,
        }}>
          <AlertTriangle style={{ width: 20, height: 20, color: "#f87171", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 14, color: "#f87171", fontWeight: 600 }}>
            Du hast {declined.length} {declined.length === 1 ? "Reinigung" : "Reinigungen"} abgesagt — bitte informiere die Verwaltung.
          </p>
        </div>
      )}

      {/* Offene Jobs Banner */}
      {openAssignments.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
          background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.30)", borderRadius: 16,
          cursor: "pointer",
        }}
          onClick={() => router.push("/my-jobs/list")}
        >
          <Zap style={{ width: 22, height: 22, color: "#6ee7b7", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#6ee7b7" }}>
              {openAssignments.length} {openAssignments.length === 1 ? "offener Auftrag" : "offene Aufträge"} — jetzt zusagen!
            </p>
            <p style={{ fontSize: 12, color: "rgba(110,231,183,0.65)", marginTop: 1 }}>Tippen um alle zu sehen →</p>
          </div>
        </div>
      )}

      {/* Fehler beim Zusagen */}
      {claimError && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, fontSize: 13, color: "#fca5a5" }}>
          {claimError}
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

      {/* Verdienst */}
      {isCleaner && (() => {
        const rate = myAssignments.find((a) => a.cleaner?.cleanerRate != null)?.cleaner?.cleanerRate ?? 50;
        const completed = myAssignments.filter((a) => a.status === "COMPLETED");
        const totalEarned = completed.length * rate;
        const paid = completed.filter((a) => a.paidOut).length * rate;
        const pending = totalEarned - paid;
        if (completed.length === 0) return null;
        return (
          <div style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.22)", borderRadius: 18, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Euro style={{ width: 16, height: 16, color: "#6ee7b7" }} />
              <p style={{ fontSize: 12, fontWeight: 700, color: "#6ee7b7", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Mein Verdienst</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Gesamt", value: totalEarned, color: "rgba(255,255,255,0.85)" },
                { label: "Ausstehend", value: pending, color: pending > 0 ? "#6ee7b7" : "rgba(255,255,255,0.45)" },
                { label: "Ausgezahlt", value: paid, color: "rgba(255,255,255,0.45)" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center" as const }}>
                  <p style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value.toFixed(0)} €</p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Nav-Shortcuts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Link href="/my-jobs/list" style={{ textDecoration: "none" }}>
          <div style={{ ...glass({ borderRadius: 16, padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 12 }}>
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
          <div style={{ ...glass({ borderRadius: 16, padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 12 }}>
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

      {/* Nächste zugesagte Aufträge */}
      {nextJobs.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              Nächste Aufträge
            </p>
            {upcoming.filter((a) => !a.cleanerUnavailable).length > 3 && (
              <Link href="/my-jobs/list" style={{ fontSize: 12, fontWeight: 600, color: "#14B8A6", textDecoration: "none" }}>
                Alle →
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

      {/* Offene Aufträge — Top 2 */}
      {openAssignments.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#6ee7b7", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              Jetzt zusagen
            </p>
            {openAssignments.length > 2 && (
              <Link href="/my-jobs/list" style={{ fontSize: 12, fontWeight: 600, color: "#6ee7b7", textDecoration: "none" }}>
                Alle {openAssignments.length} →
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {openAssignments.slice(0, 2).map((a) => (
              <OpenJobCard
                key={a.id}
                assignment={a}
                loading={loadingId === a.booking.id}
                onClaim={() => claimJob(a.booking.id)}
              />
            ))}
          </div>
        </section>
      )}

      {myAssignments.length === 0 && openAssignments.length === 0 && (
        <div style={{ ...glass(), padding: "40px 24px", textAlign: "center" as const }}>
          <CheckCircle style={{ width: 40, height: 40, color: "#6ee7b7", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>Alles erledigt!</p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>Keine offenen Reinigungsaufträge.</p>
        </div>
      )}

      {/* Absage-Dialog */}
      {unavailableId && (() => {
        const a = myAssignments.find((x) => x.id === unavailableId);
        if (!a) return null;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, padding: "16px 16px max(calc(env(safe-area-inset-bottom) + 72px), 80px) 16px" }}>
            <div style={{ background: "#0c3d38", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 24, width: "100%", maxWidth: 480, padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: 6 }}>Ich kann nicht</h3>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 18 }}>
                {formatDateLong(new Date(a.booking.checkIn))} · {a.booking.apartment.name}
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
                <button onClick={() => setUnavailableId(null)} className="btn-secondary" style={{ padding: "12px 18px" }}>
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

function CompactJobCard({ assignment, isCleaner, loading, onMarkDone, onUnavailable }: {
  assignment: Assignment; isCleaner: boolean; loading: boolean;
  onMarkDone: () => void; onUnavailable: () => void;
}) {
  const b = assignment.booking;
  const aptColor = b.apartment.color ?? "#0D9488";
  return (
    <div style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.20)", borderRadius: 18, overflow: "hidden" }}>
      <div style={{ height: 3, backgroundColor: aptColor }} />
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: aptColor, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" as const, letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{b.apartment.name}</span>
          </div>
          <p style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.2 }}>{formatDateLong(new Date(b.checkIn))}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            {b.arrivalTime && <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.50)" }}><Clock style={{ width: 12, height: 12 }} /> ab {b.arrivalTime}</span>}
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.50)" }}><Users style={{ width: 12, height: 12 }} /> {b.guestCount}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, flexShrink: 0 }}>
          <button onClick={onMarkDone} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: loading ? "rgba(255,255,255,0.08)" : "rgba(16,185,129,0.85)", border: "none", borderRadius: 10, color: "white", fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap" as const }}>
            <CheckCircle style={{ width: 15, height: 15 }} />{loading ? "…" : "Erledigt"}
          </button>
          {isCleaner && (
            <button onClick={onUnavailable} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "7px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 10, color: "#fca5a5", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" as const }}>
              <AlertTriangle style={{ width: 12, height: 12 }} />Kann nicht
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OpenJobCard({ assignment, loading, onClaim }: {
  assignment: OpenAssignment; loading: boolean; onClaim: () => void;
}) {
  const b = assignment.booking;
  const aptColor = b.apartment.color ?? "#0D9488";
  return (
    <div style={{ background: "rgba(16,185,129,0.08)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 18, overflow: "hidden" }}>
      <div style={{ height: 3, backgroundColor: aptColor }} />
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: aptColor, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{b.apartment.name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: "rgba(16,185,129,0.20)", border: "1px solid rgba(16,185,129,0.35)", color: "#6ee7b7" }}>Offen</span>
          </div>
          <p style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.2 }}>{formatDateLong(b.checkIn)}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            {b.arrivalTime && <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.50)" }}><Clock style={{ width: 12, height: 12 }} /> ab {b.arrivalTime}</span>}
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.50)" }}><Users style={{ width: 12, height: 12 }} /> {b.guestCount} Gäste</span>
          </div>
        </div>
        <button
          onClick={onClaim}
          disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: loading ? "rgba(255,255,255,0.08)" : "rgba(16,185,129,0.85)", border: "none", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap" as const, flexShrink: 0 }}
        >
          <Zap style={{ width: 16, height: 16 }} />
          {loading ? "…" : "Zusagen"}
        </button>
      </div>
    </div>
  );
}
