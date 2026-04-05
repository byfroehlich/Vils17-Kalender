"use client";

import { useState, useEffect } from "react";
import { LayoutGrid, Columns } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="bg-white rounded-2xl border border-zinc-200">
      <div className="px-6 py-4 border-b border-zinc-100">
        <h2 className="font-semibold text-zinc-900">Kalender-Ansicht</h2>
        <p className="text-sm text-zinc-500 mt-0.5">Wie sollen mehrere Unterkünfte im Kalender dargestellt werden?</p>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => select(opt.value)}
            className={cn(
              "flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all",
              mode === opt.value
                ? "border-zinc-900 bg-zinc-50"
                : "border-zinc-200 hover:border-zinc-300"
            )}
          >
            <opt.icon className={cn("w-5 h-5 mt-0.5 flex-shrink-0", mode === opt.value ? "text-zinc-900" : "text-zinc-400")} />
            <div>
              <p className={cn("font-semibold text-sm", mode === opt.value ? "text-zinc-900" : "text-zinc-600")}>
                {opt.label}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
