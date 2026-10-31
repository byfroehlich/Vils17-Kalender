// Roter Hinweis „Gästezahl ?“ an Buchungskarten/-zeilen (Entscheidung Mathias 31.10.2026)
export function GuestCountUnknownBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      title="Gästezahl unbekannt — das Portal hat keine geliefert. Bitte klären."
      style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 20, background: "rgba(239,68,68,0.22)", border: "1px solid rgba(239,68,68,0.45)", color: "#FCA5A5", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}
    >
      {compact ? "Gäste ?" : "⚠ Gästezahl unbekannt"}
    </span>
  );
}
