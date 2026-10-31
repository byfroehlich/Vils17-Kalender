import Link from "next/link";
import type { WeekDay } from "@/lib/todo";
import { NoteBadge } from "@/components/ui/NoteBadge";

// „Diese Woche“: Abreisen, Anreisen und Reinigungen (mit Reinigungskraft und ⭐ Hinweis)

const glass = { background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20 } as const;

export function WeekCard({ days }: { days: WeekDay[] }) {
  const withEntries = days.filter((d) => d.entries.length > 0);
  return (
    <div style={{ ...glass, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>Diese Woche</h2>
        <Link href="/bookings" style={{ fontSize: 12, fontWeight: 600, color: "#5EEAD4", textDecoration: "none" }}>Alle Buchungen →</Link>
      </div>
      {withEntries.length === 0 && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>Keine An- oder Abreisen in den nächsten 7 Tagen.</p>}
      {withEntries.map((d) => (
        <div key={d.day} style={{ marginTop: 10 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.55)", marginBottom: 4 }}>{d.label}</p>
          {d.entries.map((e) => {
            const cleaning = e.type === "anreise"
              ? e.selfClean ? "Selbstreinigung"
                : e.cleaner ? `${e.cleaningStatus === "COMPLETED" ? "✓ " : ""}${e.cleaner}`
                : "ohne Reinigungskraft"
              : null;
            return (
              <Link key={`${e.type}-${e.bookingId}`} href={`/bookings/${e.bookingId}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", textDecoration: "none", fontSize: 13, color: "rgba(255,255,255,0.85)", minHeight: 36 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: e.apartmentColor ?? "#14B8A6", flexShrink: 0 }} />
                <span style={{ width: 58, flexShrink: 0, fontSize: 12, color: e.type === "anreise" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.50)" }}>{e.type === "anreise" ? "Anreise" : "Abreise"}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.apartmentName} · {e.guestName}{e.type === "anreise" ? ` · ${e.guestCount} G.` : ""}
                </span>
                {e.hasNote && <NoteBadge />}
                {cleaning && (
                  <span style={{ fontSize: 12, flexShrink: 0, color: !e.cleaner && !e.selfClean ? "#fca5a5" : "rgba(255,255,255,0.60)" }}>{cleaning}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
