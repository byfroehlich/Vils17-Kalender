"use client";

import { useState, useEffect } from "react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, isSameDay, isToday, startOfDay
} from "date-fns";
import type { CalendarViewMode } from "@/components/settings/CalendarViewSettings";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Apartment {
  id: string;
  name: string;
  color?: string | null;
}

interface Booking {
  id: string;
  guestName: string;
  guestCount: number;
  checkIn: Date;
  checkOut: Date;
  apartmentId: string;
  apartment: Apartment;
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Leitet aus einer Hex-Farbe eine hellere Variante ab (mix mit Weiß). */
function lightenHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r * (1 - factor) + 255 * factor);
  const lg = Math.round(g * (1 - factor) + 255 * factor);
  const lb = Math.round(b * (1 - factor) + 255 * factor);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

/** Gibt an ob heller Text oder dunkler Text auf dieser Farbe besser lesbar ist. */
function textColorFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155 ? "#1e293b" : "#ffffff";
}

/** Gibt das 2-Farben-Paar für eine Wohnung zurück. */
function getAptPair(baseColor: string): [string, string] {
  const light = lightenHex(baseColor, 0.38);
  return [baseColor, light];
}

/** Buchung gilt als belegt solange der Gast noch da ist (inkl. Abreisetag). */
function isOccupied(day: Date, booking: Booking): boolean {
  const d = startOfDay(day);
  return d >= startOfDay(new Date(booking.checkIn)) && d <= startOfDay(new Date(booking.checkOut));
}

export function CalendarGrid({
  apartments,
  bookings,
}: {
  apartments: Apartment[];
  bookings: Booking[];
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("separate");

  useEffect(() => {
    const stored = localStorage.getItem("calendarViewMode") as CalendarViewMode | null;
    if (stored) setViewMode(stored);
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startOffset = (getDay(monthStart) + 6) % 7;

  const glassCard = {
    background: "rgba(255,255,255,0.08)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 20,
    overflow: "hidden",
  } as React.CSSProperties;

  const navBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
      <button
        onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}
      >
        <ChevronLeft style={{ width: 18, height: 18, color: "rgba(255,255,255,0.6)" }} />
      </button>
      <span style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
        {format(currentMonth, "MMMM yyyy", { locale: de })}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          onClick={() => setCurrentMonth(new Date())}
          style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, color: "#14B8A6", background: "rgba(13,148,136,0.15)", border: "1px solid rgba(13,148,136,0.3)", borderRadius: 8, cursor: "pointer" }}
        >
          Heute
        </button>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}
        >
          <ChevronRight style={{ width: 18, height: 18, color: "rgba(255,255,255,0.6)" }} />
        </button>
      </div>
    </div>
  );

  // ─── Kombinierte Ansicht ──────────────────────────────────────────────────
  if (viewMode === "combined") {
    const allBookingsSorted = [...bookings].sort(
      (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
    );

    // Buchungsfarben: pro Apartment 2 alternierend (flach, kein Gradient)
    const aptBookingIndex = new Map<string, number>();
    const bookingColorMap = new Map<string, { bg: string; text: string }>();
    for (const b of allBookingsSorted) {
      const base = b.apartment.color ?? "#3b82f6";
      const [c1, c2] = getAptPair(base);
      const idx = aptBookingIndex.get(b.apartmentId) ?? 0;
      const bg = idx % 2 === 0 ? c1 : c2;
      bookingColorMap.set(b.id, { bg, text: textColorFor(bg) });
      aptBookingIndex.set(b.apartmentId, idx + 1);
    }

    return (
      <div className="space-y-4">
        <div style={glassCard}>
          {navBar}
          <div style={{ padding: "0 12px 8px", display: "flex", flexWrap: "wrap" as const, gap: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {apartments.map((apt) => {
              const [c1] = getAptPair(apt.color ?? "#3b82f6");
              return (
                <span key={apt.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)", paddingTop: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: c1, display: "inline-block" }} />
                  {apt.name}
                </span>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((d) => (
                <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`o-${i}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)", minHeight: 60 }} />
              ))}
              {days.map((day) => {
                const today = isToday(day);
                const dayBookings = allBookingsSorted.filter((b) => isOccupied(day, b));
                // Separate: checking out today vs. still staying/arriving
                const departingOnly = dayBookings.filter((b) => isSameDay(startOfDay(day), startOfDay(new Date(b.checkOut))));
                const arrivingOnly  = dayBookings.filter((b) => !isSameDay(startOfDay(day), startOfDay(new Date(b.checkOut))));
                const dayIndex = (getDay(day) + 6) % 7;

                // Build render list: Dreher pairs first, then lone bars
                type RenderItem = { kind: "single"; b: Booking } | { kind: "split"; dep: Booking; arr: Booking };
                const items: RenderItem[] = [];
                const usedIds = new Set<string>();
                for (const arr of arrivingOnly) {
                  const dep = departingOnly.find((d) => d.apartmentId === arr.apartmentId && !usedIds.has(d.id));
                  if (dep) {
                    items.push({ kind: "split", dep, arr });
                    usedIds.add(dep.id); usedIds.add(arr.id);
                  } else {
                    items.push({ kind: "single", b: arr });
                    usedIds.add(arr.id);
                  }
                }
                // Solo checkout days (no arriving partner)
                for (const dep of departingOnly) {
                  if (!usedIds.has(dep.id)) {
                    items.push({ kind: "single", b: dep });
                    usedIds.add(dep.id);
                  }
                }

                return (
                  <div key={day.toISOString()} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)", minHeight: 60, display: "flex", flexDirection: "column", padding: 4, background: today ? "rgba(13,148,136,0.08)" : "transparent" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", marginBottom: 2, background: today ? "#0D9488" : "transparent", color: today ? "white" : "rgba(255,255,255,0.5)" }}>
                      {format(day, "d")}
                    </span>
                    <div className="flex flex-col gap-px">
                      {items.map((item) => {
                        if (item.kind === "split") {
                          const depC = bookingColorMap.get(item.dep.id) ?? { bg: "#3b82f6", text: "#fff" };
                          const arrC = bookingColorMap.get(item.arr.id) ?? { bg: "#3b82f6", text: "#fff" };
                          const depBarLeft = isSameDay(day, startOfDay(new Date(item.dep.checkIn))) || dayIndex === 0;
                          const arrBarRight = isSameDay(day, startOfDay(new Date(item.arr.checkOut))) || dayIndex === 6;
                          return (
                            <div key={`${item.dep.id}-${item.arr.id}`} className="h-5 flex" style={{ marginLeft: depBarLeft ? 2 : 0, marginRight: arrBarRight ? 2 : 0 }}>
                              <Link href={`/bookings/${item.dep.id}`} style={{ flex: 1, textDecoration: "none" }}>
                                <div className={cn("h-full transition-opacity hover:opacity-75", depBarLeft ? "rounded-l-full" : "")} style={{ background: depC.bg }} />
                              </Link>
                              <Link href={`/bookings/${item.arr.id}`} style={{ flex: 1, textDecoration: "none" }}>
                                <div className={cn("h-full flex items-center overflow-hidden transition-opacity hover:opacity-75 pl-1", arrBarRight ? "rounded-r-full" : "")} style={{ background: arrC.bg, color: arrC.text }}>
                                  <span className="truncate text-[9px] font-bold">{item.arr.guestName.split(" ")[0]}</span>
                                </div>
                              </Link>
                            </div>
                          );
                        }
                        const b = item.b;
                        const color = bookingColorMap.get(b.id) ?? { bg: "#3b82f6", text: "#fff" };
                        const isFirst = isSameDay(day, startOfDay(new Date(b.checkIn))) || dayIndex === 0;
                        const isLast  = isSameDay(day, startOfDay(new Date(b.checkOut))) || dayIndex === 6;
                        return (
                          <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: "block", textDecoration: "none" }}>
                            <div className={cn("h-5 flex items-center overflow-hidden text-xs font-semibold transition-opacity hover:opacity-75", isFirst ? "rounded-l-full pl-1.5 ml-0.5" : "pl-0 ml-0", isLast ? "rounded-r-full mr-0.5" : "mr-0")} style={{ background: color.bg, color: color.text }}>
                              {isFirst && <span className="truncate">{b.guestName.split(" ")[0]}</span>}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Getrennte Ansicht (je Wohnung ein Kalender) ─────────────────────────
  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div style={glassCard}>{navBar}</div>

      <div className={cn("grid gap-4", apartments.length >= 2 ? "lg:grid-cols-2" : "grid-cols-1")}>
        {apartments.map((apt) => {
          const base = apt.color ?? "#3b82f6";
          const [c1, c2] = getAptPair(base);

          const aptBookings = bookings
            .filter((b) => b.apartmentId === apt.id)
            .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());

          function bookingColor(b: Booking): { bg: string; text: string } {
            const idx = aptBookings.indexOf(b);
            const bg = idx % 2 === 0 ? c1 : c2;
            return { bg, text: textColorFor(bg) };
          }

          return (
            <div key={apt.id} style={glassCard}>
              {/* Apartment-Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: c1, display: "inline-block" }} />
                  <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: c2, display: "inline-block" }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{apt.name}</span>
              </div>

              {/* Wochentage */}
              <div className="grid grid-cols-7" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {WEEKDAYS.map((day) => (
                  <div key={day} style={{ padding: "6px 0", textAlign: "center", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)" }}>
                    {day}
                  </div>
                ))}
              </div>

              {/* Tage */}
              <div className="grid grid-cols-7">
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`offset-${i}`} style={{ height: 56, borderBottom: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)" }} />
                ))}
                {days.map((day) => {
                  const dayBookings = aptBookings.filter((b) => isOccupied(day, b));
                  const dep = dayBookings.find((b) => isSameDay(startOfDay(day), startOfDay(new Date(b.checkOut)))) ?? null;
                  const arr = dayBookings.find((b) => !isSameDay(startOfDay(day), startOfDay(new Date(b.checkOut)))) ?? null;
                  const isDreher = dep !== null && arr !== null;
                  const today = isToday(day);
                  const dayIndex = (getDay(day) + 6) % 7;

                  return (
                    <div
                      key={day.toISOString()}
                      style={{ height: 56, borderBottom: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", background: today ? "rgba(13,148,136,0.08)" : "transparent" }}
                    >
                      <div style={{ padding: "4px 6px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: today ? "#0D9488" : "transparent", color: today ? "white" : "rgba(255,255,255,0.45)" }}>
                          {format(day, "d")}
                        </span>
                      </div>

                      {isDreher ? (
                        /* Dreher: 50/50 Split, flache Farben */
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 4, paddingLeft: 4, paddingRight: 4 }}>
                          <div style={{ display: "flex", height: 24 }}>
                            <Link href={`/bookings/${dep.id}`} style={{ flex: 1, textDecoration: "none" }}>
                              <div
                                className={cn("h-full transition-opacity hover:opacity-75", (isSameDay(day, new Date(dep.checkIn)) || dayIndex === 0) ? "rounded-l-full" : "")}
                                style={{ background: bookingColor(dep).bg }}
                              />
                            </Link>
                            <Link href={`/bookings/${arr.id}`} style={{ flex: 1, textDecoration: "none" }}>
                              <div
                                className={cn("h-full flex items-center overflow-hidden transition-opacity hover:opacity-75 pl-1", (isSameDay(day, new Date(arr.checkOut)) || dayIndex === 6) ? "rounded-r-full" : "")}
                                style={{ background: bookingColor(arr).bg, color: bookingColor(arr).text }}
                              >
                                <span style={{ fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1 }}>{arr.guestName.split(" ")[0]}</span>
                              </div>
                            </Link>
                          </div>
                        </div>
                      ) : dayBookings.length > 0 && (() => {
                        /* Einzelne Buchung (Anreise, normaler Tag, oder Abreise ohne Nachfolger) */
                        const b = arr ?? dep!;
                        const color = bookingColor(b);
                        const isFirstDay = isSameDay(day, new Date(b.checkIn));
                        const isLastDay  = isSameDay(day, new Date(b.checkOut));
                        const barLeft  = isFirstDay || dayIndex === 0;
                        const barRight = isLastDay  || dayIndex === 6;
                        return (
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 4 }}>
                            <Link href={`/bookings/${b.id}`} style={{ display: "block", textDecoration: "none", width: "100%" }}>
                              <div style={{ width: "100%", display: "flex", alignItems: "center" }}>
                                <div
                                  className={cn(
                                    "w-full h-6 flex items-center overflow-hidden transition-opacity hover:opacity-75",
                                    barLeft  ? "ml-1 rounded-l-full pl-1.5" : "ml-0 pl-0",
                                    barRight ? "mr-1 rounded-r-full" : "mr-0"
                                  )}
                                  style={{ background: color.bg }}
                                >
                                  {(isFirstDay || dayIndex === 0) && (
                                    <span style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1, color: color.text }}>
                                      {b.guestName.split(" ")[0]}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </Link>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
