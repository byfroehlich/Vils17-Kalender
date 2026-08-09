"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateLong } from "@/lib/utils";
import { AlertTriangle, ChevronLeft, ChevronRight, Zap, RefreshCw } from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday,
  addMonths, subMonths, format, getYear, startOfYear, endOfYear,
  eachMonthOfInterval, startOfDay, addDays, differenceInDays,
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

function textColorFor(hex: string): string {
  if (!hex.startsWith("#") || hex.length < 7) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#1e293b" : "#ffffff";
}

function lightenHex(hex: string, factor: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r * (1 - factor) + 255 * factor);
  const lg = Math.round(g * (1 - factor) + 255 * factor);
  const lb = Math.round(b * (1 - factor) + 255 * factor);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

function getAptPair(baseColor: string): [string, string] {
  return [baseColor, lightenHex(baseColor, 0.38)];
}

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  function showError(msg: string) {
    setActionError(msg);
    setTimeout(() => setActionError(null), 3000);
  }

  function assignmentsForDay(d: Date): Assignment[] {
    const day = startOfDay(d);
    return myAssignments.filter((a) => {
      const ci = startOfDay(new Date(a.booking.checkIn));
      const co = startOfDay(new Date(a.booking.checkOut));
      return day >= ci && day <= co;
    });
  }

  function openForDay(d: Date): OpenAssignment[] {
    const day = startOfDay(d);
    return openAssignments.filter((a) => {
      const ci = startOfDay(new Date(a.booking.checkIn));
      const co = startOfDay(new Date(a.booking.checkOut));
      return day >= ci && day <= co;
    });
  }

  async function claimJob(bookingId: string) {
    setLoadingId(bookingId);
    const res = await fetch(`/api/bookings/${bookingId}/claim`, { method: "POST" });
    setLoadingId(null);
    if (!res.ok) { const d = await res.json().catch(() => ({})); showError(d.error ?? "Fehler beim Zusagen"); return; }
    router.refresh();
  }

  async function markDone(bookingId: string, assignmentId: string) {
    setLoadingId(assignmentId);
    const res = await fetch(`/api/bookings/${bookingId}/cleaning-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    setLoadingId(null);
    if (!res.ok) { showError("Fehler beim Markieren"); return; }
    router.refresh();
  }

  async function submitUnavailable(a: Assignment) {
    setLoadingId(a.id);
    const res = await fetch(`/api/bookings/${a.booking.id}/cleaner-unavailable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unavailable: true, note: unavailableNote }),
    });
    setLoadingId(null);
    if (!res.ok) { showError("Fehler beim Absagen"); return; }
    setUnavailableId(null);
    setUnavailableNote("");
    router.refresh();
  }

  async function cancelUnavailable(a: Assignment) {
    setLoadingId(a.id);
    const res = await fetch(`/api/bookings/${a.booking.id}/cleaner-unavailable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unavailable: false }),
    });
    setLoadingId(null);
    if (!res.ok) { showError("Fehler beim Zurückziehen"); return; }
    router.refresh();
  }

  async function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  const selectedAssignments = selectedDay ? assignmentsForDay(selectedDay) : [];
  const selectedOpen = selectedDay ? openForDay(selectedDay) : [];

  return (
    <div className="space-y-4">
      {actionError && (
        <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: "10px 16px", color: "#fca5a5", fontSize: 14 }}>
          {actionError}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, padding: 4, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14 }}>
          {(["month", "year"] as const).map((v) => (
            <button key={v} onClick={() => { setView(v); setSelectedDay(null); }}
              style={{ padding: "8px 18px", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", background: view === v ? "rgba(255,255,255,0.20)" : "transparent", border: "none", color: view === v ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)", transition: "all 0.15s" }}>
              {v === "month" ? "Monat" : "Jahresübersicht"}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 12, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.70)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          <RefreshCw style={{ width: 14, height: 14, animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
          Aktualisieren
        </button>
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
                    {a.booking.guestCount} {a.booking.guestCount === 1 ? "Person" : "Personen"}
                    {a.booking.arrivalTime && ` · ab ${a.booking.arrivalTime}`}
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
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 18 }}>{formatDateLong(new Date(a.booking.checkIn))} · {a.booking.apartment.name}</p>
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

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Monatsansicht mit admin-style Buchungsbalken ─────────────────────────────

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

  // Alternating booking colors per apartment — same logic as admin CalendarGrid
  const aptColorIndex = new Map<string, number>();
  const bookingColorMap = new Map<string, string>();
  const allSorted = [...myAssignments, ...openAssignments].sort(
    (a, b) => new Date(a.booking.checkIn).getTime() - new Date(b.booking.checkIn).getTime()
  );
  for (const a of allSorted) {
    const base = a.booking.apartment.color ?? "#14B8A6";
    const [c1, c2] = getAptPair(base);
    const aptKey = a.booking.apartment.name;
    const idx = aptColorIndex.get(aptKey) ?? 0;
    bookingColorMap.set(a.id, idx % 2 === 0 ? c1 : c2);
    aptColorIndex.set(aptKey, idx + 1);
  }

  type BarInfo = {
    id: string;
    color: string;
    guestCount: number;
    isOpen: boolean;
    isAbsage: boolean;
    bookingId: string;
    isStart: boolean;
    isEnd: boolean;
    isSingleDay: boolean;
    isArrivalDay: boolean;
  };

  function getBarsForDay(day: Date): BarInfo[] {
    const d = startOfDay(day);
    const result: BarInfo[] = [];

    for (const a of myAssignments) {
      const ci = startOfDay(new Date(a.booking.checkIn));
      const co = startOfDay(new Date(a.booking.checkOut));
      const absage = a.cleanerUnavailable || (a.takenByOther ?? false);
      if (d >= ci && d <= co) {
        result.push({
          id: a.id,
          color: absage ? "#ef4444" : (bookingColorMap.get(a.id) ?? a.booking.apartment.color ?? "#14B8A6"),
          guestCount: a.booking.guestCount,
          isOpen: false,
          isAbsage: absage,
          bookingId: a.booking.id,
          isStart: isSameDay(d, ci),
          isEnd: isSameDay(d, co),
          isSingleDay: isSameDay(ci, co),
          isArrivalDay: isSameDay(d, ci),
        });
      }
    }

    for (const a of openAssignments) {
      const ci = startOfDay(new Date(a.booking.checkIn));
      const co = startOfDay(new Date(a.booking.checkOut));
      if (d >= ci && d <= co) {
        result.push({
          id: a.id,
          color: bookingColorMap.get(a.id) ?? a.booking.apartment.color ?? "#14B8A6",
          guestCount: a.booking.guestCount,
          isOpen: true,
          isAbsage: false,
          bookingId: a.booking.id,
          isStart: isSameDay(d, ci),
          isEnd: isSameDay(d, co),
          isSingleDay: isSameDay(ci, co),
          isArrivalDay: isSameDay(d, ci),
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

      {/* Kalender-Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, padding: "0 4px" }}>
        {days.map((day) => {
          const bars = getBarsForDay(day);
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const selected = selectedDay ? isSameDay(day, selectedDay) : false;
          const hasAny = bars.length > 0 && inMonth;
          const hasAbsage = bars.some((b) => b.isAbsage) && inMonth;
          const dayIndex = (day.getDay() + 6) % 7; // 0=Mon … 6=Sun

          return (
            <div
              key={day.toISOString()}
              onClick={() => { if (!hasAny) return; onSelectDay(selected ? null : day); }}
              style={{
                minHeight: 64,
                position: "relative",
                background: selected && inMonth ? "rgba(13,148,136,0.30)" : today && inMonth ? "rgba(13,148,136,0.15)" : "transparent",
                border: selected && inMonth ? "1px solid rgba(13,148,136,0.5)" : "1px solid rgba(255,255,255,0.04)",
                cursor: hasAny ? "pointer" : "default",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
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

              {/* Buchungsbalken — admin-style mit Wechsel-Split */}
              {inMonth && (() => {
                // Wechseltag: ein auslaufender Balken + ein startender Balken → halb-halb
                const endBars   = bars.filter((b) => b.isEnd && !b.isStart && !b.isSingleDay);
                const startBars = bars.filter((b) => b.isStart && !b.isEnd && !b.isSingleDay);
                const isChangeover = endBars.length > 0 && startBars.length > 0;
                const otherBars = isChangeover
                  ? bars.filter((b) => b.isSingleDay || (b.isStart && b.isEnd))
                  : bars;

                return (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 4, gap: 2 }}>
                    {isChangeover && (() => {
                      const dep = endBars[0];
                      const arr = startBars[0];
                      const depBrLeft  = dayIndex === 0 ? "9999px 0 0 9999px" : "0";
                      const arrBrRight = dayIndex === 6 ? "0 9999px 9999px 0" : "0";
                      const arrBgColor = arr.isOpen ? "transparent" : arr.color;
                      const arrTxt = textColorFor(arr.color);
                      return (
                        <div style={{ display: "flex", height: 20, marginLeft: 2, marginRight: 2 }}>
                          {/* Linke Hälfte: abreisende Buchung */}
                          <div style={{ flex: 1, backgroundColor: dep.color, borderRadius: depBrLeft, display: "flex", alignItems: "center", overflow: "hidden", paddingLeft: dayIndex === 0 ? 3 : 0 }}>
                            {dep.isAbsage && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.9)" }}>⚠</span>}
                          </div>
                          {/* Rechte Hälfte: anreisende Buchung */}
                          <div style={{ flex: 1, backgroundColor: arrBgColor, borderTop: arr.isOpen ? `2px dashed ${arr.color}` : "none", borderBottom: arr.isOpen ? `2px dashed ${arr.color}` : "none", borderLeft: "none", borderRight: arr.isOpen && dayIndex === 6 ? `2px dashed ${arr.color}` : "none", opacity: arr.isOpen ? 0.75 : 1, borderRadius: arrBrRight, display: "flex", alignItems: "center", overflow: "hidden", paddingLeft: 3 }}>
                            {!arr.isOpen && <span style={{ fontSize: 9, fontWeight: 800, color: arrTxt, whiteSpace: "nowrap" as const, lineHeight: 1 }}>{arr.guestCount}G</span>}
                          </div>
                        </div>
                      );
                    })()}
                    {otherBars.slice(0, isChangeover ? 1 : 2).map((bar) => {
                      const barLeft  = bar.isStart || dayIndex === 0;
                      const barRight = bar.isEnd   || dayIndex === 6;
                      const bgColor = bar.isOpen ? "transparent" : bar.color;
                      const txtColor = textColorFor(bar.color);
                      return (
                        <div
                          key={bar.id}
                          style={{
                            height: 20,
                            marginLeft: barLeft ? 2 : 0,
                            marginRight: barRight ? 2 : 0,
                            backgroundColor: bgColor,
                            borderTop: bar.isOpen ? `2px dashed ${bar.color}` : "none",
                            borderBottom: bar.isOpen ? `2px dashed ${bar.color}` : "none",
                            borderLeft: bar.isOpen && barLeft ? `2px dashed ${bar.color}` : "none",
                            borderRight: bar.isOpen && barRight ? `2px dashed ${bar.color}` : "none",
                            opacity: bar.isOpen ? 0.75 : 1,
                            borderRadius: bar.isSingleDay
                              ? "9999px"
                              : barLeft && barRight
                                ? "9999px"
                                : barLeft
                                  ? "9999px 0 0 9999px"
                                  : barRight
                                    ? "0 9999px 9999px 0"
                                    : 0,
                            display: "flex",
                            alignItems: "center",
                            overflow: "hidden",
                            paddingLeft: barLeft ? 5 : 0,
                          }}
                        >
                          {bar.isArrivalDay && !bar.isOpen && (
                            <span style={{ fontSize: 9, fontWeight: 800, color: txtColor, whiteSpace: "nowrap" as const, lineHeight: 1 }}>
                              {bar.guestCount}G
                            </span>
                          )}
                          {bar.isAbsage && barLeft && !bar.isArrivalDay && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>⚠</span>
                          )}
                        </div>
                      );
                    })}
                    {bars.length > 2 && !isChangeover && (
                      <div style={{ height: 6, marginLeft: 2, marginRight: 2, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: "9999px" }} />
                    )}
                  </div>
                );
              })()}

              {hasAbsage && !bars.some((b) => b.isAbsage && b.isStart) && (
                <div style={{ position: "absolute", top: 3, right: 3, fontSize: 8 }}>⚠️</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legende */}
      <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" as const, padding: "0 16px" }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 20, height: 8, borderRadius: "9999px", background: "#14B8A6", display: "inline-block" }} />
          Mein Auftrag
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 20, height: 8, borderRadius: "9999px", border: "2px dashed #14B8A6", display: "inline-block" }} />
          Offen
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 20, height: 8, borderRadius: "9999px", background: "#ef4444", display: "inline-block" }} />
          Abgesagt
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 9, background: "#14B8A6", color: "white", borderRadius: 3, padding: "0 3px" }}>4G</span>
          Gäste
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
          <MiniMonth key={month.toISOString()} month={month} myAssignments={myAssignments} openAssignments={openAssignments} selectedDay={selectedDay} onSelectDay={onSelectDay} onSwitchToMonth={onSwitchToMonth} />
        ))}
      </div>
    </div>
  );
}

function MiniMonth({ month, myAssignments, openAssignments, selectedDay, onSelectDay, onSwitchToMonth }: {
  month: Date; myAssignments: Assignment[]; openAssignments: OpenAssignment[];
  selectedDay: Date | null; onSelectDay: (d: Date) => void; onSwitchToMonth: (d: Date) => void;
}) {
  const monthStart = startOfMonth(month);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const DAYS       = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  const monthHasAny = [...myAssignments, ...openAssignments].some((a) => {
    const ci = new Date(a.booking.checkIn);
    const co = new Date(a.booking.checkOut);
    return isSameMonth(ci, month) || isSameMonth(co, month) || (ci < monthStart && co > endOfMonth(month));
  });

  function getFirstBar(d: Date) {
    const day = startOfDay(d);
    return myAssignments.find((a) => {
      const ci = startOfDay(new Date(a.booking.checkIn));
      const co = startOfDay(new Date(a.booking.checkOut));
      return day >= ci && day <= co;
    }) ?? null;
  }

  function hasOpen(d: Date) {
    const day = startOfDay(d);
    return openAssignments.some((a) => {
      const ci = startOfDay(new Date(a.booking.checkIn));
      const co = startOfDay(new Date(a.booking.checkOut));
      return day >= ci && day <= co;
    });
  }

  return (
    <div style={{ ...glass({ borderRadius: 16, padding: 10, opacity: monthHasAny ? 1 : 0.45 }) }}>
      <button onClick={() => onSwitchToMonth(month)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 6, width: "100%", textAlign: "left" as const }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{format(month, "MMMM", { locale: de })}</span>
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
        {DAYS.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 7, color: "rgba(255,255,255,0.30)", paddingBottom: 2 }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0 }}>
        {days.map((day) => {
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const selected = selectedDay ? isSameDay(day, selectedDay) : false;
          const firstBar = inMonth ? getFirstBar(day) : null;
          const open = inMonth && !firstBar && hasOpen(day);
          const dayIndex = (day.getDay() + 6) % 7;
          const isStart = firstBar ? isSameDay(startOfDay(day), startOfDay(new Date(firstBar.booking.checkIn))) : false;
          const isEnd   = firstBar ? isSameDay(startOfDay(day), startOfDay(new Date(firstBar.booking.checkOut))) : false;
          const barLeft  = isStart || dayIndex === 0;
          const barRight = isEnd   || dayIndex === 6;

          return (
            <div key={day.toISOString()}
              onClick={() => { if (!inMonth || (!firstBar && !open)) return; onSelectDay(day); }}
              style={{ position: "relative", minHeight: 22, background: selected && inMonth ? "rgba(13,148,136,0.45)" : today && inMonth ? "rgba(13,148,136,0.25)" : "transparent", cursor: (firstBar || open) && inMonth ? "pointer" : "default", display: "flex", flexDirection: "column" }}
            >
              <span style={{ display: "block", textAlign: "center", fontSize: 9, fontWeight: firstBar ? 700 : 400, lineHeight: "14px", color: !inMonth ? "rgba(255,255,255,0.08)" : today || selected ? "rgba(255,255,255,0.95)" : firstBar ? "rgba(255,255,255,0.90)" : open ? "rgba(110,231,183,0.80)" : "rgba(255,255,255,0.30)" }}>
                {inMonth ? format(day, "d") : ""}
              </span>
              {firstBar && (
                <div style={{
                  height: 3,
                  marginLeft: barLeft ? 1 : 0,
                  marginRight: barRight ? 1 : 0,
                  backgroundColor: (firstBar.cleanerUnavailable || firstBar.takenByOther) ? "#ef4444" : (firstBar.booking.apartment.color ?? "#14B8A6"),
                  opacity: 0.85,
                  borderRadius: barLeft && barRight ? "9999px" : barLeft ? "9999px 0 0 9999px" : barRight ? "0 9999px 9999px 0" : 0,
                }} />
              )}
              {open && (
                <div style={{ height: 3, marginLeft: 0, marginRight: 0, backgroundColor: "rgba(16,185,129,0.5)", borderRadius: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
