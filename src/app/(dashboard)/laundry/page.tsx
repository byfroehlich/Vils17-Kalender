import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WashingMachine } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { loadLaundryPlan } from "@/lib/laundry-proposal";
import { normalizeQuantity } from "@/lib/laundry-order";
import { laundryText, LAUNDRY_ITEMS } from "@/lib/laundry-quantity";
import { todayVienna, addDays, day } from "@/lib/mcp/format";
import { LaundryPlanner } from "@/components/laundry/LaundryPlanner";

export const dynamic = "force-dynamic";

const glass = { background: "rgba(255,255,255,0.055)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "0.5px solid rgba(255,255,255,0.14)", borderRadius: 20 } as const;
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
        {laundryText(p.order) ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginTop: 4 }}>Bestellen:</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px", marginTop: 6, fontSize: 15 }}>
              {LAUNDRY_ITEMS.filter((i) => p.order[i.key] > 0).map((i) => (
                <div key={i.key} style={{ display: "contents" }}>
                  <span style={{ color: "rgba(255,255,255,0.85)" }}>{i.emoji} {i.label}</span>
                  <strong style={{ color: "#5eead4", textAlign: "right" }}>{p.order[i.key]}</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginTop: 4 }}>Nichts zu bestellen — Bestand reicht inklusive Reserve</div>
        )}
        {/* Bis wann reicht der Bestand? (Dashboard „Zu erledigen“ → hierher, Entscheidung Mathias 31.10.2026) */}
        {p.stockToday && (
          <div style={{ fontSize: 13, marginTop: 10, color: p.firstShortage ? "#fca5a5" : "rgba(255,255,255,0.65)" }}>
            {p.firstShortage
              ? <>Bestand reicht bis {de(addDays(p.firstShortage.day, -1))} — ab {de(p.firstShortage.day)} zu knapp (unter der Reserve): {p.firstShortage.items.map((k) => LAUNDRY_ITEMS.find((i) => i.key === k)?.label ?? k).join(", ")} ({p.firstShortage.arrivals.map((a) => `${a.apartmentName.split(/\s+No\.|\s+-\s+/)[0]}, ${a.guestCount} Gäste`).join("; ")})</>
              : <>Bestand reicht für alle Anreisen bis {de(addDays(r.end, -1))}{laundryText(p.order) ? " — mit der Bestellung bleibt die Reserve im Keller" : ""}.</>}
          </div>
        )}
        {!p.stockToday && <div style={{ fontSize: 13, marginTop: 10, color: "rgba(255,255,255,0.6)" }}>Noch kein Bestand im Keller erfasst — unten zählen, dann sagt die App, bis wann er reicht.</div>}
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
