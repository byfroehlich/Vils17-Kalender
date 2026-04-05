"use client";

import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth, isToday, isWithinInterval } from "date-fns";
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

export function CalendarGrid({
  apartments,
  bookings,
}: {
  apartments: Apartment[];
  bookings: Booking[];
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Wochentag-Offset (Montag = 0)
  const startOffset = (getDay(monthStart) + 6) % 7;

  function getBookingsForDay(date: Date, apartmentId: string): Booking[] {
    return bookings.filter((b) => {
      if (b.apartmentId !== apartmentId) return false;
      const checkIn = new Date(b.checkIn);
      const checkOut = new Date(b.checkOut);
      return isWithinInterval(date, { start: checkIn, end: checkOut });
    });
  }

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 px-6 py-4">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-3 hover:bg-gray-100 rounded-xl transition-colors"
          aria-label="Vorheriger Monat"
        >
          <ChevronLeft className="w-7 h-7 text-gray-600" />
        </button>

        <h2 className="text-2xl font-bold text-gray-900">
          {format(currentMonth, "MMMM yyyy", { locale: de })}
        </h2>

        <div className="flex gap-2">
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-4 py-2 text-base font-medium text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
          >
            Heute
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-3 hover:bg-gray-100 rounded-xl transition-colors"
            aria-label="Nächster Monat"
          >
            <ChevronRight className="w-7 h-7 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Legende */}
      <div className="flex flex-wrap gap-4">
        {apartments.map((apt) => (
          <span key={apt.id} className="flex items-center gap-2 text-base font-medium text-gray-600">
            <span
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: apt.color ?? "#3b82f6" }}
            />
            {apt.name}
          </span>
        ))}
      </div>

      {/* Kalender-Raster pro Wohnung */}
      <div className={`grid gap-6 ${apartments.length >= 2 ? "lg:grid-cols-2" : "grid-cols-1"}`}>
        {apartments.map((apt) => (
          <div key={apt.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Wohnung Header */}
            <div
              className="px-5 py-3 text-white font-bold text-lg"
              style={{ backgroundColor: apt.color ?? "#3b82f6" }}
            >
              {apt.name}
            </div>

            {/* Wochentage */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {WEEKDAYS.map((day) => (
                <div key={day} className="py-2 text-center text-sm font-semibold text-gray-400">
                  {day}
                </div>
              ))}
            </div>

            {/* Tage */}
            <div className="grid grid-cols-7">
              {/* Offset */}
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`offset-${i}`} className="h-14 border-b border-r border-gray-50" />
              ))}

              {days.map((day) => {
                const dayBookings = getBookingsForDay(day, apt.id);
                const occupied = dayBookings.length > 0;
                const today = isToday(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "h-14 border-b border-r border-gray-100 p-1.5 flex flex-col",
                      !isSameMonth(day, currentMonth) && "opacity-30",
                      today && "bg-blue-50"
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full",
                        today && "bg-blue-600 text-white",
                        !today && "text-gray-700"
                      )}
                    >
                      {format(day, "d")}
                    </span>

                    {occupied && (
                      <div
                        className="flex-1 rounded mt-0.5 flex items-center px-1"
                        style={{ backgroundColor: `${apt.color ?? "#3b82f6"}30` }}
                      >
                        <span
                          className="text-xs font-semibold truncate"
                          style={{ color: apt.color ?? "#3b82f6" }}
                        >
                          {dayBookings[0].guestName.split(" ")[0]}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
