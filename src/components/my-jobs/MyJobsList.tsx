"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateLong } from "@/lib/utils";
import {
  Home, Users, Clock, CheckCircle, ClipboardList,
  Calendar, List, ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday,
  addMonths, subMonths, format, startOfDay,
} from "date-fns";
import { de } from "date-fns/locale";

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

export function MyJobsList({
  assignments,
  isCleaner,
}: {
  assignments: Assignment[];
  isCleaner: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [unavailableId, setUnavailableId] = useState<string | null>(null);
  const [unavailableNote, setUnavailableNote] = useState("");
  const [calMonth, setCalMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const upcoming = assignments.filter(
    (a) => a.status === "ASSIGNED" && new Date(a.booking.checkOut) >= startOfDay(new Date())
  );
  const done = assignments.filter((a) => a.status === "COMPLETED");
  const unavailable = assignments.filter((a) => a.cleanerUnavailable);

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

  if (assignments.length === 0) {
    return (
      <div style={{ ...glass(), padding: "48px 24px", textAlign: "center" }}>
        <ClipboardList style={{ width: 48, height: 48, color: "rgba(255,255,255,0.2)", margin: "0 auto 16px" }} />
        <p style={{ fontSize: 17, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>Keine Aufträge.</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
          {isCleaner ? "Du wirst benachrichtigt wenn ein Auftrag zugewiesen wird." : "Noch keine Aufträge zugewiesen."}
        </p>
      </div>
    );
  }

  // Absage-Hinweis für Admin/Manager
  const unavailableWarning = !isCleaner && unavailable.length > 0;

  return (
    <div className="space-y-4">
      {/* Absage-Banner für Admin */}
      {unavailableWarning && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "14px 18px",
          background: "rgba(239,68,68,0.15)",
          border: "1px solid rgba(239,68,68,0.35)",
          borderRadius: 16,
        }}>
          <AlertTriangle style={{ width: 20, height: 20, color: "#f87171", flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>
              {unavailable.length} {unavailable.length === 1 ? "Absage" : "Absagen"} — Reinigung muss neu organisiert werden
            </p>
            {unavailable.map((a) => (
              <p key={a.id} style={{ fontSize: 13, color: "rgba(255,255,255,0.70)" }}>
                · {formatDateLong(a.booking.checkOut)} — {a.booking.apartment.name}
                {a.cleanerUnavailableNote && <span style={{ color: "rgba(255,255,255,0.50)" }}> · „{a.cleanerUnavailableNote}"</span>}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* View-Umschalter */}
      <div style={{ display: "flex", gap: 6, padding: 4, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, width: "fit-content" }}>
        {(["list", "calendar"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 18px", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: view === v ? "rgba(255,255,255,0.20)" : "transparent",
              border: "none",
              color: view === v ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)",
              transition: "all 0.15s",
            }}
          >
            {v === "list" ? <List style={{ width: 15, height: 15 }} /> : <Calendar style={{ width: 15, height: 15 }} />}
            {v === "list" ? "Liste" : "Kalender"}
          </button>
        ))}
      </div>

      {view === "calendar" ? (
        <CalendarView
          assignments={assignments}
          month={calMonth}
          onPrev={() => setCalMonth(subMonths(calMonth, 1))}
          onNext={() => setCalMonth(addMonths(calMonth, 1))}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onMarkDone={markDone}
          onUnavailable={(id) => { setUnavailableId(id); setUnavailableNote(""); }}
          onCancelUnavailable={cancelUnavailable}
          loadingId={loadingId}
          isCleaner={isCleaner}
        />
      ) : (
        <ListView
          upcoming={upcoming}
          done={done}
          loadingId={loadingId}
          isCleaner={isCleaner}
          onMarkDone={markDone}
          onUnavailable={(id) => { setUnavailableId(id); setUnavailableNote(""); }}
          onCancelUnavailable={cancelUnavailable}
        />
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

// ─── Listenansicht ────────────────────────────────────────────────────────────

function ListView({
  upcoming, done, loadingId, isCleaner, onMarkDone, onUnavailable, onCancelUnavailable,
}: {
  upcoming: Assignment[];
  done: Assignment[];
  loadingId: string | null;
  isCleaner: boolean;
  onMarkDone: (bookingId: string, id: string) => void;
  onUnavailable: (id: string) => void;
  onCancelUnavailable: (a: Assignment) => void;
}) {
  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.60)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Offen ({upcoming.length})
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
          </div>
          <div className="space-y-3">
            {upcoming.map((a) => (
              <JobCard
                key={a.id}
                assignment={a}
                isCleaner={isCleaner}
                loading={loadingId === a.id}
                onMarkDone={() => onMarkDone(a.booking.id, a.id)}
                onUnavailable={() => onUnavailable(a.id)}
                onCancelUnavailable={() => onCancelUnavailable(a)}
              />
            ))}
          </div>
        </section>
      )}

      {upcoming.length === 0 && done.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.40)", fontSize: 14 }}>
          Alle Aufträge erledigt.
        </div>
      )}

      {done.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.40)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
    </div>
  );
}

// ─── Kalenderansicht ──────────────────────────────────────────────────────────

function CalendarView({
  assignments, month, onPrev, onNext, selectedDay, onSelectDay,
  onMarkDone, onUnavailable, onCancelUnavailable, loadingId, isCleaner,
}: {
  assignments: Assignment[];
  month: Date;
  onPrev: () => void;
  onNext: () => void;
  selectedDay: Date | null;
  onSelectDay: (d: Date | null) => void;
  onMarkDone: (bookingId: string, id: string) => void;
  onUnavailable: (id: string) => void;
  onCancelUnavailable: (a: Assignment) => void;
  loadingId: string | null;
  isCleaner: boolean;
}) {
  const monthStart = startOfMonth(month);
  const monthEnd   = endOfMonth(month);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const DAYS       = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  function assignmentsForDay(d: Date) {
    return assignments.filter((a) => isSameDay(new Date(a.booking.checkOut), d));
  }

  const selectedAssignments = selectedDay ? assignmentsForDay(selectedDay) : [];

  return (
    <div className="space-y-4">
      <div style={{ ...glass(), padding: "16px" }}>
        {/* Monat-Navigation */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={onPrev} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", cursor: "pointer", padding: 6, borderRadius: 8 }}>
            <ChevronLeft style={{ width: 20, height: 20 }} />
          </button>
          <span style={{ fontWeight: 700, fontSize: 15, color: "rgba(255,255,255,0.95)" }}>
            {format(month, "MMMM yyyy", { locale: de })}
          </span>
          <button onClick={onNext} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", cursor: "pointer", padding: 6, borderRadius: 8 }}>
            <ChevronRight style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Wochentag-Header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
          {DAYS.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.50)", paddingBottom: 6 }}>
              {d}
            </div>
          ))}
        </div>

        {/* Kalender-Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
          {days.map((day) => {
            const dayAssignments = assignmentsForDay(day);
            const inMonth  = isSameMonth(day, month);
            const today    = isToday(day);
            const selected = selectedDay ? isSameDay(day, selectedDay) : false;
            const hasJob   = dayAssignments.length > 0;
            const hasAbsage = dayAssignments.some((a) => a.cleanerUnavailable);

            return (
              <button
                key={day.toISOString()}
                onClick={() => {
                  if (!hasJob) return;
                  onSelectDay(selected ? null : day);
                }}
                style={{
                  position: "relative",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  aspectRatio: "1",
                  borderRadius: 10,
                  background: selected
                    ? "rgba(13,148,136,0.45)"
                    : today
                    ? "rgba(13,148,136,0.20)"
                    : hasJob
                    ? "rgba(255,255,255,0.10)"
                    : "transparent",
                  border: selected
                    ? "1px solid rgba(13,148,136,0.7)"
                    : today
                    ? "1px solid rgba(13,148,136,0.4)"
                    : "1px solid transparent",
                  cursor: hasJob ? "pointer" : "default",
                  padding: "4px 2px",
                }}
              >
                <span style={{
                  fontSize: 13, fontWeight: today ? 700 : hasJob ? 600 : 400,
                  color: !inMonth
                    ? "rgba(255,255,255,0.20)"
                    : today || selected
                    ? "rgba(255,255,255,0.95)"
                    : hasJob
                    ? "rgba(255,255,255,0.90)"
                    : "rgba(255,255,255,0.45)",
                }}>
                  {format(day, "d")}
                </span>
                {hasJob && (
                  <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                    {dayAssignments.map((a) => (
                      <span
                        key={a.id}
                        style={{
                          width: 5, height: 5, borderRadius: "50%",
                          backgroundColor: a.cleanerUnavailable
                            ? "#f87171"
                            : (a.booking.apartment.color ?? "#14B8A6"),
                        }}
                      />
                    ))}
                  </div>
                )}
                {hasAbsage && (
                  <span style={{ position: "absolute", top: 2, right: 2, fontSize: 8 }}>⚠️</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legende */}
        <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" as const }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#14B8A6", display: "inline-block" }} />
            Auftrag
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", display: "inline-block" }} />
            Absage
          </span>
        </div>
      </div>

      {/* Ausgewählter Tag */}
      {selectedAssignments.length > 0 && (
        <div className="space-y-3">
          {selectedAssignments.map((a) => (
            <JobCard
              key={a.id}
              assignment={a}
              isCleaner={isCleaner}
              loading={loadingId === a.id}
              onMarkDone={() => onMarkDone(a.booking.id, a.id)}
              onUnavailable={() => onUnavailable(a.id)}
              onCancelUnavailable={() => onCancelUnavailable(a)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Auftrags-Karte ───────────────────────────────────────────────────────────

function JobCard({
  assignment, isCleaner, loading, onMarkDone, onUnavailable, onCancelUnavailable,
}: {
  assignment: Assignment;
  isCleaner: boolean;
  loading: boolean;
  onMarkDone?: () => void;
  onUnavailable?: () => void;
  onCancelUnavailable?: () => void;
}) {
  const b = assignment.booking;
  const isDone   = assignment.status === "COMPLETED";
  const isAbsage = assignment.cleanerUnavailable;
  const aptColor = b.apartment.color ?? "#0D9488";

  return (
    <div style={{
      background: isAbsage
        ? "rgba(239,68,68,0.12)"
        : "rgba(255,255,255,0.14)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: isAbsage
        ? "1px solid rgba(239,68,68,0.40)"
        : isDone
        ? "1px solid rgba(16,185,129,0.35)"
        : "1px solid rgba(255,255,255,0.22)",
      borderRadius: 20,
      overflow: "hidden",
    }}>
      <div style={{ height: 4, backgroundColor: isAbsage ? "#ef4444" : aptColor }} />
      <div style={{ padding: "16px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: aptColor, display: "inline-block" }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              {b.apartment.name}
            </span>
            {!isCleaner && assignment.cleaner && (
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>· {assignment.cleaner.name}</span>
            )}
          </div>
          {isDone && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#6ee7b7", fontSize: 13, fontWeight: 600 }}>
              <CheckCircle style={{ width: 16, height: 16 }} /> Erledigt
            </span>
          )}
          {isAbsage && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#f87171", fontSize: 13, fontWeight: 700 }}>
              <AlertTriangle style={{ width: 16, height: 16 }} /> Abgesagt
            </span>
          )}
        </div>

        {/* Absage-Hinweis */}
        {isAbsage && assignment.cleanerUnavailableNote && (
          <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>„{assignment.cleanerUnavailableNote}"</p>
          </div>
        )}

        {/* Details */}
        <div className="space-y-3">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <Home style={{ width: 20, height: 20, color: "rgba(255,255,255,0.40)", marginTop: 3, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>Reinigung nach Abreise</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.15, marginTop: 2 }}>
                {formatDateLong(b.checkOut)}
              </p>
              {b.departureTime && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                  Abreise bis {b.departureTime} Uhr
                </p>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Clock style={{ width: 20, height: 20, color: "rgba(255,255,255,0.40)", flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>Nächste Anreise</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginTop: 1 }}>
                {formatDateLong(b.checkIn)}{b.arrivalTime && ` ab ${b.arrivalTime} Uhr`}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Users style={{ width: 20, height: 20, color: "rgba(255,255,255,0.40)", flexShrink: 0 }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
              {b.guestCount} {b.guestCount === 1 ? "Person" : "Personen"}
            </p>
          </div>

          {assignment.notes && (
            <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)", borderRadius: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#fcd34d", marginBottom: 3 }}>Hinweise:</p>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.80)" }}>{assignment.notes}</p>
            </div>
          )}
        </div>

        {/* Aktionen */}
        {!isDone && (
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            {!isAbsage && onMarkDone && (
              <button
                onClick={onMarkDone}
                disabled={loading}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "14px 0",
                  background: loading ? "rgba(255,255,255,0.10)" : "rgba(16,185,129,0.85)",
                  border: "none", borderRadius: 12,
                  color: "white", fontWeight: 700, fontSize: 16,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                <CheckCircle style={{ width: 20, height: 20 }} />
                {loading ? "Wird gespeichert…" : "Erledigt"}
              </button>
            )}
            {isCleaner && !isAbsage && onUnavailable && (
              <button
                onClick={onUnavailable}
                disabled={loading}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "14px 16px",
                  background: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  borderRadius: 12,
                  color: "#fca5a5", fontWeight: 600, fontSize: 14,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                <AlertTriangle style={{ width: 16, height: 16 }} />
                Kann nicht
              </button>
            )}
            {isCleaner && isAbsage && onCancelUnavailable && (
              <button
                onClick={onCancelUnavailable}
                disabled={loading}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "14px 0",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  borderRadius: 12,
                  color: "rgba(255,255,255,0.75)", fontWeight: 600, fontSize: 14,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Absage zurücknehmen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
