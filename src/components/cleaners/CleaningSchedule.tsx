"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { AlertCircle, CalendarCheck, WashingMachine, Users } from "lucide-react";
import { CleanerList } from "./CleanerList";

interface Assignment {
  id: string;
  status: string;
  isSelfClean: boolean;
  laundryStatus: string;
  cleaner?: { name: string } | null;
  booking: {
    id: string;
    guestName: string;
    guestCount: number;
    checkOut: Date;
    apartment: {
      name: string;
      color?: string | null;
      laundryBedsDivisor?: number | null;
      laundryTowelsPerGuest?: number | null;
      laundryKitchenCount?: number | null;
    };
  };
}

interface Cleaner {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  language: string;
  active: boolean;
  _count: { assignments: number };
}

const cleaningColors: Record<string, string> = {
  UNASSIGNED: "bg-orange-100 text-orange-800 border-orange-200",
  SELF_CLEAN: "bg-sky-100 text-sky-800 border-sky-200",
  ASSIGNED:   "bg-blue-100 text-blue-800 border-blue-200",
  COMPLETED:  "bg-green-100 text-green-800 border-green-200",
};
const cleaningLabels: Record<string, string> = {
  UNASSIGNED: "Offen", SELF_CLEAN: "Selbstreinigung", ASSIGNED: "Zugewiesen", COMPLETED: "Erledigt",
};
const laundryColors: Record<string, string> = {
  OPEN:      "bg-red-100 text-red-800 border-red-200",
  ORDERED:   "bg-amber-100 text-amber-800 border-amber-200",
  AVAILABLE: "bg-green-100 text-green-800 border-green-200",
};
const laundryLabels: Record<string, string> = {
  OPEN: "Offen", ORDERED: "Bestellt", AVAILABLE: "Vorhanden",
};

function calcLaundry(guestCount: number, apt: Assignment["booking"]["apartment"]) {
  return {
    beds: Math.ceil(guestCount / (apt.laundryBedsDivisor ?? 2)),
    towels: guestCount * (apt.laundryTowelsPerGuest ?? 1),
    kitchen: apt.laundryKitchenCount ?? 1,
  };
}

function AssignmentRow({ a }: { a: Assignment }) {
  const effectiveStatus = a.isSelfClean && a.status === "UNASSIGNED" ? "SELF_CLEAN" : a.status;
  return (
    <Link
      href={`/bookings/${a.booking.id}`}
      className="flex items-center gap-3 bg-white rounded-xl border border-zinc-200 px-4 py-3 hover:border-zinc-300 transition-colors"
    >
      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: a.booking.apartment.color ?? "#18181b" }} />
      <div className="w-20 flex-shrink-0">
        <p className="text-xs font-semibold text-zinc-900">{formatDate(a.booking.checkOut)}</p>
        <p className="text-xs text-zinc-400">Abreise</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 truncate">{a.booking.guestName}</p>
        <p className="text-xs text-zinc-400">{a.booking.apartment.name} · {a.booking.guestCount} {a.booking.guestCount === 1 ? "Person" : "Personen"}</p>
      </div>
      <div className="hidden sm:block w-28 flex-shrink-0 text-right">
        {a.isSelfClean ? (
          <p className="text-xs text-zinc-500">Selbstreinigung</p>
        ) : a.cleaner ? (
          <p className="text-xs font-medium text-zinc-700">{a.cleaner.name}</p>
        ) : (
          <p className="text-xs text-orange-600 font-medium">Nicht zugewiesen</p>
        )}
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${cleaningColors[effectiveStatus] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>
        {cleaningLabels[effectiveStatus] ?? effectiveStatus}
      </span>
    </Link>
  );
}

function LaundryRow({ a }: { a: Assignment }) {
  const qty = calcLaundry(a.booking.guestCount, a.booking.apartment);
  return (
    <Link
      href={`/bookings/${a.booking.id}`}
      className="flex items-center gap-3 bg-white rounded-xl border border-zinc-200 px-4 py-3 hover:border-zinc-300 transition-colors"
    >
      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: a.booking.apartment.color ?? "#18181b" }} />
      <div className="w-20 flex-shrink-0">
        <p className="text-xs font-semibold text-zinc-900">{formatDate(a.booking.checkOut)}</p>
        <p className="text-xs text-zinc-400">{a.booking.apartment.name}</p>
      </div>
      <div className="flex-1 flex items-center gap-1.5 flex-wrap">
        <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md font-medium">🛏 {qty.beds}</span>
        <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md font-medium">🛁 {qty.towels}</span>
        <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md font-medium">🍽 {qty.kitchen}</span>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${laundryColors[a.laundryStatus] ?? ""}`}>
        {laundryLabels[a.laundryStatus] ?? a.laundryStatus}
      </span>
    </Link>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "32px 24px", textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 14 }}>
      {label}
    </div>
  );
}

type Tab = "open" | "planned" | "laundry" | "cleaners";

export function CleaningSchedule({
  assignments,
  cleaners,
  isAdmin,
}: {
  assignments: Assignment[];
  cleaners: Cleaner[];
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>("open");

  // Offen: nicht zugewiesen UND kein Selbstreiniger
  const open    = assignments.filter(a => a.status === "UNASSIGNED" && !a.isSelfClean);
  // Geplant: zugewiesen, Selbstreinigung, oder isSelfClean-Flag gesetzt
  const planned = assignments.filter(a =>
    a.status === "ASSIGNED" || a.status === "SELF_CLEAN" || a.isSelfClean
  );
  // Wäsche: alles außer bereits erledigte Buchungen mit vorhandener Wäsche
  const laundry = assignments.filter(a => !(a.laundryStatus === "AVAILABLE" && a.status === "COMPLETED"));

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number; urgent?: boolean }[] = [
    { key: "open",     label: "Offen",    icon: <AlertCircle className="w-4 h-4" />,    count: open.length,     urgent: open.length > 0 },
    { key: "planned",  label: "Geplant",  icon: <CalendarCheck className="w-4 h-4" />,  count: planned.length },
    { key: "laundry",  label: "Wäsche",   icon: <WashingMachine className="w-4 h-4" />, count: laundry.length },
    { key: "cleaners", label: "Reiniger", icon: <Users className="w-4 h-4" />,           count: cleaners.length },
  ];

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: tab === t.key ? "rgba(255,255,255,0.12)" : "transparent",
              color: tab === t.key ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)",
              boxShadow: tab === t.key ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
            }}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            {t.count !== undefined && t.count > 0 && (
              <span
                className="min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1"
                style={{
                  background: t.urgent ? (tab === t.key ? "#f97316" : "rgba(249,115,22,0.25)") : "rgba(255,255,255,0.15)",
                  color: t.urgent ? (tab === t.key ? "white" : "#fb923c") : "rgba(255,255,255,0.6)",
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Labels unter Icons auf Mobile */}
      <div className="flex sm:hidden gap-1 px-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, fontSize: 10, fontWeight: 500, textAlign: "center" as const, color: tab === t.key ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Inhalte */}
      {tab === "open" && (
        <div className="space-y-2">
          {open.length === 0
            ? <EmptyState label="Keine offenen Reinigungen — alles zugewiesen." />
            : open.map(a => <AssignmentRow key={a.id} a={a} />)
          }
        </div>
      )}

      {tab === "planned" && (
        <div className="space-y-2">
          {planned.length === 0
            ? <EmptyState label="Keine geplanten Reinigungen in den nächsten 60 Tagen." />
            : planned.map(a => <AssignmentRow key={a.id} a={a} />)
          }
        </div>
      )}

      {tab === "laundry" && (
        <div className="space-y-2">
          {laundry.length === 0
            ? <EmptyState label="Keine offenen Wäschebestellungen." />
            : laundry.map(a => <LaundryRow key={`l-${a.id}`} a={a} />)
          }
        </div>
      )}

      {tab === "cleaners" && (
        isAdmin
          ? <CleanerList cleaners={cleaners} />
          : <EmptyState label="Reiniger werden von Administratoren verwaltet." />
      )}
    </div>
  );
}
