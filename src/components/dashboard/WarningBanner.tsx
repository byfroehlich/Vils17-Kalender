import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface ProblemBooking {
  id: string;
  guestName: string;
  checkIn: Date;
  apartment: { name: string };
  cleaningUnassigned: boolean;
  laundryOpen: boolean;
}

export function WarningBanner({ bookings }: { bookings: ProblemBooking[] }) {
  if (bookings.length === 0) return null;

  return (
    <div style={{
      background: "rgba(245,158,11,0.12)",
      border: "1px solid rgba(245,158,11,0.35)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderRadius: 16,
      padding: 16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#FCD34D" }}>
            {bookings.length === 1 ? "1 Buchung braucht Aufmerksamkeit" : `${bookings.length} Buchungen brauchen Aufmerksamkeit`}
          </p>
          <p style={{ fontSize: 12, color: "rgba(253,211,77,0.65)", marginTop: 1 }}>
            Reinigung oder Wäsche nicht organisiert
          </p>
        </div>
      </div>

      {/* Buchungszeilen */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {bookings.map((b) => (
          <Link key={b.id} href={`/bookings/${b.id}`} style={{ textDecoration: "none" }}>
            <div style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: 12,
              padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.guestName}
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  {b.apartment.name} · {formatDate(b.checkIn)}
                </p>
              </div>
              <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                {b.cleaningUnassigned && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "rgba(239,68,68,0.2)", color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.3)" }}>
                    Reinigung
                  </span>
                )}
                {b.laundryOpen && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "rgba(245,158,11,0.2)", color: "#FCD34D", border: "1px solid rgba(245,158,11,0.3)" }}>
                    Wäsche
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
