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
  return d >= checkIn && d < checkOut; // checkOut-Tag ist frei (nächster Gast)
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
    // Pro Tag: Buchungen aller Apartments anzeigen (farblich nach Apartment)
    const allBookingsSorted = [...bookings].sort(
      (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
    );

    // Farbe je Apartment (apartment.color oder Fallback aus Palette)
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
              const dayBookings = allBookingsSorted.filter((b) => isOccupied(day, b));
              return (
                <div key={day.toISOString()} className={cn("border-b border-r border-zinc-100 flex flex-col p-1", today && "bg-blue-50")} style={{ minHeight: 64 }}>
                  <span className={cn("text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-0.5", today ? "bg-blue-600 text-white" : "text-zinc-600")}>
                    {format(day, "d")}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {dayBookings.map((b) => {
                      const color = aptColorMap.get(b.apartmentId) ?? "#3b82f6";
                      const checkIn = startOfDay(new Date(b.checkIn));
                      const checkOut = startOfDay(new Date(b.checkOut));
                      const dayIndex = (getDay(day) + 6) % 7;
                      const isFirst = isSameDay(day, checkIn) || dayIndex === 0;
                      const isLast = isSameDay(addDays(day, 1), checkOut) || dayIndex === 6;
                      return (
                        <div
                          key={b.id}
                          className={cn("h-5 flex items-center text-white text-xs font-semibold overflow-hidden", isFirst ? "ml-0.5 rounded-l-full pl-1.5" : "ml-0", isLast ? "mr-0.5 rounded-r-full" : "mr-0")}
                          style={{ backgroundColor: color }}
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
                  const booking = aptBookings.find((b) => isOccupied(day, b));
                  const today = isToday(day);
                  const dayIndex = (getDay(day) + 6) % 7; // 0=Mo, 6=So
                  const isMonday = dayIndex === 0;
                  const isSunday = dayIndex === 6;

                  let barLeft = false;
                  let barRight = false;
                  let showName = false;
                  let color = { bg: "", text: "" };

                  if (booking) {
                    const checkIn = startOfDay(new Date(booking.checkIn));
                    const checkOut = startOfDay(new Date(booking.checkOut));
                    const isFirstDay = isSameDay(day, checkIn);
                    const isLastOccupied = isSameDay(addDays(day, 1), checkOut);

                    barLeft = isFirstDay || isMonday;
                    barRight = isLastOccupied || isSunday;
                    showName = isFirstDay || isMonday;
                    color = bookingColor(booking);
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
                        <span
                          className={cn(
                            "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full",
                            today ? "bg-blue-600 text-white" : "text-zinc-600"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                      </div>

                      {/* Buchungsbalken */}
                      {booking && (
                        <div className="flex-1 flex items-center px-0 pb-1.5">
                          <div
                            className={cn(
                              "h-6 w-full flex items-center overflow-hidden",
                              barLeft ? "ml-1 rounded-l-full pl-2" : "ml-0 pl-1",
                              barRight ? "mr-1 rounded-r-full pr-2" : "mr-0 pr-0"
                            )}
                            style={{ backgroundColor: color.bg }}
                          >
                            {showName && (
                              <span
                                className="text-xs font-semibold truncate leading-none"
                                style={{ color: color.text }}
                              >
                                {booking.guestName.split(" ")[0]}
                              </span>
                            )}
                          </div>
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
