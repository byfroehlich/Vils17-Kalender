"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LAUNDRY_ITEMS, type LaundryQuantity } from "@/lib/laundry-quantity";

const glass = { background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20 } as const;
const h2 = { fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 12 } as const;
const btn = (c: string) => ({ padding: "7px 14px", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", background: `rgba(${c},0.2)`, border: `1px solid rgba(${c},0.45)`, color: "rgba(255,255,255,0.9)" }) as const;
const num = { width: 64, padding: "4px 8px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)", fontSize: 14, textAlign: "center" as const };

type Q = LaundryQuantity;

export interface PlannerProps {
  todayKey: string;
  plan: { need: Q; reserve: Q; stockToday: Q | null; incoming: Q; order: Q; stockAfter: Q | null; shortBeforeDelivery: (keyof Q)[]; overdueDeliveries: number };
  lastCount: { countedOn: string; quantities: Q } | null;
  /** bestellt, noch nicht im Keller angekommen */
  deliveries: { id: string; deliveryOn: string; quantities: Q; reference: string | null }[];
  /** in den letzten Tagen angekommen (nur Info) */
  recentlyArrived: { id: string; arrivedOn: string; quantities: Q; reference: string | null }[];
}

function QtyInputs({ value, onChange }: { value: Q; onChange: (q: Q) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {LAUNDRY_ITEMS.map((i) => (
        <label key={i.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
          <span>{i.emoji} {i.label}</span>
          <input type="number" min={0} max={999} value={value[i.key]} onChange={(e) => onChange({ ...value, [i.key]: Math.max(0, parseInt(e.target.value || "0", 10)) })} style={num} />
        </label>
      ))}
    </div>
  );
}

export function LaundryPlanner({ todayKey, plan, lastCount, deliveries, recentlyArrived }: PlannerProps) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "count" | "delivery" | "reserve">(null);
  const [q, setQ] = useState<Q>(plan.order);
  const [date, setDate] = useState(todayKey);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function open(m: "count" | "delivery" | "reserve") {
    setMode(m);
    setErr("");
    setDate(todayKey);
    setRef("");
    setQ(m === "count" ? (plan.stockToday ?? lastCount?.quantities ?? emptyQ()) : m === "reserve" ? plan.reserve : plan.order);
  }

  async function post(body: object, ok: string) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/laundry/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fehlgeschlagen");
      setMode(null);
      setMsg(ok);
      setTimeout(() => setMsg(""), 3000);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (mode === "count") post({ action: "count", countedOn: date, quantities: q }, "✓ Bestand gespeichert");
    if (mode === "delivery") post({ action: "delivery", deliveryOn: date, quantities: q, ...(ref ? { reference: ref } : {}) }, "✓ Bestellung festgehalten");
    if (mode === "reserve") post({ action: "reserve", quantities: q }, "✓ Reserve gespeichert");
  }

  const cell = { textAlign: "right" as const, padding: "6px 0 6px 8px" };

  return (
    <>
      <div style={{ ...glass, padding: "20px 24px" }}>
        <h2 style={h2}>Rechnung je Teil</h2>
        {!plan.stockToday && (
          <p style={{ fontSize: 13, color: "#fcd34d", marginBottom: 10 }}>Noch kein Bestand erfasst — die Bestellmenge enthält deshalb den vollen Bedarf. Bitte den Keller zählen und unten eintragen.</p>
        )}
        {plan.shortBeforeDelivery.length > 0 && (
          <p style={{ fontSize: 13, color: "#fca5a5", marginBottom: 10 }}>
            Achtung: Vor der nächsten Lieferung reicht es nicht bei {plan.shortBeforeDelivery.map((k) => LAUNDRY_ITEMS.find((i) => i.key === k)?.label).join(", ")}.
          </p>
        )}
        {plan.overdueDeliveries > 0 && (
          <p style={{ fontSize: 13, color: "#fcd34d", marginBottom: 10 }}>
            {plan.overdueDeliveries === 1 ? "Eine Lieferung ist" : `${plan.overdueDeliveries} Lieferungen sind`} überfällig und noch nicht als angekommen bestätigt — sie zählt noch als „bestellt“. Bitte unten bestätigen, sobald sie im Keller ist.
          </p>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, color: "rgba(255,255,255,0.85)", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                <th style={{ textAlign: "left" }}>Teil</th><th style={cell}>Bedarf</th><th style={cell}>Reserve</th><th style={cell}>Im Keller</th><th style={cell}>Unterwegs</th><th style={cell}>Bestellen</th>
              </tr>
            </thead>
            <tbody>
              {LAUNDRY_ITEMS.map((i) => (
                <tr key={i.key} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: "6px 0" }}>{i.emoji} {i.label}</td>
                  <td style={cell}>{plan.need[i.key]}</td>
                  <td style={{ ...cell, color: "rgba(255,255,255,0.55)" }}>{plan.reserve[i.key]}</td>
                  <td style={{ ...cell, color: "rgba(255,255,255,0.55)" }}>{plan.stockToday ? Math.max(0, plan.stockToday[i.key]) : "?"}</td>
                  <td style={{ ...cell, color: "rgba(255,255,255,0.55)" }}>{plan.incoming[i.key] ? plan.incoming[i.key] : "–"}</td>
                  <td style={{ ...cell, fontWeight: 700, color: plan.order[i.key] ? "#5eead4" : "rgba(255,255,255,0.5)" }}>{plan.order[i.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginTop: 10 }}>
          Alle Zahlen sind Stückzahlen. Bestellen = Bedarf + Reserve − im Keller − unterwegs (nie unter 0). Die Reserve bleibt nach allen Anreisen immer im Keller.
        </p>
      </div>

      {msg && <div style={{ padding: "10px 16px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 12, color: "#86efac", fontSize: 14, fontWeight: 600 }}>{msg}</div>}

      <div style={{ ...glass, padding: "20px 24px" }}>
        <h2 style={h2}>Bestand &amp; Bestellungen</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 12 }}>
          {lastCount ? <>Letzte Zählung: <strong>{lastCount.countedOn.split("-").reverse().join(".")}</strong>. Seitdem rechnet die App Anreisen ab und angekommene Lieferungen dazu.</> : "Noch keine Zählung."}
        </p>
        {deliveries.length > 0 && (
          <div className="space-y-2" style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>Bestellt, noch nicht im Keller</p>
            {deliveries.map((d) => {
              const overdue = d.deliveryOn < todayKey;
              return (
                <div key={d.id} style={{ display: "flex", flexWrap: "wrap" as const, alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "8px 12px", borderRadius: 12, background: overdue ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.06)", border: overdue ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent", color: "rgba(255,255,255,0.8)" }}>
                  <span style={{ minWidth: 0 }}>
                    Lieferung {d.deliveryOn.split("-").reverse().join(".")}{overdue ? " (überfällig)" : ""}{d.reference ? ` · ${d.reference}` : ""}: {LAUNDRY_ITEMS.filter((i) => d.quantities[i.key]).map((i) => `${d.quantities[i.key]} ${i.label}`).join(", ")}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button disabled={busy} onClick={() => post({ action: "arrived", id: d.id }, "✓ Lieferung im Keller — zählt jetzt zum Bestand")} style={btn("34,197,94")}>Im Keller angekommen</button>
                    <button disabled={busy} onClick={() => post({ action: "cancelDelivery", id: d.id }, "✓ Lieferung entfernt")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>entfernen</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {recentlyArrived.length > 0 && (
          <div className="space-y-1" style={{ marginBottom: 12 }}>
            {recentlyArrived.map((d) => (
              <p key={d.id} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                ✓ Angekommen {d.arrivedOn.split("-").reverse().join(".")}{d.reference ? ` · ${d.reference}` : ""}: {LAUNDRY_ITEMS.filter((i) => d.quantities[i.key]).map((i) => `${d.quantities[i.key]} ${i.label}`).join(", ")}
              </p>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
          <button onClick={() => open("count")} style={btn("255,255,255")}>Bestand gezählt …</button>
          <button onClick={() => open("delivery")} style={btn("13,148,136")}>Bestellung festhalten …</button>
          <button onClick={() => open("reserve")} style={btn("255,255,255")}>Reserve ändern …</button>
        </div>

        {mode && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 10 }}>
              {mode === "count" && "Saubere Wäsche im Keller (beide Wohnungen zusammen). Die Zählung gilt am Ende des Tages."}
              {mode === "delivery" && "Bestellung bei der Wäscherei — zählt zum Bestand, sobald sie als „Im Keller angekommen“ bestätigt ist. Vorbelegt mit der Bestellmenge."}
              {mode === "reserve" && "So viele Teile sollen nach allen Anreisen immer noch im Keller liegen."}
            </p>
            {mode !== "reserve" && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 10 }}>
                {mode === "count" ? "Gezählt am" : "Liefertag"}
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="form-input" style={{ width: 170 }} />
              </label>
            )}
            {mode === "delivery" && (
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bestellnummer (optional)" className="form-input" style={{ marginBottom: 10 }} />
            )}
            <QtyInputs value={q} onChange={setQ} />
            {err && <div style={{ fontSize: 13, color: "#fca5a5", marginTop: 8 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button disabled={busy} onClick={save} style={btn("34,197,94")}>{busy ? "Speichere …" : "Speichern"}</button>
              <button onClick={() => setMode(null)} style={btn("255,255,255")}>Abbrechen</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function emptyQ(): Q {
  return { beds: 0, sheets90: 0, sheets200: 0, towels: 0, kitchen: 0, handTowels: 0, pillowCases: 0, duvetCovers: 0, bathMats: 0, washcloths: 0 };
}
