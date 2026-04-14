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

const cleaningBadge: Record<string, { bg: string; color: string }> = {
  UNASSIGNED: { bg: "rgba(239,68,68,0.18)",  color: "#FCA5A5" },
  SELF_CLEAN: { bg: "rgba(14,165,233,0.18)", color: "#7DD3FC" },
  ASSIGNED:   { bg: "rgba(13,148,136,0.18)", color: "#5EEAD4" },
  COMPLETED:  { bg: "rgba(34,197,94,0.18)",  color: "#86EFAC" },
};
const cleaningLabels: Record<string, string> = {
  UNASSIGNED: "Offen", SELF_CLEAN: "Selbstreinigung", ASSIGNED: "Zugewiesen", COMPLETED: "Erledigt",
};
const laundryBadge: Record<string, { bg: string; color: string }> = {
  OPEN:      { bg: "rgba(239,68,68,0.18)",  color: "#FCA5A5" },
  ORDERED:   { bg: "rgba(245,158,11,0.18)", color: "#FCD34D" },
  AVAILABLE: { bg: "rgba(34,197,94,0.18)",  color: "#86EFAC" },
};
const laundryLabels: Record<string, string> = {
  OPEN: "Offen", ORDERED: "Bestellt", AVAILABLE: "Vorhanden",
};

const rowGlass: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "rgba(255,255,255,0.10)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 14,
  padding: "12px 16px",
  textDecoration: "none",
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
  const badge = cleaningBadge[effectiveStatus] ?? { bg: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" };
  return (
    <Link href={`/bookings/${a.booking.id}`} style={rowGlass}>
      <div style={{ width: 3, alignSelf: "stretch", borderRadius: 4, flexShrink: 0, backgroundColor: a.booking.apartment.color ?? "#14B8A6" }} />
      <div style={{ width: 72, flexShrink: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{formatDate(a.booking.checkOut)}</p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Abreise</p>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.booking.guestName}</p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{a.booking.apartment.name} · {a.booking.guestCount} {a.booking.guestCount === 1 ? "Person" : "Personen"}</p>
      </div>
      <div style={{ display: "none" }} className="sm:block" >
        {a.isSelfClean
          ? <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>Selbstreinigung</p>
          : a.cleaner
            ? <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", textAlign: "right" }}>{a.cleaner.name}</p>
            : <p style={{ fontSize: 11, fontWeight: 600, color: "#FCA5A5", textAlign: "right" }}>Nicht zugewiesen</p>
        }
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: badge.bg, color: badge.color, flexShrink: 0, whiteSpace: "nowrap" }}>
        {cleaningLabels[effectiveStatus] ?? effectiveStatus}
      </span>
    </Link>
  );
}

function LaundryRow({ a }: { a: Assignment }) {
  const qty = calcLaundry(a.booking.guestCount, a.booking.apartment);
  const badge = laundryBadge[a.laundryStatus] ?? { bg: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" };
  return (
    <Link href={`/bookings/${a.booking.id}`} style={rowGlass}>
      <div style={{ width: 3, alignSelf: "stretch", borderRadius: 4, flexShrink: 0, backgroundColor: a.booking.apartment.color ?? "#14B8A6" }} />
      <div style={{ width: 72, flexShrink: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{formatDate(a.booking.checkOut)}</p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{a.booking.apartment.name}</p>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
        <span style={{ fontSize: 11, fontWeight: 600, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", padding: "3px 8px", borderRadius: 8 }}>🛏 {qty.beds}</span>
        <span style={{ fontSize: 11, fontWeight: 600, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", padding: "3px 8px", borderRadius: 8 }}>🛁 {qty.towels}</span>
        <span style={{ fontSize: 11, fontWeight: 600, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", padding: "3px 8px", borderRadius: 8 }}>🍽 {qty.kitchen}</span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: badge.bg, color: badge.color, flexShrink: 0, whiteSpace: "nowrap" }}>
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
