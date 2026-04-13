"use client";

import { startOfWeek, endOfWeek, eachDayOfInterval, isToday, isSameDay, startOfDay, format } from "date-fns";
import { de } from "date-fns/locale";

interface Booking {
  id: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  apartment: { name: string; color?: string | null };
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function isOccupied(day: Date, b: Booking): boolean {
  const d = startOfDay(day);
  return d >= startOfDay(new Date(b.checkIn)) && d <= startOfDay(new Date(b.checkOut));
}

/** Shorten apartment name to max 4 chars abbreviation */
function aptShort(name: string): string {
  // Try to get initials or first 3 chars
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return words.map(w => w[0]).join("").toUpperCase().slice(0, 3);
  }
  return name.slice(0, 4);
}

export function WeekStrip({ bookings }: { bookings: Booking[] }) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });
  const days      = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Which bookings are active this week?
  const weekBookings = bookings.filter((b) =>
    days.some((d) => isOccupied(d, b))
  );

  // Unique apartments that have bookings this week, in order of first appearance
  const seen = new Set<string>();
  const aptOrder: string[] = [];
  for (const d of days) {
    for (const b of weekBookings) {
      if (isOccupied(d, b) && !seen.has(b.apartment.name)) {
        seen.add(b.apartment.name);
        aptOrder.push(b.apartment.name);
      }
    }
  }

  // Group bookings by apartment (preserving unique booking segments)
  const bookingsByApt = new Map<string, Booking[]>();
  for (const aptName of aptOrder) {
    bookingsByApt.set(aptName, weekBookings.filter(b => b.apartment.name === aptName));
  }

  const monthLabel = format(now, "MMMM yyyy", { locale: de }).toUpperCase();

  return (
    <div style={{
      background: "rgba(255,255,255,0.08)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 20,
      padding: "14px 16px",
      overflow: "hidden",
    }}>
      {/* Month label */}
      <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.8px", marginBottom: 10 }}>
        {monthLabel}
      </p>

      {/* 7-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {/* Weekday headers */}
        {WEEKDAYS.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", paddingBottom: 6 }}>
            {d}
          </div>
        ))}

        {/* Date cells */}
        {days.map((day) => {
          const today = isToday(day);
          return (
            <div key={day.toISOString()} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {/* Date number */}
              <div style={{
                width: 26, height: 26,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "50%",
                background: today ? "#0D9488" : "transparent",
                fontSize: 12, fontWeight: today ? 700 : 500,
                color: today ? "white" : "rgba(255,255,255,0.65)",
              }}>
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Booking bars per apartment */}
      {aptOrder.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {aptOrder.map((aptName) => {
            const aptBookings = bookingsByApt.get(aptName) ?? [];
            const aptColor = aptBookings[0]?.apartment.color ?? "#14B8A6";
            return (
              <div key={aptName} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {days.map((day, dayIdx) => {
                  const activeBooking = aptBookings.find(b => isOccupied(day, b));
                  if (!activeBooking) {
                    return <div key={day.toISOString()} style={{ height: 18 }} />;
                  }
                  const isFirst = isSameDay(day, new Date(activeBooking.checkIn)) || dayIdx === 0;
                  const isLast  = isSameDay(day, new Date(activeBooking.checkOut)) || dayIdx === 6;
                  const label   = `${activeBooking.guestName.split(" ")[0]} · ${aptShort(aptName)}`;
                  return (
                    <div
                      key={day.toISOString()}
                      style={{
                        height: 18,
                        backgroundColor: aptColor,
                        borderRadius: isFirst && isLast
                          ? 9999
                          : isFirst ? "9999px 0 0 9999px"
                          : isLast  ? "0 9999px 9999px 0"
                          : 0,
                        marginLeft:  isFirst ? 2 : 0,
                        marginRight: isLast  ? 2 : 0,
                        display: "flex",
                        alignItems: "center",
                        overflow: "hidden",
                        paddingLeft: isFirst ? 6 : 0,
                      }}
                    >
                      {isFirst && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {aptOrder.length === 0 && (
        <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 12 }}>
          Keine Buchungen diese Woche
        </p>
      )}
    </div>
  );
}
