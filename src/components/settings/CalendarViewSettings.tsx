"use client";

import { useState, useEffect } from "react";
import { LayoutGrid, Columns } from "lucide-react";

export type CalendarViewMode = "separate" | "combined";

const STORAGE_KEY = "calendarViewMode";

export function getCalendarViewMode(): CalendarViewMode {
  if (typeof window === "undefined") return "separate";
  return (localStorage.getItem(STORAGE_KEY) as CalendarViewMode) ?? "separate";
}

export function CalendarViewSettings() {
  const [mode, setMode] = useState<CalendarViewMode>("separate");

  useEffect(() => {
    setMode(getCalendarViewMode());
  }, []);

  function select(v: CalendarViewMode) {
    setMode(v);
    localStorage.setItem(STORAGE_KEY, v);
  }

  const options: { value: CalendarViewMode; label: string; desc: string; icon: typeof LayoutGrid }[] = [
    {
      value: "separate",
      label: "Getrennte Kalender",
      desc: "Jede Unterkunft hat einen eigenen Kalender nebeneinander",
      icon: Columns,
    },
    {
      value: "combined",
      label: "Gemeinsamer Kalender",
      desc: "Alle Unterkünfte in einem Kalender, farblich unterschieden",
      icon: LayoutGrid,
    },
  ];

  return (
    <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 20 }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <h2 style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 15 }}>Kalender-Ansicht</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Wie sollen mehrere Unterkünfte im Kalender dargestellt werden?</p>
      </div>
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {options.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => select(opt.value)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: 16,
                borderRadius: 14,
                border: active ? "2px solid rgba(13,148,136,0.7)" : "2px solid rgba(255,255,255,0.1)",
                background: active ? "rgba(13,148,136,0.12)" : "rgba(255,255,255,0.04)",
                textAlign: "left",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <opt.icon style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, color: active ? "#14B8A6" : "rgba(255,255,255,0.35)" }} />
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.6)" }}>
                  {opt.label}
                </p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
