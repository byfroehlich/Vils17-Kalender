import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WashingMachine } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { loadLaundryProposal } from "@/lib/laundry-proposal";
import { LAUNDRY_ITEMS, laundryText } from "@/lib/laundry-quantity";
import { BUFFER_PERCENT } from "@/lib/laundry-order";
import { todayVienna, addDays } from "@/lib/mcp/format";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const glass = { background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20 } as const;
const h2 = { fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 12 } as const;

export default async function LaundryPage({ searchParams }: { searchParams: { tage?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");

  const days = Math.min(60, Math.max(1, parseInt(searchParams.tage ?? "14", 10) || 14));
  const start = todayVienna();
  const { rows, proposal: p } = await loadLaundryProposal({ organizationId: session.user.organizationId, start, days });

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", gap: 8 }}>
        <WashingMachine style={{ width: 20, height: 20, color: "#14B8A6" }} /> Wäsche bestellen
      </h1>

      <div style={{ display: "flex", gap: 8 }}>
        {[7, 14, 21, 28].map((t) => (
          <Link key={t} href={`/laundry?tage=${t}`} style={{ padding: "6px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: "none", background: t === days ? "rgba(13,148,136,0.3)" : "rgba(255,255,255,0.06)", border: t === days ? "1px solid rgba(13,148,136,0.5)" : "1px solid rgba(255,255,255,0.12)", color: t === days ? "#14B8A6" : "rgba(255,255,255,0.6)" }}>
            {t} Tage
          </Link>
        ))}
      </div>

      <div style={{ ...glass, padding: "20px 24px" }}>
        <h2 style={h2}>Bestellmenge {formatDate(start)} – {formatDate(addDays(start, days - 1))}</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>
          {p.arrivals} {p.arrivals === 1 ? "Anreise" : "Anreisen"}, {p.guests} Gäste. Inklusive Puffer: +1 Spannbettlaken je Wohnung, sonst +{BUFFER_PERCENT} %.
        </p>
        {p.arrivals === 0 ? (
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>Keine Anreisen — nichts zu bestellen.</p>
        ) : (
          <table style={{ width: "100%", fontSize: 14, color: "rgba(255,255,255,0.85)", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "left" }}>
                <th style={{ padding: "4px 0" }}>Posten</th><th style={{ textAlign: "right" }}>Bedarf</th><th style={{ textAlign: "right" }}>Puffer</th><th style={{ textAlign: "right" }}>Bestellen</th>
              </tr>
            </thead>
            <tbody>
              {LAUNDRY_ITEMS.map((i) => (
                <tr key={i.key} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: "6px 0" }}>{i.emoji} {i.label}</td>
                  <td style={{ textAlign: "right" }}>{p.need[i.key]}</td>
                  <td style={{ textAlign: "right", color: "rgba(255,255,255,0.5)" }}>+{p.buffer[i.key]}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{p.order[i.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rows.length > 0 && (
        <div style={{ ...glass, padding: "20px 24px" }}>
          <h2 style={h2}>Anreisen</h2>
          <div className="space-y-2">
            {rows.map((b) => (
              <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.06)", textDecoration: "none", color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
                <span>{formatDate(b.checkIn)} · {b.apartment.name} · {b.guestName}</span>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>{b.guestCount} P. · {b.cleaningAssignment?.laundryStatus === "ORDERED" ? "bestellt" : b.cleaningAssignment?.laundryStatus === "AVAILABLE" ? "vorhanden" : "offen"}</span>
              </Link>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginTop: 10 }}>Je Wohnung: {p.perApartment.map((a) => `${a.apartmentName}: ${laundryText(a.need)}`).join(" · ")}</p>
        </div>
      )}
    </div>
  );
}
