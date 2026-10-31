"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShoppingCart, Check, RotateCcw, Plus, Image as ImageIcon } from "lucide-react";

type Issue = {
  id: string; kind: "DAMAGE" | "SUPPLY"; text: string; apartment: string; createdAt: string; reportedBy: string | null;
  hasPhoto: boolean; done: boolean; doneAt: string | null; doneNote: string | null;
  previous: { id: string; guest: string; checkIn: string; checkOut: string; channel: string } | null;
  claimDeadline: string | null;
};

const glass = { background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20 } as const;
const h2 = { fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 12 } as const;
const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 10, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" } as const;
const muted = "rgba(255,255,255,0.55)";
const de = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

function Row({ i, onToggle }: { i: Issue; onToggle: (i: Issue) => void }) {
  const overdue = i.claimDeadline && i.claimDeadline < new Date().toISOString().slice(0, 10);
  return (
    <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {i.kind === "DAMAGE" ? <AlertTriangle style={{ width: 16, height: 16, color: "#fbbf24", flexShrink: 0, marginTop: 2 }} /> : <ShoppingCart style={{ width: 16, height: 16, color: "#5eead4", flexShrink: 0, marginTop: 2 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: muted }}>{i.apartment} · {de(i.createdAt)}{i.reportedBy ? ` · ${i.reportedBy}` : ""}</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.92)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{i.text}</div>
          {i.previous && i.kind === "DAMAGE" && (
            <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>
              Aufenthalt davor: <Link href={`/bookings/${i.previous.id}`} style={{ color: "#5eead4" }}>{i.previous.guest}</Link> ({de(i.previous.checkIn)}–{de(i.previous.checkOut)}, {i.previous.channel})
              {i.claimDeadline && <span style={{ color: overdue ? "#fca5a5" : "#fcd34d" }}> · Airbnb: Gast anschreiben bis {de(i.claimDeadline)}</span>}
            </div>
          )}
          {i.done && <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>Erledigt {i.doneAt ? de(i.doneAt) : ""}{i.doneNote ? ` – ${i.doneNote}` : ""}</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {i.hasPhoto && <a href={`/api/issues/${i.id}/photo`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none" }}><ImageIcon style={{ width: 14, height: 14 }} /> Foto</a>}
            <button style={btn} onClick={() => onToggle(i)}>{i.done ? <><RotateCcw style={{ width: 14, height: 14 }} /> Wieder offen</> : <><Check style={{ width: 14, height: 14 }} /> Erledigt</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IssueBoard({ open, done, apartments }: { open: Issue[]; done: Issue[]; apartments: { id: string; name: string }[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"DAMAGE" | "SUPPLY">("DAMAGE");
  const [apt, setApt] = useState(apartments[0]?.id ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = async (i: Issue) => {
    await fetch(`/api/issues/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !i.done }) });
    router.refresh();
  };
  const add = async () => {
    setError(null);
    const r = await fetch("/api/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apartmentId: apt, kind, text }) });
    if (!r.ok) { setError("Speichern fehlgeschlagen"); return; }
    setText(""); setAdding(false); router.refresh();
  };
  const damages = open.filter((i) => i.kind === "DAMAGE");
  const supplies = open.filter((i) => i.kind === "SUPPLY");

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={{ ...btn, background: "#0D9488", borderColor: "#0D9488" }} onClick={() => setAdding(!adding)}><Plus style={{ width: 15, height: 15 }} /> Eintragen</button>
      </div>
      {adding && (
        <div style={{ ...glass, padding: 16 }} className="space-y-2">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={kind} onChange={(e) => setKind(e.target.value as "DAMAGE" | "SUPPLY")} className="form-input" style={{ flex: 1 }}>
              <option value="DAMAGE">Schaden / Mangel</option>
              <option value="SUPPLY">Nachkaufen</option>
            </select>
            <select value={apt} onChange={(e) => setApt(e.target.value)} className="form-input" style={{ flex: 1 }}>
              {apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="form-input" placeholder="Was?" style={{ resize: "none" }} />
          {error && <p style={{ color: "#fecaca", fontSize: 13 }}>{error}</p>}
          <button style={{ ...btn, background: "#0D9488", borderColor: "#0D9488" }} disabled={!text.trim() || !apt} onClick={add}>Speichern</button>
        </div>
      )}
      <div style={{ ...glass, padding: "18px 20px" }}>
        <h2 style={h2}>Schäden &amp; Mängel ({damages.length})</h2>
        {damages.length === 0 && <p style={{ fontSize: 13, color: muted }}>Nichts offen.</p>}
        <div className="space-y-2">{damages.map((i) => <Row key={i.id} i={i} onToggle={toggle} />)}</div>
      </div>
      <div style={{ ...glass, padding: "18px 20px" }}>
        <h2 style={h2}>Nachkaufen ({supplies.length})</h2>
        {supplies.length === 0 && <p style={{ fontSize: 13, color: muted }}>Nichts offen.</p>}
        <div className="space-y-2">{supplies.map((i) => <Row key={i.id} i={i} onToggle={toggle} />)}</div>
      </div>
      {done.length > 0 && (
        <div style={{ ...glass, padding: "18px 20px" }}>
          <h2 style={h2}>Zuletzt erledigt</h2>
          <div className="space-y-2">{done.map((i) => <Row key={i.id} i={i} onToggle={toggle} />)}</div>
        </div>
      )}
    </>
  );
}
