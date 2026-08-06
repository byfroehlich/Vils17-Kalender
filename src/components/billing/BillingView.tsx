"use client";

import { useState, useTransition } from "react";
import { CheckCircle, Euro, Clock, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

type Assignment = {
  id: string;
  paidOut: boolean;
  paidOutAt: Date | string | null;
  booking: { checkOut: Date | string; guestName: string };
  cleaner: { id: string; name: string; cleanerRate: number } | null;
};

type MonthGroup = {
  year: number;
  month: number;
  cleanerId: string;
  cleanerName: string;
  rate: number;
  jobs: Assignment[];
  allPaid: boolean;
};

function groupByMonthAndCleaner(assignments: Assignment[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();

  for (const a of assignments) {
    if (!a.cleaner) continue;
    const d = new Date(a.booking.checkOut);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${a.cleaner.id}-${year}-${month}`;

    if (!map.has(key)) {
      map.set(key, {
        year,
        month,
        cleanerId: a.cleaner.id,
        cleanerName: a.cleaner.name,
        rate: a.cleaner.cleanerRate,
        jobs: [],
        allPaid: true,
      });
    }
    const group = map.get(key)!;
    group.jobs.push(a);
    if (!a.paidOut) group.allPaid = false;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return b.month - a.month;
  });
}

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function BillingView({ assignments }: { assignments: Assignment[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [paying, setPaying] = useState<string | null>(null);
  const [selectedCleaner, setSelectedCleaner] = useState<string>("all");

  const allGroups = groupByMonthAndCleaner(assignments);

  // Eindeutige Reiniger aus allen Gruppen
  const cleaners = Array.from(
    new Map(allGroups.map((g) => [g.cleanerId, g.cleanerName])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const groups = selectedCleaner === "all"
    ? allGroups
    : allGroups.filter((g) => g.cleanerId === selectedCleaner);

  const totalUnpaid = groups.reduce(
    (sum, g) => sum + (g.allPaid ? 0 : g.jobs.filter((j) => !j.paidOut).length * g.rate),
    0
  );
  const totalPaid = groups.reduce(
    (sum, g) => sum + g.jobs.filter((j) => j.paidOut).length * g.rate,
    0
  );

  async function markPaid(group: MonthGroup) {
    const key = `${group.cleanerId}-${group.year}-${group.month}`;
    setPaying(key);
    try {
      const res = await fetch("/api/billing/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cleanerId: group.cleanerId,
          year: group.year,
          month: group.month,
        }),
      });
      if (!res.ok) throw new Error("Fehler beim Speichern");
      startTransition(() => router.refresh());
    } catch {
      alert("Fehler beim Markieren. Bitte erneut versuchen.");
    } finally {
      setPaying(null);
    }
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <AlertCircle style={{ color: "rgba(255,255,255,0.3)", width: 40, height: 40 }} />
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
          Noch keine erledigten Reinigungen
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 style={{ fontWeight: 700, color: "rgba(255,255,255,0.9)", fontSize: 22 }}>
          Abrechnung
        </h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 2 }}>
          Erledigte Reinigungen pro Monat
        </p>
      </div>

      {/* Reiniger-Filter */}
      {cleaners.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
          {([["all", "Alle"] as const, ...cleaners]).map(([id, name]) => {
            const active = selectedCleaner === id;
            const count = id === "all"
              ? allGroups.reduce((s, g) => s + g.jobs.length, 0)
              : allGroups.filter((g) => g.cleanerId === id).reduce((s, g) => s + g.jobs.length, 0);
            return (
              <button
                key={id}
                onClick={() => setSelectedCleaner(id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px",
                  background: active ? "rgba(13,148,136,0.25)" : "rgba(255,255,255,0.07)",
                  border: active ? "1px solid rgba(13,148,136,0.55)" : "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 20,
                  color: active ? "#5eead4" : "rgba(255,255,255,0.55)",
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {name}
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: active ? "rgba(13,148,136,0.40)" : "rgba(255,255,255,0.12)",
                  color: active ? "#99f6e4" : "rgba(255,255,255,0.45)",
                  borderRadius: "9999px", padding: "1px 7px",
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Übersicht Karten */}
      <div className="grid grid-cols-2 gap-3">
        <div style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: "12px 16px" }}>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ausstehend</p>
          <p style={{ color: "#10b981", fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {totalUnpaid.toFixed(0)} €
          </p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 16px" }}>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gesamt ausgezahlt</p>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {totalPaid.toFixed(0)} €
          </p>
        </div>
      </div>

      {/* Monatsgruppen */}
      <div className="space-y-3">
        {groups.map((group) => {
          const key = `${group.cleanerId}-${group.year}-${group.month}`;
          const unpaidCount = group.jobs.filter((j) => !j.paidOut).length;
          const total = group.jobs.length * group.rate;
          const paidTotal = group.jobs.filter((j) => j.paidOut).length * group.rate;

          return (
            <div
              key={key}
              style={{
                background: group.allPaid ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)",
                border: group.allPaid ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(16,185,129,0.2)",
                borderRadius: 14,
                padding: "16px",
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 15 }}>
                      {MONTH_NAMES[group.month - 1]} {group.year}
                    </span>
                    {group.allPaid && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "rgba(16,185,129,0.2)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.3)" }}>
                        Bezahlt
                      </span>
                    )}
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 2 }}>
                    {group.cleanerName} · {group.jobs.length} Auftrag{group.jobs.length !== 1 ? "träge" : ""} · {group.rate} €/Stück
                  </p>
                </div>
                <div className="text-right">
                  <p style={{ fontWeight: 700, color: group.allPaid ? "rgba(255,255,255,0.5)" : "#10b981", fontSize: 18 }}>
                    {group.allPaid ? total.toFixed(0) : (unpaidCount * group.rate).toFixed(0)} €
                  </p>
                  {!group.allPaid && paidTotal > 0 && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                      +{paidTotal.toFixed(0)} € bereits bezahlt
                    </p>
                  )}
                </div>
              </div>

              {/* Job-Liste */}
              <div className="mt-3 space-y-1.5">
                {group.jobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {job.paidOut ? (
                        <CheckCircle style={{ width: 14, height: 14, color: "#10b981", flexShrink: 0 }} />
                      ) : (
                        <Clock style={{ width: 14, height: 14, color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 13, color: job.paidOut ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.7)" }}>
                        {job.booking.guestName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                        Abreise {new Date(job.booking.checkOut).toLocaleDateString("de-AT", { day: "numeric", month: "numeric" })}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: job.paidOut ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.8)" }}>
                        {group.rate.toFixed(0)} €
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Auszahlen Button */}
              {!group.allPaid && (
                <button
                  onClick={() => markPaid(group)}
                  disabled={paying === key || isPending}
                  style={{
                    marginTop: 14,
                    width: "100%",
                    background: paying === key ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.2)",
                    border: "1px solid rgba(16,185,129,0.35)",
                    borderRadius: 10,
                    padding: "10px",
                    color: "#6ee7b7",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: paying === key ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Euro style={{ width: 16, height: 16 }} />
                  {paying === key ? "Wird gespeichert…" : `${(unpaidCount * group.rate).toFixed(0)} € als ausgezahlt markieren`}
                </button>
              )}

              {group.allPaid && group.jobs[0]?.paidOutAt && (
                <p style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                  Ausgezahlt am {new Date(group.jobs[0].paidOutAt).toLocaleDateString("de-AT", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
