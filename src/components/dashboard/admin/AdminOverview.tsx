import Link from "next/link";
import { Camera } from "lucide-react";
import { splitTodoLabel, todoAction, type TodoItem, type TodoSeverity, type WeekDay } from "@/lib/todo";
import type { Occupancy } from "@/lib/occupancy";

// Neue Admin-Übersicht (Entscheidung Mathias 01.11.2026): dunkler Glas-Stil wie die Zentrale,
// Petrol bleibt die Leitfarbe. Inhalte und Funktionen wie bisher („Zu erledigen“, „Diese Woche“),
// dazu die Belegung des Monats. Keine Finanzzahlen.

export const darkGlass = {
  background: "rgba(255,255,255,0.055)",
  border: "0.5px solid rgba(255,255,255,0.14)",
  backdropFilter: "blur(28px) saturate(170%)",
  WebkitBackdropFilter: "blur(28px) saturate(170%)",
  borderRadius: 26,
} as const;

const label = { fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.64)" } as const;

const DOT: Record<TodoSeverity, string> = { red: "#EF4444", amber: "#F59E0B", neutral: "rgba(255,255,255,0.45)" };

export function AdminTodoCard({ items, chatsUnchecked = false }: { items: TodoItem[]; chatsUnchecked?: boolean }) {
  const urgent = items.filter((i) => i.severity === "red").length;
  return (
    <section style={{ ...darkGlass, padding: 16 }} aria-labelledby="todo-h">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 6 }}>
        <h2 id="todo-h" style={label}>Zu erledigen</h2>
        <span style={{ fontSize: 12, fontWeight: 600, color: urgent ? "#FCA5A5" : "rgba(255,255,255,0.64)" }}>
          {items.length ? `${items.length} offen${urgent ? ` · ${urgent} dringend` : ""}` : "erledigt"}
        </span>
      </div>

      {items.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }}>
          <span aria-hidden style={{ width: 32, height: 32, borderRadius: 16, background: "rgba(94,234,212,0.18)", display: "flex", alignItems: "center", justifyContent: "center", color: "#5EEAD4", fontWeight: 700 }}>✓</span>
          <span style={{ fontSize: 17, fontWeight: 300 }}>Alles erledigt</span>
        </div>
      )}

      {items.map((i, idx) => {
        const { title, sub } = splitTodoLabel(i.label);
        const neutral = i.severity === "neutral";
        return (
          <div key={i.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, minHeight: 60, padding: "8px 0", borderTop: idx ? "0.5px solid rgba(255,255,255,0.1)" : "none" }}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: 5, flexShrink: 0, marginTop: 6, background: DOT[i.severity], boxShadow: i.severity === "red" ? "0 0 10px rgba(239,68,68,0.7)" : "none" }} />
            <Link href={i.href} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, textDecoration: "none" }}>
              <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3, color: i.severity === "red" ? "#FECACA" : "#FFFFFF" }}>{title}</span>
              {(sub || i.photo) && (
                <span style={{ fontSize: 12, lineHeight: 1.35, color: "rgba(255,255,255,0.64)", display: "flex", alignItems: "center", gap: 5 }}>
                  {i.photo && <Camera aria-label="mit Foto" style={{ width: 13, height: 13, flexShrink: 0 }} />}
                  {sub}
                </span>
              )}
            </Link>
            <Link
              href={i.href}
              style={{
                flexShrink: 0, alignSelf: "center", minHeight: 40, padding: "0 12px", borderRadius: 20, display: "flex", alignItems: "center",
                fontSize: 13, fontWeight: 600, textDecoration: "none",
                ...(neutral
                  ? { border: "0.5px solid rgba(255,255,255,0.22)", color: "#FFFFFF" }
                  : { background: "linear-gradient(135deg, #2DD4BF 0%, #0D9488 100%)", color: "#031512" }),
              }}
            >
              {todoAction(i)}
            </Link>
          </div>
        );
      })}

      {chatsUnchecked && (
        <div style={{ marginTop: 8, borderRadius: 14, padding: "10px 12px", background: "rgba(255,255,255,0.06)", fontSize: 12, lineHeight: 1.4, color: "rgba(255,255,255,0.75)" }}>
          Gästechats konnten gerade nicht geprüft werden —{" "}
          <Link href="/messages" style={{ color: "#5EEAD4", textDecoration: "underline" }}>Gäste öffnen</Link>
        </div>
      )}
    </section>
  );
}

export function AdminTodoSkeleton() {
  return (
    <section style={{ ...darkGlass, padding: 16 }}>
      <h2 style={label}>Zu erledigen</h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 10 }}>Wird geprüft …</p>
    </section>
  );
}

const FALLBACK = ["#2DD4BF", "#C8A2FF", "#8EC5FF", "#FCD34D"];

export function OccupancyCard({ occ }: { occ: Occupancy }) {
  const cols = `repeat(${occ.days}, minmax(0, 1fr))`;
  return (
    <section style={{ ...darkGlass, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }} aria-labelledby="occ-h">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 id="occ-h" style={label}>Belegung {occ.monthLabel}</h2>
        <Link href="/calendar" style={{ fontSize: 13, color: "#5EEAD4", textDecoration: "none" }}>Kalender</Link>
      </div>
      {occ.apartments.map((a, k) => {
        const c = a.color ?? FALLBACK[k % FALLBACK.length];
        return (
          <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "rgba(255,255,255,0.88)" }}>{a.name}</span>
              <span style={{ color: "rgba(255,255,255,0.64)" }}>{a.booked} von {occ.days} Nächten</span>
            </div>
            <div role="img" aria-label={`${a.name}: ${a.booked} von ${occ.days} Nächten belegt`} style={{ display: "grid", gridTemplateColumns: cols, gap: 2 }}>
              {a.nights.map((on, i) => (
                <span key={i} style={{ height: 18, borderRadius: 3, background: on ? c : "rgba(255,255,255,0.08)", boxShadow: i === occ.todayIndex ? "0 0 0 1.5px #FFFFFF" : "none" }} />
              ))}
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
        <span>1.</span><span>15.</span><span>{occ.days}.</span>
      </div>
    </section>
  );
}

export function AdminWeekCard({ days }: { days: WeekDay[] }) {
  return (
    <section style={{ ...darkGlass, padding: "14px 16px" }} aria-labelledby="week-h">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 6 }}>
        <h2 id="week-h" style={label}>Diese Woche</h2>
        <Link href="/bookings" style={{ fontSize: 13, color: "#5EEAD4", textDecoration: "none" }}>Alle Buchungen</Link>
      </div>
      {days.map((d, k) => (
        <div key={d.day} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: k ? "0.5px solid rgba(255,255,255,0.1)" : "none" }}>
          <span style={{ width: 54, flexShrink: 0, fontSize: 13, fontWeight: 600, paddingTop: 4, color: k === 0 ? "#5EEAD4" : "rgba(255,255,255,0.9)" }}>{d.label}</span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {d.entries.length === 0 && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", paddingTop: 4 }}>nichts los</span>}
            {d.entries.map((e) => {
              const arrival = e.type === "anreise";
              const noCleaner = arrival && !e.cleaner && !e.selfClean;
              const parts: string[] = [];
              if (arrival) {
                parts.push(e.guestsUnconfirmed ? "Gästezahl unbekannt" : `${e.guestCount} ${e.guestCount === 1 ? "Gast" : "Gäste"}`);
                parts.push(e.selfClean ? "Selbstreinigung" : e.cleaner ? `Reinigung: ${e.cleaner}${e.cleaningStatus === "COMPLETED" ? " · erledigt" : ""}` : "ohne Reinigungskraft");
              } else {
                parts.push("bis 10:00");
                if (e.robot) parts.push("Saugroboter startet 10:00");
              }
              const warn = noCleaner || !!e.guestsUnconfirmed;
              return (
                <Link key={`${e.type}-${e.bookingId}`} href={`/bookings/${e.bookingId}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", textDecoration: "none" }}>
                  <span style={{ flexShrink: 0, width: 62, textAlign: "center", padding: "4px 0", borderRadius: 10, fontSize: 11, fontWeight: 600, ...(arrival ? { background: "#14B8A6", color: "#031512" } : { background: "rgba(255,255,255,0.12)", color: "#FFFFFF" }) }}>
                    {arrival ? "Anreise" : "Abreise"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, color: "#FFFFFF" }}>
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: e.apartmentColor ?? "#2DD4BF" }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.apartmentName} · {e.guestName}</span>
                    </span>
                    <span style={{ fontSize: 12, lineHeight: 1.35, color: warn ? "#FCA5A5" : "rgba(255,255,255,0.66)" }}>{parts.join(" · ")}</span>
                    {e.hasNote && (
                      <span style={{ alignSelf: "flex-start", marginTop: 2, padding: "3px 8px", borderRadius: 9, background: "rgba(245,158,11,0.16)", color: "#FCD34D", fontSize: 11, fontWeight: 600, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        ⭐ Hinweis{e.note ? `: ${e.note}` : ""}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
