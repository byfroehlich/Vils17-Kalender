/**
 * Kleine Markierung für Aufträge mit Sondersatz (z.B. „70 €“ im Penthouse).
 * Überall gleich, damit man 70-€-Buchungen auf einen Blick erkennt.
 */
export function RateBadge({
  rate,
  title,
  inactive = false,
}: {
  rate: number;
  title?: string;
  /** Sondersatz-Buchung, aber eine Vertretung reinigt → gilt hier nicht */
  inactive?: boolean;
}) {
  return (
    <span
      title={title ?? `${rate.toFixed(0)} € pro Reinigung`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 10,
        fontWeight: 800,
        lineHeight: 1,
        padding: "3px 7px",
        borderRadius: 20,
        background: "rgba(245,158,11,0.18)",
        border: "1px solid rgba(245,158,11,0.45)",
        color: "#fcd34d",
        whiteSpace: "nowrap",
        flexShrink: 0,
        letterSpacing: "0.01em",
        opacity: inactive ? 0.5 : 1,
        textDecoration: inactive ? "line-through" : "none",
      }}
    >
      {rate.toFixed(0)} €
    </span>
  );
}
