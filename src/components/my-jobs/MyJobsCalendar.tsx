"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateLong } from "@/lib/utils";
import { AlertTriangle, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday,
  addMonths, subMonths, format, getYear, startOfYear, endOfYear,
  eachMonthOfInterval, startOfDay, isBefore, isAfter,
} from "date-fns";
import { de } from "date-fns/locale";
import { JobCard, OpenAssignment, Assignment } from "./MyJobsList";

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "rgba(255,255,255,0.14)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.22)",
  borderRadius: 20,
  ...extra,
});

export function MyJobsCalendar({
  myAssignments,
  openAssignments,
  isCleaner,
}: {
  myAssignments: Assignment[];
  openAssignments: OpenAssignment[];
  isCleaner: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"month" | "year">("month");
  const [calMonth, setCalMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [unavailableId, setUnavailableId] = useState<string | null>(null);
  const [unavailableNote, setUnavailableNote] = useState("");

  function assignmentsForDay(d: Date): Assignment[] {
    // Zeige Auftrag am Checkout-Tag (= Reinigungstag)
    return myAssignments.filter((a) => isSameDay(new Date(a.booking.checkOut), d));
  }
  function openForDay(d: Date): OpenAssignment[] {
    return openAssignments.filter((a) => isSameDay(new Date(a.booking.checkOut), d));
  }

  async function claimJob(bookingId: string) {
    setLoadingId(bookingId);
    await fetch(`/api/bookings/${bookingId}/claim`, { method: "POST" });
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

  const selectedAssignments = selectedDay ? assignmentsForDay(selectedDay) : [];
  const selectedOpen = selectedDay ? openForDay(selectedDay) : [];

  return (
    <div className="space-y-4">
      {/* View-Toggle */}
      <div style={{ display: "flex", gap: 6, padding: 4, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, width: "fit-content" }}>
        {(["month", "year"] as const).map((v) => (
          <button key={v} onClick={() => { setView(v); setSelectedDay(null); }}
            style={{ padding: "8px 18px", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", background: view === v ? "rgba(255,255,255,0.20)" : "transparent", border: "none", color: view === v ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)", transition: "all 0.15s" }}>
            {v === "month" ? "Monat" : "Jahresübersicht"}
          </button>
        ))}
      </div>

      {view === "year" ? (
        <YearView
          myAssignments={myAssignments}
          openAssignments={openAssignments}
          year={getYear(calMonth)}
          onPrevYear={() => setCalMonth(new Date(getYear(calMonth) - 1, 0, 1))}
          onNextYear={() => setCalMonth(new Date(getYear(calMonth) + 1, 0, 1))}
          selectedDay={selectedDay}
          onSelectDay={(d) => setSelectedDay((prev) => (prev && isSameDay(prev, d) ? null : d))}
          onSwitchToMonth={(d) => { setCalMonth(d); setView("month"); }}
        />
      ) : (
        <MonthView
          myAssignments={myAssignments}
          openAssignments={openAssignments}
          month={calMonth}
          onPrev={() => { setCalMonth(subMonths(calMonth, 1)); setSelectedDay(null); }}
          onNext={() => { setCalMonth(addMonths(calMonth, 1)); setSelectedDay(null); }}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      )}

      {/* Ausgewählter Tag */}
      {(selectedAssignments.length > 0 || selectedOpen.length > 0) && (
        <div className="space-y-3">
          <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            {formatDateLong(selectedDay!)}
          </p>
          {selectedOpen.map((a) => (
            <div key={a.id} style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 16, padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.90)" }}>{a.booking.apartment.name}</p>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                    {a.nextGuestCount != null
                      ? `Anreise ${a.nextGuestCount} · Abr. ${a.booking.guestCount}`
                      : `${a.booking.guestCount} Gäste`}
                    {a.booking.departureTime && ` · bis ${a.booking.departureTime}`}
                  </p>
                </div>
                <button onClick={() => claimJob(a.booking.id)} disabled={loadingId === a.booking.id}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: "rgba(16,185,129,0.85)", border: "none", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", flexShrink: 0 }}>
                  <Zap style={{ width: 16, height: 16 }} />
                  {loadingId === a.booking.id ? "…" : "Zusagen"}
                </button>
              </div>
            </div>
          ))}
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
        const a = myAssignments.find((x) => x.id === unavailableId);
        if (!a) return null;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, padding: "16px 16px max(calc(env(safe-area-inset-bottom) + 72px), 80px) 16px" }}>
            <div style={{ background: "#0c3d38", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 24, width: "100%", maxWidth: 480, padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: 6 }}>Ich kann nicht</h3>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 18 }}>{formatDateLong(a.booking.checkOut)} · {a.booking.apartment.name}</p>
              <textarea value={unavailableNote} onChange={(e) => setUnavailableNote(e.target.value)} placeholder="Grund (optional)…" rows={3} className="form-input" style={{ resize: "none", marginBottom: 16 }} />
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

// ─── Monatsansicht mit vollen Buchungsbalken ──────────────────────────────────

function MonthView({
  myAssignments, openAssignments, month, onPrev, onNext, selectedDay, onSelectDay,
}: {
  myAssignments: Assignment[];
  openAssignments: OpenAssignment[];
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

  // Buchungsbalken: alle Assignments mit ihrem Zeitraum
  type BarInfo = { id: string; color: string; guestCount: number; nextGuestCount: number | null; isOpen: boolean; isAbsage: boolean; bookingId: string; };

  function getBarsForDay(day: Date): Array<BarInfo & { isStart: boolean; isEnd: boolean; isSingleDay: boolean }> {
    const d = startOfDay(day);
    const result: Array<BarInfo & { isStart: boolean; isEnd: boolean; isSingleDay: boolean }> = [];

    for (const a of myAssignments) {
      const ci = startOfDay(new Date(a.booking.checkIn));
      const co = startOfDay(new Date(a.booking.checkOut));
      if (d >= ci && d <= co) {
        result.push({
          id: a.id,
          color: a.cleanerUnavailable ? "#ef4444" : (a.booking.apartment.color ?? "#14B8A6"),
          guestCount: a.booking.guestCount,
          nextGuestCount: a.nextGuestCount ?? null,
          isOpen: false,
          isAbsage: a.cleanerUnavailable,
          bookingId: a.booking.id,
          isStart: isSameDay(d, ci),
          isEnd: isSameDay(d, co),
          isSingleDay: isSameDay(ci, co),
        });
      }
    }

    for (const a of openAssignments) {
      const ci = startOfDay(new Date(a.booking.checkIn));
      const co = startOfDay(new Date(a.booking.checkOut));
      if (d >= ci && d <= co) {
        result.push({
          id: a.id,
          color: a.booking.apartment.color ?? "#14B8A6",
          guestCount: a.booking.guestCount,
          nextGuestCount: a.nextGuestCount ?? null,
          isOpen: true,
          isAbsage: false,
          bookingId: a.booking.id,
          isStart: isSameDay(d, ci),
          isEnd: isSameDay(d, co),
          isSingleDay: isSameDay(ci, co),
        });
      }
    }

    return result;
  }

  return (
    <div style={{ ...glass({ padding: "16px 0 16px 0" }) }}>
      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "0 16px" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 8px", marginBottom: 4 }}>
        {DAYS.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", paddingBottom: 6 }}>{d}</div>
        ))}
      </div>

      {/* Kalender-Grid — kein gap für verbundene Balken */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, padding: "0 4px" }}>
        {days.map((day) => {
          const bars = getBarsForDay(day);
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const selected = selectedDay ? isSameDay(day, selectedDay) : false;
          const hasAny = bars.length > 0 && inMonth;
          const hasOpen = bars.some((b) => b.isOpen) && inMonth;
          const hasAbsage = bars.some((b) => b.isAbsage) && inMonth;
          const cleanoutDay = bars.some((b) => b.isEnd) && inMonth;

          return (
            <div
              key={day.toISOString()}
              onClick={() => { if (!hasAny) return; onSelectDay(selected ? null : day); }}
              style={{
                minHeight: 58,
                position: "relative",
                background: selected && inMonth ? "rgba(13,148,136,0.30)" : today && inMonth ? "rgba(13,148,136,0.15)" : "transparent",
                border: selected && inMonth ? "1px solid rgba(13,148,136,0.5)" : "1px solid rgba(255,255,255,0.04)",
                cursor: hasAny ? "pointer" : "default",
                overflow: "hidden",
              }}
            >
              {/* Tageszahl */}
              <div style={{ padding: "5px 5px 2px", display: "flex", justifyContent: "center" }}>
                <span style={{
                  fontSize: 12, fontWeight: today ? 700 : hasAny ? 600 : 400,
                  color: !inMonth ? "rgba(255,255,255,0.12)"
                    : today ? "rgba(255,255,255,0.95)"
                    : hasAny ? "rgba(255,255,255,0.90)"
                    : "rgba(255,255,255,0.35)",
                  width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: "50%",
                  background: today && !selected ? "rgba(13,148,136,0.35)" : "transparent",
                }}>
                  {format(day, "d")}
                </span>
              </div>

              {/* Buchungsbalken */}
              {inMonth && bars.slice(0, 3).map((bar, i) => (
                <div
                  key={bar.id + i}
                  style={{
                    height: 6,
                    marginTop: i === 0 ? 2 : 1,
                    marginLeft: bar.isSingleDay ? "15%" : bar.isStart ? "50%" : 0,
                    marginRight: bar.isSingleDay ? "15%" : bar.isEnd ? "50%" : 0,
                    backgroundColor: bar.isOpen ? "transparent" : bar.color,
                    border: bar.isOpen ? `2px dashed ${bar.color}` : "none",
                    opacity: bar.isOpen ? 0.7 : 0.9,
                    borderRadius: bar.isSingleDay ? 4
                      : bar.isStart ? "3px 0 0 3px"
                      : bar.isEnd ? "0 3px 3px 0"
                      : 0,
                    transition: "all 0.1s",
                  }}
                />
              ))}

              {/* Gästezahl am Checkout-Tag — zeigt Anreisezahl (vorzubereitende Gäste) */}
              {inMonth && bars.filter((b) => b.isEnd && !b.isOpen).map((bar) => (
                <div key={"guest-" + bar.id} style={{
                  position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)",
                  fontSize: 9, fontWeight: 800, color: "white",
                  background: bar.isAbsage ? "rgba(239,68,68,0.9)" : "rgba(13,148,136,0.9)",
                  borderRadius: 3, padding: "0px 3px", whiteSpace: "nowrap" as const,
                  lineHeight: "14px",
                }}>
                  {bar.nextGuestCount ?? bar.guestCount}G
                </div>
              ))}

              {/* Offener Job Indikator */}
              {hasOpen && !cleanoutDay && (
                <div style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "#6ee7b7" }} />
              )}
              {hasAbsage && (
                <div style={{ position: "absolute", top: 3, right: 3, fontSize: 8 }}>⚠️</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legende */}
      <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" as const, padding: "0 16px" }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 16, height: 5, borderRadius: 3, background: "#14B8A6", display: "inline-block" }} />
          Mein Auftrag
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 16, height: 5, borderRadius: 3, border: "2px dashed #14B8A6", display: "inline-block" }} />
          Offen
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 9, background: "rgba(13,148,136,0.9)", color: "white", borderRadius: 3, padding: "0 3px" }}>4G</span>
          Anreise-Gäste
        </span>
      </div>
    </div>
  );
}

// ─── Jahresübersicht ──────────────────────────────────────────────────────────

function YearView({
  myAssignments, openAssignments, year, onPrevYear, onNextYear,
  selectedDay, onSelectDay, onSwitchToMonth,
}: {
  myAssignments: Assignment[];
  openAssignments: OpenAssignment[];
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
      <div style={{ ...glass({ padding: "12px 20px", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }) }}>
        <button onClick={onPrevYear} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", cursor: "pointer", padding: 6, borderRadius: 8 }}><ChevronLeft style={{ width: 20, height: 20 }} /></button>
        <span style={{ fontWeight: 700, fontSize: 18, color: "rgba(255,255,255,0.95)" }}>{year}</span>
        <button onClick={onNextYear} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", cursor: "pointer", padding: 6, borderRadius: 8 }}><ChevronRight style={{ width: 20, height: 20 }} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {months.map((month) => (
          <MiniMonth
            key={month.toISOString()}
            month={month}
            myAssignments={myAssignments}
            openAssignments={openAssignments}
            selectedDay={selectedDay}
            onSelectDay={onSelectDay}
            onSwitchToMonth={onSwitchToMonth}
          />
        ))}
      </div>
    </div>
  );
}

function MiniMonth({ month, myAssignments, openAssignments, selectedDay, onSelectDay, onSwitchToMonth }: {
  month: Date;
  myAssignments: Assignment[];
  openAssignments: OpenAssignment[];
  selectedDay: Date | null;
  onSelectDay: (d: Date) => void;
  onSwitchToMonth: (d: Date) => void;
}) {
  const monthStart = startOfMonth(month);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const DAYS       = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  const monthHasAny = [...myAssignments, ...openAssignments].some((a) => {
    const co = new Date(a.booking.checkOut);
    return isSameMonth(co, month);
  });

  function dayHasBar(d: Date, all: Array<{ booking: { checkIn: Date; checkOut: Date } }>) {
    const day = startOfDay(d);
    return all.some((a) => {
      const ci = startOfDay(new Date(a.booking.checkIn));
      const co = startOfDay(new Date(a.booking.checkOut));
      return day >= ci && day <= co;
    });
  }

  return (
    <div style={{ ...glass({ borderRadius: 16, padding: 10, opacity: monthHasAny ? 1 : 0.45 }) }}>
      <button onClick={() => onSwitchToMonth(month)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 6, width: "100%", textAlign: "left" as const }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
          {format(month, "MMMM", { locale: de })}
        </span>
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
        {DAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 7, color: "rgba(255,255,255,0.30)", paddingBottom: 2 }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0 }}>
        {days.map((day) => {
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const selected = selectedDay ? isSameDay(day, selectedDay) : false;
          const hasMine = inMonth && dayHasBar(day, myAssignments);
          const hasOpen = inMonth && dayHasBar(day, openAssignments);
          const isCheckout = inMonth && [...myAssignments, ...openAssignments].some((a) => isSameDay(new Date(a.booking.checkOut), day));

          // Bar info for mine
          const myBarsForDay = inMonth ? myAssignments.filter((a) => {
            const d = startOfDay(day);
            return d >= startOfDay(new Date(a.booking.checkIn)) && d <= startOfDay(new Date(a.booking.checkOut));
          }) : [];
          const firstBar = myBarsForDay[0];
          const isStart = firstBar ? isSameDay(startOfDay(day), startOfDay(new Date(firstBar.booking.checkIn))) : false;
          const isEnd = firstBar ? isSameDay(startOfDay(day), startOfDay(new Date(firstBar.booking.checkOut))) : false;

          return (
            <div
              key={day.toISOString()}
              onClick={() => { if (!inMonth || (!hasMine && !hasOpen)) return; onSelectDay(day); }}
              style={{
                position: "relative",
                minHeight: 22,
                background: selected && inMonth ? "rgba(13,148,136,0.45)" : today && inMonth ? "rgba(13,148,136,0.25)" : "transparent",
                cursor: (hasMine || hasOpen) && inMonth ? "pointer" : "default",
              }}
            >
              <span style={{
                display: "block", textAlign: "center", fontSize: 9, fontWeight: hasMine ? 700 : 400, lineHeight: "14px",
                color: !inMonth ? "rgba(255,255,255,0.08)"
                  : today || selected ? "rgba(255,255,255,0.95)"
                  : hasMine ? "rgba(255,255,255,0.90)"
                  : hasOpen ? "rgba(110,231,183,0.80)"
                  : "rgba(255,255,255,0.30)",
              }}>
                {inMonth ? format(day, "d") : ""}
              </span>
              {hasMine && firstBar && (
                <div style={{
                  height: 3,
                  marginLeft: isStart ? "50%" : 0,
                  marginRight: isEnd ? "50%" : 0,
                  backgroundColor: firstBar.cleanerUnavailable ? "#ef4444" : (firstBar.booking.apartment.color ?? "#14B8A6"),
                  opacity: 0.8,
                  borderRadius: isStart && isEnd ? 4 : isStart ? "2px 0 0 2px" : isEnd ? "0 2px 2px 0" : 0,
                }} />
              )}
              {hasOpen && !hasMine && (
                <div style={{ height: 3, marginLeft: 0, marginRight: 0, backgroundColor: "rgba(16,185,129,0.5)", borderStyle: "dashed" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
