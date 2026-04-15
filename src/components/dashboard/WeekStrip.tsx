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

function lightenHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.round(r * (1 - factor) + 255 * factor).toString(16).padStart(2, "0")}${Math.round(g * (1 - factor) + 255 * factor).toString(16).padStart(2, "0")}${Math.round(b * (1 - factor) + 255 * factor).toString(16).padStart(2, "0")}`;
}

function textColorFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#1e293b" : "#ffffff";
}

export function WeekStrip({ bookings }: { bookings: Booking[] }) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });
  const days      = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Build per-apartment map of bookings active this week
  const aptMap = new Map<string, { name: string; color: string; bookings: Booking[] }>();
  for (const b of bookings) {
    if (!days.some((d) => isOccupied(d, b))) continue;
    const key = b.apartment.name;
    if (!aptMap.has(key)) {
      aptMap.set(key, { name: key, color: b.apartment.color ?? "#0D9488", bookings: [] });
    }
    aptMap.get(key)!.bookings.push(b);
  }
  const apts = Array.from(aptMap.values());

  const monthLabel = format(now, "MMMM yyyy", { locale: de }).toUpperCase();

  return (
    <div style={{
      background: "rgba(255,255,255,0.15)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: "1px solid rgba(255,255,255,0.24)",
      borderRadius: 20,
      padding: "14px 16px",
      overflow: "hidden",
    }}>
      {/* Month label */}
      <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.70)", letterSpacing: "0.8px", marginBottom: 10 }}>
        {monthLabel}
      </p>

      {/* Weekday headers + date numbers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {WEEKDAYS.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.62)", paddingBottom: 5 }}>
            {d}
          </div>
        ))}
        {days.map((day) => {
          const today = isToday(day);
          return (
            <div key={day.toISOString()} style={{ display: "flex", justifyContent: "center" }}>
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

      {/* Per-apartment booking rows */}
      {apts.length > 0 ? (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {apts.map((apt) => {
            // Assign alternating flat colors to consecutive bookings
            const sorted = [...apt.bookings].sort(
              (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
            );
            const colorMap = new Map<string, string>();
            sorted.forEach((b, i) => {
              colorMap.set(b.id, i % 2 === 0 ? apt.color : lightenHex(apt.color, 0.38));
            });

            return (
              <div key={apt.name}>
                {/* Apartment label */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, paddingLeft: 1 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: apt.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.62)", letterSpacing: "0.6px", textTransform: "uppercase" as const }}>
                    {apt.name}
                  </span>
                </div>

                {/* 7-column bar row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                  {days.map((day, dayIdx) => {
                    const dayBookings = apt.bookings.filter((b) => isOccupied(day, b));
                    const dep = dayBookings.find((b) => isSameDay(startOfDay(day), startOfDay(new Date(b.checkOut)))) ?? null;
                    const arr = dayBookings.find((b) => !isSameDay(startOfDay(day), startOfDay(new Date(b.checkOut)))) ?? null;
                    const isDreher = dep !== null && arr !== null;

                    if (!isDreher && dayBookings.length === 0) {
                      return <div key={day.toISOString()} style={{ height: 20 }} />;
                    }

                    if (isDreher) {
                      const depColor = colorMap.get(dep.id) ?? apt.color;
                      const arrColor = colorMap.get(arr.id) ?? apt.color;
                      const depBarLeft = isSameDay(day, new Date(dep.checkIn)) || dayIdx === 0;
                      const arrBarRight = isSameDay(day, new Date(arr.checkOut)) || dayIdx === 6;
                      return (
                        <div key={day.toISOString()} style={{ height: 20, display: "flex" }}>
                          <div style={{
                            flex: 1,
                            background: depColor,
                            borderRadius: depBarLeft ? "9999px 0 0 9999px" : 0,
                            marginLeft: depBarLeft ? 1 : 0,
                          }} />
                          <div style={{
                            flex: 1,
                            background: arrColor,
                            borderRadius: arrBarRight ? "0 9999px 9999px 0" : 0,
                            marginRight: arrBarRight ? 1 : 0,
                            display: "flex", alignItems: "center", overflow: "hidden", paddingLeft: 2,
                          }}>
                            <span style={{ fontSize: 8, fontWeight: 700, color: textColorFor(arrColor), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {arr.guestName.split(" ")[0]}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    // Single bar (arr ?? dep)
                    const b = arr ?? dep!;
                    const barColor = colorMap.get(b.id) ?? apt.color;
                    const isFirst = isSameDay(day, new Date(b.checkIn)) || dayIdx === 0;
                    const isLast  = isSameDay(day, new Date(b.checkOut)) || dayIdx === 6;
                    return (
                      <div key={day.toISOString()} style={{
                        height: 20,
                        background: barColor,
                        borderRadius: isFirst && isLast ? 9999
                          : isFirst ? "9999px 0 0 9999px"
                          : isLast  ? "0 9999px 9999px 0"
                          : 0,
                        marginLeft:  isFirst ? 1 : 0,
                        marginRight: isLast  ? 1 : 0,
                        display: "flex", alignItems: "center",
                        overflow: "hidden",
                        paddingLeft: isFirst ? 5 : 0,
                      }}>
                        {isFirst && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: textColorFor(barColor), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {b.guestName.split(" ")[0]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 12 }}>
          Keine Buchungen diese Woche
        </p>
      )}
    </div>
  );
}
