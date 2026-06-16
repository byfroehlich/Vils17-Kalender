"use client";

import { CheckCircle, Clock, Euro, AlertCircle } from "lucide-react";

type Assignment = {
  id: string;
  paidOut: boolean;
  paidOutAt: Date | string | null;
  booking: {
    checkOut: Date | string;
    apartment: { name: string; color: string | null };
  };
  cleaner: { cleanerRate: number } | null;
};

type MonthGroup = {
  year: number;
  month: number;
  rate: number;
  jobs: Assignment[];
  allPaid: boolean;
};

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function groupByMonth(assignments: Assignment[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  const rate = assignments.find((a) => a.cleaner?.cleanerRate != null)?.cleaner?.cleanerRate ?? 50;

  for (const a of assignments) {
    const d = new Date(a.booking.checkOut);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${month}`;

    if (!map.has(key)) {
      map.set(key, { year, month, rate, jobs: [], allPaid: true });
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

export function CleanerBillingView({
  assignments,
  cleanerName,
}: {
  assignments: Assignment[];
  cleanerName: string;
}) {
  const groups = groupByMonth(assignments);
  const rate = assignments.find((a) => a.cleaner?.cleanerRate != null)?.cleaner?.cleanerRate ?? 50;
  const totalEarned = assignments.length * rate;
  const totalPaid = assignments.filter((a) => a.paidOut).length * rate;
  const totalPending = totalEarned - totalPaid;

  if (groups.length === 0) {
    return (
      <div className="p-4 lg:p-8 max-w-3xl mx-auto">
        <div>
          <h1 style={{ fontWeight: 700, color: "rgba(255,255,255,0.9)", fontSize: 22 }}>
            Meine Abrechnung
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <AlertCircle style={{ color: "rgba(255,255,255,0.3)", width: 40, height: 40 }} />
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
            Noch keine erledigten Reinigungen
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 style={{ fontWeight: 700, color: "rgba(255,255,255,0.9)", fontSize: 22 }}>
          Meine Abrechnung
        </h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 2 }}>
          {rate} € pro Reinigung · {assignments.length} erledigt
        </p>
      </div>

      {/* Übersichtskarten */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Gesamt", value: totalEarned, color: "rgba(255,255,255,0.8)" },
          { label: "Ausstehend", value: totalPending, color: totalPending > 0 ? "#10b981" : "rgba(255,255,255,0.4)" },
          { label: "Ausgezahlt", value: totalPaid, color: "rgba(255,255,255,0.4)" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "12px 14px",
              textAlign: "center",
            }}
          >
            <p style={{ color, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
              {value.toFixed(0)} €
            </p>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Monatsgruppen */}
      <div className="space-y-3">
        {groups.map((group) => {
          const key = `${group.year}-${group.month}`;
          const unpaid = group.jobs.filter((j) => !j.paidOut).length;
          const paidCount = group.jobs.length - unpaid;

          return (
            <div
              key={key}
              style={{
                background: group.allPaid ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
                border: group.allPaid ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(16,185,129,0.2)",
                borderRadius: 14,
                padding: 16,
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 15 }}>
                    {MONTH_NAMES[group.month - 1]} {group.year}
                  </span>
                  {group.allPaid && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "rgba(16,185,129,0.2)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.3)" }}>
                      Ausgezahlt
                    </span>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontWeight: 700, color: group.allPaid ? "rgba(255,255,255,0.45)" : "#10b981", fontSize: 18 }}>
                    {group.jobs.length * group.rate} €
                  </p>
                  {!group.allPaid && paidCount > 0 && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                      {paidCount} bezahlt
                    </p>
                  )}
                </div>
              </div>

              {/* Job-Liste */}
              <div className="space-y-1.5">
                {group.jobs.map((job) => {
                  const aptColor = job.booking.apartment.color ?? "#14B8A6";
                  return (
                    <div key={job.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        {job.paidOut ? (
                          <CheckCircle style={{ width: 14, height: 14, color: "#10b981", flexShrink: 0 }} />
                        ) : (
                          <Clock style={{ width: 14, height: 14, color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
                        )}
                        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: aptColor, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: job.paidOut ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {job.booking.apartment.name}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                          {new Date(job.booking.checkOut).toLocaleDateString("de-AT", { day: "numeric", month: "numeric" })}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: job.paidOut ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.85)" }}>
                          {group.rate} €
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

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
