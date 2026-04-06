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

function isOccupied(day: Date, booking: Booking): boolean {
  const d = startOfDay(day);
  return d >= startOfDay(new Date(booking.checkIn)) && d <= startOfDay(new Date(booking.checkOut));
}

function isCheckoutOnly(day: Date, booking: Booking): boolean {
  return isSameDay(day, new Date(booking.checkOut));
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

  const navBar = (
    <div className="flex items-center justify-between px-5 py-3">
      <button
        onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100 transition-colors"
      >
        <ChevronLeft className="w-5 h-5 text-zinc-500" />
      </button>
      <span className="text-base font-semibold text-zinc-800">
        {format(currentMonth, "MMMM yyyy", { locale: de })}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setCurrentMonth(new Date())}
          className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          Heute
        </button>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100 transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-zinc-500" />
        </button>
      </div>
    </div>
  );

  // ─── Kombinierte Ansicht ──────────────────────────────────────────────────
  if (viewMode === "combined") {
    const allBookingsSorted = [...bookings].sort(
      (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
    );

    // Buchungsfarben: pro Apartment 2 alternierend
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
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
          {navBar}
          <div className="px-3 pb-2 flex flex-wrap gap-3">
            {apartments.map((apt) => {
              const [c1] = getAptPair(apt.color ?? "#3b82f6");
              return (
                <span key={apt.id} className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c1 }} />
                  {apt.name}
                </span>
              );
            })}
          </div>
          <div className="border-t border-zinc-100">
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-medium text-zinc-400">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-t border-zinc-100">
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`o-${i}`} className="border-b border-r border-zinc-50" style={{ minHeight: 60 }} />
              ))}
              {days.map((day) => {
                const today = isToday(day);
                const dayBookings = allBookingsSorted
                  .filter((b) => isOccupied(day, b))
                  .sort((a, b) => isCheckoutOnly(day, a) ? 1 : isCheckoutOnly(day, b) ? -1 : 0);
                const dayIndex = (getDay(day) + 6) % 7;
                return (
                  <div key={day.toISOString()} className={cn("border-b border-r border-zinc-100 flex flex-col p-1", today && "bg-blue-50/60")} style={{ minHeight: 60 }}>
                    <span className={cn("text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-0.5", today ? "bg-blue-600 text-white" : "text-zinc-500")}>
                      {format(day, "d")}
                    </span>
                    <div className="flex flex-col gap-px">
                      {dayBookings.map((b) => {
                        const color = bookingColorMap.get(b.id) ?? { bg: "#3b82f6", text: "#fff" };
                        const isFirst = isSameDay(day, startOfDay(new Date(b.checkIn))) || dayIndex === 0;
                        const isLast = isSameDay(day, startOfDay(new Date(b.checkOut))) || dayIndex === 6;
                        return (
                          <div
                            key={b.id}
                            className={cn("h-5 flex items-center overflow-hidden text-xs font-semibold",
                              isFirst ? "rounded-l-full pl-1.5 ml-0.5" : "pl-0 ml-0",
                              isLast ? "rounded-r-full mr-0.5" : "mr-0"
                            )}
                            style={{ backgroundColor: color.bg, color: color.text }}
                          >
                            {isFirst && <span className="truncate">{b.guestName.split(" ")[0]}</span>}
                          </div>
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
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {navBar}
      </div>

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
            <div key={apt.id} className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
              {/* Apartment-Header: schmaler Farbstreifen + Name */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100">
                <div className="flex gap-1">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c1 }} />
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c2 }} />
                </div>
                <span className="text-sm font-semibold text-zinc-800">{apt.name}</span>
              </div>

              {/* Wochentage */}
              <div className="grid grid-cols-7 border-b border-zinc-100">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="py-1.5 text-center text-xs font-medium text-zinc-400">
                    {day}
                  </div>
                ))}
              </div>

              {/* Tage */}
              <div className="grid grid-cols-7">
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`offset-${i}`} className="h-14 border-b border-r border-zinc-50" />
                ))}

                {days.map((day) => {
                  const dayBookings = aptBookings.filter((b) => isOccupied(day, b));
                  const today = isToday(day);
                  const dayIndex = (getDay(day) + 6) % 7;

                  return (
                    <div
                      key={day.toISOString()}
                      className={cn("h-14 border-b border-r border-zinc-100 flex flex-col", today && "bg-blue-50/60")}
                    >
                      <div className="px-1.5 pt-1">
                        <span className={cn(
                          "text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full",
                          today ? "bg-blue-600 text-white" : "text-zinc-500"
                        )}>
                          {format(day, "d")}
                        </span>
                      </div>

                      {dayBookings.length > 0 && (
                        <div className="flex-1 flex flex-col justify-end gap-px pb-1">
                          {dayBookings.map((b) => {
                            const color = bookingColor(b);
                            const isFirstDay = isSameDay(day, new Date(b.checkIn));
                            const isLastDay = isSameDay(day, new Date(b.checkOut));
                            const barLeft = isFirstDay || dayIndex === 0;
                            const barRight = isLastDay || dayIndex === 6;
                            const tall = dayBookings.length === 1;

                            return (
                              <div key={b.id} className="w-full flex items-center">
                                <div
                                  className={cn(
                                    "w-full flex items-center overflow-hidden",
                                    tall ? "h-6" : "h-[9px]",
                                    barLeft ? "ml-1 rounded-l-full pl-1.5" : "ml-0 pl-0",
                                    barRight ? "mr-1 rounded-r-full" : "mr-0"
                                  )}
                                  style={{ backgroundColor: color.bg }}
                                >
                                  {(isFirstDay || dayIndex === 0) && tall && (
                                    <span className="text-xs font-semibold truncate leading-none" style={{ color: color.text }}>
                                      {b.guestName.split(" ")[0]}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
