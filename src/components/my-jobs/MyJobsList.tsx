"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateLong, formatDateShort } from "@/lib/utils";
import {
  Home, Users, CheckCircle, ClipboardList,
  Calendar, AlertTriangle, Zap, Pencil, X,
} from "lucide-react";
import { startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { format } from "date-fns";

export interface Assignment {
  id: string;
  status: string;
  notes?: string | null;
  cleanerUnavailable: boolean;
  cleanerUnavailableNote?: string | null;
  cleaner?: { name: string } | null;
  nextGuestCount?: number | null;
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

export interface OpenAssignment {
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

function monthKey(d: Date) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return format(new Date(Number(y), Number(m) - 1, 1), "MMMM yyyy", { locale: de });
}

export function MyJobsList({
  myAssignments,
  openAssignments,
  isCleaner,
}: {
  myAssignments: Assignment[];
  openAssignments: OpenAssignment[];
  isCleaner: boolean;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [unavailableId, setUnavailableId] = useState<string | null>(null);
  const [unavailableNote, setUnavailableNote] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);

  const today = startOfDay(new Date());
  const upcoming = myAssignments.filter(
    (a) => (a.status === "ASSIGNED" || (a.status === "UNASSIGNED" && a.cleanerUnavailable)) && new Date(a.booking.checkIn) >= today
  );
  const done = myAssignments.filter((a) => a.status === "COMPLETED");
  const unavailableList = myAssignments.filter((a) => a.cleanerUnavailable);

  async function claimJob(bookingId: string) {
    setLoadingId(bookingId);
    setClaimError(null);
    const res = await fetch(`/api/bookings/${bookingId}/claim`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      setClaimError(data.error ?? "Fehler");
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

  async function cancelUnavailable(a: Assignment) {
    setLoadingId(a.id);
    await fetch(`/api/bookings/${a.booking.id}/cleaner-unavailable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unavailable: false }),
    });
    setLoadingId(null);
    router.refresh();
  }

  if (myAssignments.length === 0 && openAssignments.length === 0) {
    return (
      <div style={{ ...glass(), padding: "48px 24px", textAlign: "center" as const }}>
        <ClipboardList style={{ width: 48, height: 48, color: "rgba(255,255,255,0.2)", margin: "0 auto 16px" }} />
        <p style={{ fontSize: 17, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>Keine Aufträge.</p>
      </div>
    );
  }

  // Absage-Banner für Admin/Manager
  const showWarning = !isCleaner && unavailableList.length > 0;

  // Offene und meine Aufträge nach Monat
  const openByMonth: Record<string, OpenAssignment[]> = {};
  for (const a of openAssignments) {
    const key = monthKey(a.booking.checkIn);
    if (!openByMonth[key]) openByMonth[key] = [];
    openByMonth[key].push(a);
  }

  const myByMonth: Record<string, Assignment[]> = {};
  for (const a of upcoming) {
    const key = monthKey(a.booking.checkIn);
    if (!myByMonth[key]) myByMonth[key] = [];
    myByMonth[key].push(a);
  }

  // Alle Monate (union von offen + meine)
  const allMonths = Array.from(new Set([
    ...Object.keys(openByMonth),
    ...Object.keys(myByMonth),
  ])).sort();

  return (
    <div className="space-y-4">
      {showWarning && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 16 }}>
          <AlertTriangle style={{ width: 20, height: 20, color: "#f87171", flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>
              {unavailableList.length} {unavailableList.length === 1 ? "Absage" : "Absagen"} — Reinigung muss neu organisiert werden
            </p>
            {unavailableList.map((a) => (
              <p key={a.id} style={{ fontSize: 13, color: "rgba(255,255,255,0.70)" }}>
                · {formatDateLong(a.booking.checkIn)} — {a.booking.apartment.name}
                {a.cleanerUnavailableNote && <span style={{ color: "rgba(255,255,255,0.50)" }}> · „{a.cleanerUnavailableNote}"</span>}
              </p>
            ))}
          </div>
        </div>
      )}

      {claimError && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, fontSize: 13, color: "#fca5a5" }}>
          {claimError}
        </div>
      )}

      {/* Nach Monat gruppiert: offen + zugesagt */}
      {allMonths.map((key) => {
        const open = openByMonth[key] ?? [];
        const mine = myByMonth[key] ?? [];
        return (
          <section key={key}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Calendar style={{ width: 13, height: 13, color: "rgba(255,255,255,0.40)" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.60)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                {monthLabel(key)}
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
            </div>

            <div className="space-y-3">
              {/* Offene Jobs zuerst */}
              {open.map((a) => (
                <OpenJobCard
                  key={a.id}
                  assignment={a}
                  loading={loadingId === a.booking.id}
                  onClaim={() => claimJob(a.booking.id)}
                />
              ))}
              {/* Zugesagte Jobs */}
              {mine.map((a) => (
                <JobCard
                  key={a.id}
                  assignment={a}
                  isCleaner={isCleaner}
                  loading={loadingId === a.id}
                  onMarkDone={() => markDone(a.booking.id, a.id)}
                  onUnavailable={() => { setUnavailableId(a.id); setUnavailableNote(""); }}
                  onCancelUnavailable={() => cancelUnavailable(a)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {upcoming.length === 0 && openAssignments.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.40)", fontSize: 14 }}>
          Alle Aufträge erledigt.
        </div>
      )}

      {/* Erledigt */}
      {done.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.40)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              Erledigt ({done.length})
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          </div>
          <div className="space-y-3" style={{ opacity: 0.6 }}>
            {done.map((a) => (
              <JobCard key={a.id} assignment={a} isCleaner={isCleaner} loading={false} />
            ))}
          </div>
        </section>
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
                {formatDateLong(a.booking.checkIn)} · {a.booking.apartment.name}
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
                <button onClick={() => submitUnavailable(a)} disabled={loadingId === a.id} style={{ flex: 1, padding: "12px 0", background: "rgba(239,68,68,0.85)", border: "none", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  {loadingId === a.id ? "Wird gesendet…" : "Absagen"}
                </button>
                <button onClick={() => setUnavailableId(null)} className="btn-secondary" style={{ padding: "12px 18px" }}>Abbrechen</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Offener Job (Auktion) ────────────────────────────────────────────────────

function OpenJobCard({ assignment, loading, onClaim }: {
  assignment: OpenAssignment; loading: boolean; onClaim: () => void;
}) {
  const b = assignment.booking;
  const aptColor = b.apartment.color ?? "#0D9488";
  return (
    <div style={{ background: "rgba(16,185,129,0.08)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 20, overflow: "hidden" }}>
      <div style={{ height: 4, backgroundColor: aptColor }} />
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: aptColor, display: "inline-block" }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{b.apartment.name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(16,185,129,0.20)", border: "1px solid rgba(16,185,129,0.35)", color: "#6ee7b7" }}>Offen</span>
          </div>
        </div>
        <div className="space-y-2" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <Home style={{ width: 18, height: 18, color: "rgba(255,255,255,0.40)", marginTop: 2, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>Reinigung</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.2 }}>{formatDateLong(b.checkIn)}</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>
                bis {formatDateShort(new Date(b.checkOut))}{b.departureTime && ` · Abreise bis ${b.departureTime} Uhr`}
              </p>
              {b.arrivalTime && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", marginTop: 1 }}>Anreise ab {b.arrivalTime} Uhr</p>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users style={{ width: 18, height: 18, color: "rgba(255,255,255,0.40)", flexShrink: 0 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{b.guestCount} {b.guestCount === 1 ? "Person" : "Personen"}</p>
          </div>
        </div>
        <button
          onClick={onClaim}
          disabled={loading}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", background: loading ? "rgba(255,255,255,0.10)" : "rgba(16,185,129,0.85)", border: "none", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 16, cursor: loading ? "not-allowed" : "pointer" }}
        >
          <Zap style={{ width: 20, height: 20 }} />
          {loading ? "Wird zugesagt…" : "Jetzt zusagen"}
        </button>
      </div>
    </div>
  );
}

// ─── Zugesagter Job ───────────────────────────────────────────────────────────

export function JobCard({ assignment, isCleaner, loading, onMarkDone, onUnavailable, onCancelUnavailable }: {
  assignment: Assignment; isCleaner: boolean; loading: boolean;
  onMarkDone?: () => void; onUnavailable?: () => void; onCancelUnavailable?: () => void;
}) {
  const router = useRouter();
  const b = assignment.booking;
  const isDone   = assignment.status === "COMPLETED";
  const isAbsage = assignment.cleanerUnavailable;
  const aptColor = b.apartment.color ?? "#0D9488";

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(assignment.notes ?? "");
  const [notesSaving, setNotesSaving] = useState(false);

  async function saveNotes() {
    setNotesSaving(true);
    await fetch(`/api/bookings/${b.id}/assignment-notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notesValue }),
    });
    setNotesSaving(false);
    setEditingNotes(false);
    router.refresh();
  }

  return (
    <div style={{
      background: isAbsage ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.14)",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      border: isAbsage ? "1px solid rgba(239,68,68,0.40)" : isDone ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(255,255,255,0.22)",
      borderRadius: 20, overflow: "hidden",
    }}>
      <div style={{ height: 4, backgroundColor: isAbsage ? "#ef4444" : aptColor }} />
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: aptColor, display: "inline-block" }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{b.apartment.name}</span>
            {!isCleaner && assignment.cleaner && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>· {assignment.cleaner.name}</span>}
          </div>
          {isDone && <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#6ee7b7", fontSize: 13, fontWeight: 600 }}><CheckCircle style={{ width: 16, height: 16 }} /> Erledigt</span>}
          {isAbsage && <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#f87171", fontSize: 13, fontWeight: 700 }}><AlertTriangle style={{ width: 16, height: 16 }} /> Abgesagt</span>}
        </div>

        {isAbsage && assignment.cleanerUnavailableNote && (
          <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>„{assignment.cleanerUnavailableNote}"</p>
          </div>
        )}

        <div className="space-y-3">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <Home style={{ width: 20, height: 20, color: "rgba(255,255,255,0.40)", marginTop: 3, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>Reinigung</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.15, marginTop: 2 }}>{formatDateLong(b.checkIn)}</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>
                bis {formatDateShort(new Date(b.checkOut))}{b.departureTime && ` · Abreise bis ${b.departureTime} Uhr`}
              </p>
              {b.arrivalTime && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>Anreise ab {b.arrivalTime} Uhr</p>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Users style={{ width: 20, height: 20, color: "rgba(255,255,255,0.40)", flexShrink: 0 }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{b.guestCount} {b.guestCount === 1 ? "Person" : "Personen"}</p>
          </div>
          {/* Hinweise — Admin kann bearbeiten, Reiniger sieht nur Text */}
          {!isCleaner && editingNotes ? (
            <div style={{ padding: "12px 14px", background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#fcd34d", marginBottom: 8 }}>Hinweis für Reiniger:</p>
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="z.B. Kinderbett aufbauen, 3 Erwachsene + 1 Kind…"
                rows={3}
                className="form-input"
                style={{ resize: "none", marginBottom: 10, fontSize: 13 }}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={saveNotes}
                  disabled={notesSaving}
                  style={{ padding: "8px 16px", background: "rgba(245,158,11,0.75)", border: "none", borderRadius: 9, color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {notesSaving ? "Speichern…" : "Speichern"}
                </button>
                <button
                  onClick={() => { setEditingNotes(false); setNotesValue(assignment.notes ?? ""); }}
                  style={{ padding: "8px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 9, color: "rgba(255,255,255,0.65)", fontSize: 13, cursor: "pointer" }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => !isCleaner && setEditingNotes(true)}
              style={{
                padding: "10px 14px",
                background: notesValue ? "rgba(245,158,11,0.10)" : "rgba(255,255,255,0.05)",
                border: notesValue ? "1px solid rgba(245,158,11,0.30)" : "1px dashed rgba(255,255,255,0.15)",
                borderRadius: 10,
                cursor: !isCleaner ? "pointer" : "default",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
                minHeight: 38,
              }}
            >
              <div>
                {notesValue ? (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#fcd34d", marginBottom: 3 }}>Hinweise:</p>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.80)" }}>{notesValue}</p>
                  </>
                ) : (
                  !isCleaner && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Hinweis hinzufügen…</p>
                )}
              </div>
              {!isCleaner && (
                <Pencil style={{ width: 13, height: 13, color: "rgba(255,255,255,0.30)", flexShrink: 0, marginTop: 2 }} />
              )}
            </div>
          )}
        </div>

        {!isDone && (
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            {!isAbsage && onMarkDone && (
              <button onClick={onMarkDone} disabled={loading} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", background: loading ? "rgba(255,255,255,0.10)" : "rgba(16,185,129,0.85)", border: "none", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 16, cursor: loading ? "not-allowed" : "pointer" }}>
                <CheckCircle style={{ width: 20, height: 20 }} />{loading ? "Wird gespeichert…" : "Erledigt"}
              </button>
            )}
            {isCleaner && !isAbsage && onUnavailable && (
              <button onClick={onUnavailable} disabled={loading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px 16px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 12, color: "#fca5a5", fontWeight: 600, fontSize: 14, cursor: loading ? "not-allowed" : "pointer" }}>
                <AlertTriangle style={{ width: 16, height: 16 }} />Kann nicht
              </button>
            )}
            {isCleaner && isAbsage && onCancelUnavailable && (
              <button onClick={onCancelUnavailable} disabled={loading} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px 0", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 12, color: "rgba(255,255,255,0.75)", fontWeight: 600, fontSize: 14, cursor: loading ? "not-allowed" : "pointer" }}>
                Absage zurücknehmen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
