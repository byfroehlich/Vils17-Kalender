import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface DeclinedAssignment {
  id: string;
  cleanerUnavailableNote?: string | null;
  cleaner?: { name: string } | null;
  booking: {
    id: string;
    checkOut: Date;
    apartment: { name: string };
  };
}

export function AbsagenBanner({ assignments }: { assignments: DeclinedAssignment[] }) {
  if (assignments.length === 0) return null;

  return (
    <div style={{
      background: "rgba(239,68,68,0.12)",
      border: "1px solid rgba(239,68,68,0.35)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderRadius: 16,
      padding: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <AlertTriangle style={{ width: 20, height: 20, color: "#f87171", flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#f87171" }}>
            {assignments.length === 1 ? "1 Reinigung abgesagt" : `${assignments.length} Reinigungen abgesagt`}
          </p>
          <p style={{ fontSize: 12, color: "rgba(253,162,162,0.65)", marginTop: 1 }}>
            Ersatz muss organisiert werden
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {assignments.map((a) => (
          <Link key={a.id} href={`/bookings/${a.booking.id}`} style={{ textDecoration: "none" }}>
            <div style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(239,68,68,0.20)",
              borderRadius: 12,
              padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                  {a.booking.apartment.name} · {formatDate(a.booking.checkOut)}
                </p>
                {a.cleanerUnavailableNote && (
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    „{a.cleanerUnavailableNote}"
                  </p>
                )}
                {a.cleaner && (
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    von {a.cleaner.name}
                  </p>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "rgba(239,68,68,0.2)", color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.3)", flexShrink: 0 }}>
                Absage
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
