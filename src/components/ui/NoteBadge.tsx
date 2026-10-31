// Kleine, einheitliche Markierung „⭐ Hinweis“ für Reinigungsaufträge mit Hinweis
// (CleaningAssignment.notes, z.B. Kinderbett). Entscheidung Mathias 31.10.2026.
export function NoteBadge({ title }: { title?: string | null }) {
  return (
    <span
      title={title ?? "Hinweis für die Reinigung"}
      style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "1px 7px", borderRadius: 20, background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.40)", color: "#FCD34D", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.5 }}
    >
      ⭐ Hinweis
    </span>
  );
}
