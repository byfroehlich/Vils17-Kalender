"use client";

import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isToday, addDays, startOfDay } from "date-fns";
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

// Farb-Palette für Buchungen (wechselt zwischen aufeinanderfolgenden Buchungen)
const BOOKING_PALETTE = [
  { bg: "#3b82f6", text: "#ffffff" }, // blau
  { bg: "#8b5cf6", text: "#ffffff" }, // violett
  { bg: "#10b981", text: "#ffffff" }, // grün
  { bg: "#f59e0b", text: "#ffffff" }, // amber
  { bg: "#ef4444", text: "#ffffff" }, // rot
  { bg: "#06b6d4", text: "#ffffff" }, // cyan
];

function isOccupied(day: Date, booking: Booking): boolean {
  const checkIn = startOfDay(new Date(booking.checkIn));
  const checkOut = startOfDay(new Date(booking.checkOut));
  const d = startOfDay(day);
  // Abreisetag einschließen: Gast reist ab, neuer kann ankommen → beide sichtbar
  return d >= checkIn && d <= checkOut;
}

// Prüft ob der Tag ausschließlich ein Abreisetag ist (kein Übernachtungstag)
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
  const startOffset = (getDay(monthStart) + 6) % 7; // Montag = 0

  // Kombinierter Kalender: alle Apartments in einem Grid
  if (viewMode === "combined") {
    const allBookingsSorted = [...bookings].sort(
      (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
    );

    // Jede Buchung bekommt eine eigene Farbe aus der Palette (wie getrennte Ansicht)
    const bookingColorMap = new Map(
      allBookingsSorted.map((b, i) => [b.id, BOOKING_PALETTE[i % BOOKING_PALETTE.length]])
    );

    // Apartment-Farbe nur für die Legende
    const aptColorMap = new Map(apartments.map((a, i) => [a.id, a.color ?? BOOKING_PALETTE[i % BOOKING_PALETTE.length].bg]));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white rounded-2xl border border-zinc-200 px-6 py-4">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-3 hover:bg-zinc-100 rounded-xl transition-colors">
            <ChevronLeft className="w-6 h-6 text-zinc-600" />
          </button>
          <h2 className="text-2xl font-bold text-zinc-900">{format(currentMonth, "MMMM yyyy", { locale: de })}</h2>
          <div className="flex gap-2">
            <button onClick={() => setCurrentMonth(new Date())} className="px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">Heute</button>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-3 hover:bg-zinc-100 rounded-xl transition-colors">
              <ChevronRight className="w-6 h-6 text-zinc-600" />
            </button>
          </div>
        </div>

        {/* Legende */}
        <div className="flex flex-wrap gap-4">
          {apartments.map((apt) => (
            <span key={apt.id} className="flex items-center gap-2 text-sm font-medium text-zinc-600">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: aptColorMap.get(apt.id) }} />
              {apt.name}
            </span>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-zinc-100">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-zinc-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`o-${i}`} className="border-b border-r border-zinc-50" style={{ minHeight: 64 }} />
            ))}
            {days.map((day) => {
              const today = isToday(day);
              const dayBookings = allBookingsSorted
                .filter((b) => isOccupied(day, b))
                .sort((a, b) => isCheckoutOnly(day, a) ? 1 : isCheckoutOnly(day, b) ? -1 : 0);
              return (
                <div key={day.toISOString()} className={cn("border-b border-r border-zinc-100 flex flex-col p-1", today && "bg-blue-50")} style={{ minHeight: 64 }}>
                  <span className={cn("text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-0.5", today ? "bg-blue-600 text-white" : "text-zinc-600")}>
                    {format(day, "d")}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {dayBookings.map((b) => {
                      const color = bookingColorMap.get(b.id) ?? BOOKING_PALETTE[0];
                      const checkIn = startOfDay(new Date(b.checkIn));
                      const checkOut = startOfDay(new Date(b.checkOut));
                      const dayIndex = (getDay(day) + 6) % 7;
                      const isFirst = isSameDay(day, checkIn) || dayIndex === 0;
                      const isLast = isSameDay(day, checkOut) || dayIndex === 6;
                      return (
                        <div
                          key={b.id}
                          className={cn("h-5 flex items-center text-xs font-semibold overflow-hidden",
                            isFirst ? "ml-0.5 rounded-l-full pl-1.5" : "ml-0",
                            isLast ? "mr-0.5 rounded-r-full" : "mr-0"
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
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-zinc-200 px-6 py-4">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-3 hover:bg-zinc-100 rounded-xl transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-zinc-600" />
        </button>
        <h2 className="text-2xl font-bold text-zinc-900">
          {format(currentMonth, "MMMM yyyy", { locale: de })}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
          >
            Heute
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-3 hover:bg-zinc-100 rounded-xl transition-colors"
          >
            <ChevronRight className="w-6 h-6 text-zinc-600" />
          </button>
        </div>
      </div>

      {/* Kalender pro Wohnung */}
      <div className={`grid gap-6 ${apartments.length >= 2 ? "lg:grid-cols-2" : "grid-cols-1"}`}>
        {apartments.map((apt) => {
          // Buchungen dieser Wohnung nach Check-in sortieren + Farbe zuweisen
          const aptBookings = bookings
            .filter((b) => b.apartmentId === apt.id)
            .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());

          const bookingColor = (b: Booking) => {
            const idx = aptBookings.indexOf(b);
            return BOOKING_PALETTE[idx % BOOKING_PALETTE.length];
          };

          return (
            <div key={apt.id} className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
              {/* Header */}
              <div
                className="px-5 py-3 text-white font-bold text-lg"
                style={{ backgroundColor: apt.color ?? "#3b82f6" }}
              >
                {apt.name}
              </div>

              {/* Wochentage */}
              <div className="grid grid-cols-7 border-b border-zinc-100">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="py-2 text-center text-xs font-semibold text-zinc-400">
                    {day}
                  </div>
                ))}
              </div>

              {/* Tage */}
              <div className="grid grid-cols-7">
                {/* Offset leere Zellen */}
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`offset-${i}`} className="h-16 border-b border-r border-zinc-50" />
                ))}

                {days.map((day) => {
                  // Alle Buchungen die diesen Tag berühren (An- oder Abreise)
                  const dayBookings = aptBookings.filter((b) => isOccupied(day, b));
                  const today = isToday(day);
                  const dayIndex = (getDay(day) + 6) % 7;
                  const isMonday = dayIndex === 0;
                  const isSunday = dayIndex === 6;

                  function barProps(b: Booking) {
                    const checkIn = startOfDay(new Date(b.checkIn));
                    const checkOut = startOfDay(new Date(b.checkOut));
                    const isFirstDay = isSameDay(day, checkIn);
                    const isLastDay = isSameDay(day, checkOut);
                    return {
                      barLeft: isFirstDay || isMonday,
                      barRight: isLastDay || isSunday,
                      showName: isFirstDay || isMonday,
                      color: bookingColor(b),
                    };
                  }

                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "h-16 border-b border-r border-zinc-100 flex flex-col",
                        today && "bg-blue-50"
                      )}
                    >
                      {/* Tageszahl */}
                      <div className="px-1.5 pt-1">
                        <span className={cn(
                          "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full",
                          today ? "bg-blue-600 text-white" : "text-zinc-600"
                        )}>
                          {format(day, "d")}
                        </span>
                      </div>

                      {/* Buchungsbalken – bei Gleichtags-Wechsel zwei schmale Balken */}
                      {dayBookings.length > 0 && (
                        <div className={cn("flex-1 flex flex-col justify-center gap-0.5 pb-1", dayBookings.length > 1 ? "pb-0.5" : "pb-1.5")}>
                          {dayBookings.map((b) => {
                            const { barLeft, barRight, showName, color } = barProps(b);
                            const height = dayBookings.length > 1 ? "h-[10px]" : "h-6";
                            return (
                              <div key={b.id} className="w-full flex items-center">
                                <div
                                  className={cn(
                                    `${height} w-full flex items-center overflow-hidden`,
                                    barLeft ? "ml-1 rounded-l-full pl-1.5" : "ml-0 pl-0",
                                    barRight ? "mr-1 rounded-r-full" : "mr-0"
                                  )}
                                  style={{ backgroundColor: color.bg }}
                                >
                                  {showName && dayBookings.length === 1 && (
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
