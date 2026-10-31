import Link from "next/link";

// Wäsche-Hinweis auf dem Dashboard — nach Bestand im Keller, nicht pro Buchung
// (Entscheidung Mathias 31.10.2026). Nur sichtbar, wenn etwas zu tun ist.

export interface LaundryStockHintProps {
  /** "Wäsche reicht nicht ab Sa 07.11." o.ä. */
  headline: string;
  /** "fehlt: 2 große Handtücher, …" */
  detail: string;
  urgent: boolean;
}

export function LaundryStockHint({ headline, detail, urgent }: LaundryStockHintProps) {
  const c = urgent ? { bg: "rgba(239,68,68,0.14)", border: "rgba(239,68,68,0.4)", title: "#FCA5A5" } : { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", title: "#FCD34D" };
  return (
    <Link href="/laundry" style={{ display: "block", textDecoration: "none" }}>
      <div style={{ background: c.bg, border: `1px solid ${c.border}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 16, padding: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>🧺</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: c.title }}>{headline}</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{detail}</p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#14B8A6", flexShrink: 0 }}>Bestellen →</span>
      </div>
    </Link>
  );
}
