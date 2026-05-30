"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateLong } from "@/lib/utils";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday,
  addMonths, subMonths, format, getYear, startOfYear, endOfYear,
  eachMonthOfInterval,
} from "date-fns";
import { de } from "date-fns/locale";
import { JobCard } from "./MyJobsList";

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

export function MyJobsCalendar({
  assignments,
  isCleaner,
}: {
  assignments: Assignment[];
  isCleaner: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"month" | "year">("month");
  const [calMonth, setCalMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [unavailableId, setUnavailableId] = useState<string | null>(null);
  const [unavailableNote, setUnavailableNote] = useState("");

  function assignmentsForDay(d: Date) {
    return assignments.filter((a) => isSameDay(new Date(a.booking.checkOut), d));
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

  const selectedAssignments = selectedDay ? assignmentsForDay(selectedDay) : [];

  return (
    <div className="space-y-4">
      {/* View-Toggle */}
      <div style={{ display: "flex", gap: 6, padding: 4, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, width: "fit-content" }}>
        {(["month", "year"] as const).map((v) => (
          <button
            key={v}
            onClick={() => { setView(v); setSelectedDay(null); }}
            style={{
              padding: "8px 18px", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: view === v ? "rgba(255,255,255,0.20)" : "transparent",
              border: "none",
              color: view === v ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)",
              transition: "all 0.15s",
            }}
          >
            {v === "month" ? "Monat" : "Jahresübersicht"}
          </button>
        ))}
      </div>

      {view === "year" ? (
        <YearView
          assignments={assignments}
          year={getYear(calMonth)}
          onPrevYear={() => setCalMonth(new Date(getYear(calMonth) - 1, 0, 1))}
          onNextYear={() => setCalMonth(new Date(getYear(calMonth) + 1, 0, 1))}
          selectedDay={selectedDay}
          onSelectDay={(d) => {
            setSelectedDay((prev) => (prev && isSameDay(prev, d) ? null : d));
          }}
          onSwitchToMonth={(d) => {
            setCalMonth(d);
            setView("month");
          }}
        />
      ) : (
        <MonthView
          assignments={assignments}
          month={calMonth}
          onPrev={() => { setCalMonth(subMonths(calMonth, 1)); setSelectedDay(null); }}
          onNext={() => { setCalMonth(addMonths(calMonth, 1)); setSelectedDay(null); }}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      )}

      {/* Ausgewählter Tag — Job-Karten */}
      {selectedAssignments.length > 0 && (
        <div className="space-y-3">
          <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            {formatDateLong(selectedDay!)}
          </p>
          {selectedAssignments.map((a) => (
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

// ─── Monatsansicht ────────────────────────────────────────────────────────────

function MonthView({
  assignments, month, onPrev, onNext, selectedDay, onSelectDay,
}: {
  assignments: Assignment[];
  month: Date;
  onPrev: () => void;
  onNext: () => void;
  selectedDay: Date | null;
  onSelectDay: (d: Date | null) => void;
}) {
  const monthStart = startOfMonth(month);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const DAYS       = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  function dayAssignments(d: Date) {
    return assignments.filter((a) => isSameDay(new Date(a.booking.checkOut), d));
  }

  return (
    <div style={{ ...glass({ padding: 16 }) }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {DAYS.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.50)", paddingBottom: 6 }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {days.map((day) => {
          const dayA = dayAssignments(day);
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const selected = selectedDay ? isSameDay(day, selectedDay) : false;
          const hasJob = dayA.length > 0;
          const hasAbsage = dayA.some((a) => a.cleanerUnavailable);

          return (
            <button
              key={day.toISOString()}
              onClick={() => { if (!hasJob) return; onSelectDay(selected ? null : day); }}
              style={{
                position: "relative",
                display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center",
                aspectRatio: "1", borderRadius: 10,
                background: selected ? "rgba(13,148,136,0.45)" : today ? "rgba(13,148,136,0.20)" : hasJob ? "rgba(255,255,255,0.10)" : "transparent",
                border: selected ? "1px solid rgba(13,148,136,0.7)" : today ? "1px solid rgba(13,148,136,0.4)" : "1px solid transparent",
                cursor: hasJob ? "pointer" : "default",
                padding: "4px 2px",
              }}
            >
              <span style={{
                fontSize: 13, fontWeight: today ? 700 : hasJob ? 600 : 400,
                color: !inMonth ? "rgba(255,255,255,0.20)" : today || selected ? "rgba(255,255,255,0.95)" : hasJob ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.45)",
              }}>
                {format(day, "d")}
              </span>
              {hasJob && (
                <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                  {dayA.map((a) => (
                    <span key={a.id} style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: a.cleanerUnavailable ? "#f87171" : (a.booking.apartment.color ?? "#14B8A6") }} />
                  ))}
                </div>
              )}
              {hasAbsage && <span style={{ position: "absolute", top: 2, right: 2, fontSize: 8 }}>⚠️</span>}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" as const }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#14B8A6", display: "inline-block" }} />
          Reinigung
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", display: "inline-block" }} />
          Abgesagt
        </span>
      </div>
    </div>
  );
}

// ─── Jahresübersicht ──────────────────────────────────────────────────────────

function YearView({
  assignments, year, onPrevYear, onNextYear, selectedDay, onSelectDay, onSwitchToMonth,
}: {
  assignments: Assignment[];
  year: number;
  onPrevYear: () => void;
  onNextYear: () => void;
  selectedDay: Date | null;
  onSelectDay: (d: Date) => void;
  onSwitchToMonth: (d: Date) => void;
}) {
  const months = eachMonthOfInterval({
    start: startOfYear(new Date(year, 0, 1)),
    end: endOfYear(new Date(year, 0, 1)),
  });

  return (
    <div className="space-y-4">
      {/* Jahr-Navigation */}
      <div style={{ ...glass({ padding: "12px 20px", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }) }}>
        <button onClick={onPrevYear} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", cursor: "pointer", padding: 6, borderRadius: 8 }}>
          <ChevronLeft style={{ width: 20, height: 20 }} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 18, color: "rgba(255,255,255,0.95)" }}>{year}</span>
        <button onClick={onNextYear} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", cursor: "pointer", padding: 6, borderRadius: 8 }}>
          <ChevronRight style={{ width: 20, height: 20 }} />
        </button>
      </div>

      {/* 12 Mini-Monate */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {months.map((month) => (
          <MiniMonth
            key={month.toISOString()}
            month={month}
            assignments={assignments}
            selectedDay={selectedDay}
            onSelectDay={onSelectDay}
            onSwitchToMonth={onSwitchToMonth}
          />
        ))}
      </div>
    </div>
  );
}

function MiniMonth({
  month, assignments, selectedDay, onSelectDay, onSwitchToMonth,
}: {
  month: Date;
  assignments: Assignment[];
  selectedDay: Date | null;
  onSelectDay: (d: Date) => void;
  onSwitchToMonth: (d: Date) => void;
}) {
  const monthStart = startOfMonth(month);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const DAYS       = ["M", "D", "M", "D", "F", "S", "S"];

  const monthHasJobs = assignments.some((a) => isSameMonth(new Date(a.booking.checkOut), month));

  function dayA(d: Date) {
    return assignments.filter((a) => isSameDay(new Date(a.booking.checkOut), d));
  }

  return (
    <div style={{
      ...glass({ borderRadius: 16, padding: 12, opacity: monthHasJobs ? 1 : 0.5 }),
    }}>
      <button
        onClick={() => onSwitchToMonth(month)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8,
          width: "100%", textAlign: "left" as const,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
          {format(month, "MMMM", { locale: de })}
        </span>
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 3 }}>
        {DAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.35)", paddingBottom: 3 }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {days.map((day) => {
          const da = dayA(day);
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const selected = selectedDay ? isSameDay(day, selectedDay) : false;
          const hasJob = da.length > 0 && inMonth;
          const hasAbsage = da.some((a) => a.cleanerUnavailable);

          return (
            <button
              key={day.toISOString()}
              onClick={() => { if (!hasJob) return; onSelectDay(day); }}
              style={{
                display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center",
                aspectRatio: "1", borderRadius: 5,
                background: selected && inMonth ? "rgba(13,148,136,0.50)" : today && inMonth ? "rgba(13,148,136,0.25)" : "transparent",
                border: "1px solid transparent",
                cursor: hasJob ? "pointer" : "default",
                padding: 1,
                position: "relative",
              }}
            >
              <span style={{
                fontSize: 9, fontWeight: hasJob ? 700 : 400,
                color: !inMonth ? "rgba(255,255,255,0.10)"
                  : today || selected ? "rgba(255,255,255,0.95)"
                  : hasJob ? "rgba(255,255,255,0.90)"
                  : "rgba(255,255,255,0.35)",
              }}>
                {inMonth ? format(day, "d") : ""}
              </span>
              {hasJob && (
                <span style={{
                  width: 4, height: 4, borderRadius: "50%",
                  backgroundColor: hasAbsage ? "#f87171" : (da[0].booking.apartment.color ?? "#14B8A6"),
                  position: "absolute", bottom: 1,
                }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
