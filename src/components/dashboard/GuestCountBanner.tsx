import Link from "next/link";
import { formatDate } from "@/lib/utils";

// Gästezahl unbekannt — groß und rot, bis sie geklärt ist (Entscheidung Mathias 31.10.2026).
// Klären: Gästezahl in der Buchung eintragen, MCP gaestezahl_korrigieren oder Portal-Mail-Import.

interface UnconfirmedBooking {
  id: string;
  guestName: string;
  checkIn: Date;
  channelName: string | null;
  guestCount: number;
  apartment: { name: string };
}

export function GuestCountBanner({ bookings }: { bookings: UnconfirmedBooking[] }) {
  if (bookings.length === 0) return null;
  return (
    <div style={{ background: "rgba(239,68,68,0.16)", border: "1px solid rgba(239,68,68,0.5)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 16, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>👥</span>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#FCA5A5" }}>
            Gästezahl unbekannt — {bookings.length === 1 ? "1 Buchung" : `${bookings.length} Buchungen`}
          </p>
          <p style={{ fontSize: 12, color: "rgba(252,165,165,0.75)", marginTop: 1 }}>
            Das Portal hat keine Gästezahl geliefert. Bitte im Portal nachsehen und in der Buchung eintragen.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {bookings.map((b) => (
          <Link key={b.id} href={`/bookings/${b.id}`} style={{ textDecoration: "none" }}>
            <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.guestName}</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  {b.apartment.name} · {formatDate(b.checkIn)}{b.channelName ? ` · ${b.channelName}` : ""}
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#FCA5A5", flexShrink: 0 }}>Eintragen →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
