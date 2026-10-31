import { previousDepartureText, type PreviousDeparture } from "@/lib/departure-format";

// „Vorgäste reisen ab: Mo 02.11. (gleicher Tag)“ — dezent, an jedem Reinigungsauftrag
// (Entscheidung Mathias 31.10.2026). Hilft zu planen: gleicher Tag oder schon am Vortag.
export function PreviousDepartureLine({ value, compact = false }: { value: PreviousDeparture | null | undefined; compact?: boolean }) {
  if (value === undefined) return null;
  const sameDay = !!value && value.daysBefore <= 0;
  return (
    <p style={{ fontSize: compact ? 11 : 12, color: sameDay ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.50)", marginTop: compact ? 3 : 6, display: "flex", alignItems: "center", gap: 5 }}>
      <span aria-hidden style={{ display: "inline-block", width: 12, height: 7, borderRadius: 9999, border: "1.5px dashed rgba(255,255,255,0.45)", flexShrink: 0 }} />
      {value ? <>Vorgäste reisen ab: {previousDepartureText(value)}</> : <>Keine Vorgäste davor – Wohnung frei</>}
    </p>
  );
}
