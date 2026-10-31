import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WashingMachine } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { loadLaundryPlan } from "@/lib/laundry-proposal";
import { normalizeQuantity } from "@/lib/laundry-order";
import { laundryText } from "@/lib/laundry-quantity";
import { todayVienna, addDays, day } from "@/lib/mcp/format";
import { LaundryPlanner } from "@/components/laundry/LaundryPlanner";

export const dynamic = "force-dynamic";

const glass = { background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20 } as const;
const de = (d: Date) => day(d).split("-").reverse().join(".");

export default async function LaundryPage({ searchParams }: { searchParams: { tage?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");

  const days = Math.min(60, Math.max(1, parseInt(searchParams.tage ?? "14", 10) || 14));
  const today = todayVienna();
  const r = await loadLaundryPlan({ organizationId: session.user.organizationId, today, days });
  const p = r.plan;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", gap: 8 }}>
        <WashingMachine style={{ width: 20, height: 20, color: "#14B8A6" }} /> Wäsche
      </h1>

      <div style={{ display: "flex", gap: 8 }}>
        {[7, 14, 21, 28].map((t) => (
          <Link key={t} href={`/laundry?tage=${t}`} style={{ padding: "6px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: "none", background: t === days ? "rgba(13,148,136,0.3)" : "rgba(255,255,255,0.06)", border: t === days ? "1px solid rgba(13,148,136,0.5)" : "1px solid rgba(255,255,255,0.12)", color: t === days ? "#14B8A6" : "rgba(255,255,255,0.6)" }}>
            {t} Tage
          </Link>
        ))}
      </div>

      <div style={{ ...glass, padding: "20px 24px" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Bestellen für {de(today)} – {de(addDays(r.end, -1))} · {p.arrivals} Anreisen, {p.guests} Gäste</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginTop: 4 }}>
          {laundryText(p.order) || "Nichts zu bestellen — Bestand reicht inklusive Reserve"}
        </div>
      </div>

      <LaundryPlanner
        todayKey={day(today)}
        plan={p}
        lastCount={r.count ? { countedOn: day(r.count.countedOn), quantities: normalizeQuantity(r.count.quantities) } : null}
        deliveries={r.deliveries.map((d) => ({ id: d.id, deliveryOn: day(d.deliveryOn), quantities: normalizeQuantity(d.quantities), reference: d.reference }))}
        recentlyArrived={r.recentlyArrived.map((d) => ({ id: d.id, arrivedOn: day(todayVienna(d.arrivedAt!)), quantities: normalizeQuantity(d.quantities), reference: d.reference }))}
      />

      {r.arrivalsInWindow.length > 0 && (
        <div style={{ ...glass, padding: "20px 24px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 12 }}>Anreisen</h2>
          <div className="space-y-2">
            {r.arrivalsInWindow.map((b) => (
              <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.06)", textDecoration: "none", color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
                <span>{de(b.checkIn)} · {b.apartment.name} · {b.guestName}</span>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>{b.guestCount} P.</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
