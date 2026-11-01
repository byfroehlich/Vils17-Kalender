import Link from "next/link";
import { ChevronRight, Camera } from "lucide-react";
import type { TodoItem, TodoSeverity } from "@/lib/todo";

// „Zu erledigen“ — eine Karte, eine Zeile je Punkt, nach Dringlichkeit (Entscheidung Mathias 31.10.2026)

const glass = { background: "rgba(255,255,255,0.055)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "0.5px solid rgba(255,255,255,0.14)", borderRadius: 20 } as const;

const DOT: Record<TodoSeverity, string> = { red: "#f87171", amber: "#fbbf24", neutral: "rgba(255,255,255,0.35)" };
const TEXT: Record<TodoSeverity, string> = { red: "#fecaca", amber: "#fde68a", neutral: "rgba(255,255,255,0.80)" };

export function TodoCard({ items, chatsUnchecked = false }: { items: TodoItem[]; chatsUnchecked?: boolean }) {
  const urgent = items.filter((i) => i.severity === "red").length;
  return (
    <div style={{ ...glass, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: items.length ? 8 : 0 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>Zu erledigen</h2>
        {items.length > 0 && (
          <span style={{ fontSize: 12, color: urgent ? "#fca5a5" : "rgba(255,255,255,0.55)", fontWeight: 600 }}>
            {items.length}{urgent ? ` · ${urgent} dringend` : ""}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p style={{ fontSize: 15, fontWeight: 600, color: "#86efac", marginTop: 6 }}>✓ Alles erledigt</p>
      ) : (
        <div>
          {items.map((i, idx) => (
            <Link
              key={i.key}
              href={i.href}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderTop: idx ? "1px solid rgba(255,255,255,0.08)" : "none", textDecoration: "none", minHeight: 44 }}
            >
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: DOT[i.severity], flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: TEXT[i.severity], fontWeight: i.severity === "neutral" ? 500 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {i.label}
              </span>
              {i.photo && <Camera aria-label="mit Foto" style={{ width: 15, height: 15, color: "rgba(255,255,255,0.55)", flexShrink: 0 }} />}
              <ChevronRight style={{ width: 16, height: 16, color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}
      {chatsUnchecked && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
          Gästechats konnten gerade nicht geprüft werden — <Link href="/messages" style={{ color: "rgba(255,255,255,0.65)", textDecoration: "underline" }}>Gäste öffnen</Link>
        </p>
      )}
    </div>
  );
}

export function TodoCardSkeleton() {
  return (
    <div style={{ ...glass, padding: "16px 18px" }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>Zu erledigen</h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", marginTop: 8 }}>Wird geprüft …</p>
    </div>
  );
}
