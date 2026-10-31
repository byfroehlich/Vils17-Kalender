import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPushLog } from "@/lib/push";
import { PushTestButton } from "@/components/settings/PushTestButton";

// Push-Versandprotokoll (Entscheidung Mathias 01.11.2026): wer welche Benachrichtigung bekommen hat und ob
// der Push-Dienst sie angenommen hat. Angezeigt werden kann sie nur, wenn die App installiert und die Glocke an ist.

const fmt = (d: Date) =>
  d.toLocaleString("de-AT", { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function PushProtokollPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  const orgId = session.user.organizationId;

  const [users, log] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId, active: true },
      select: { id: true, name: true, role: true, _count: { select: { pushSubscriptions: true } } },
      orderBy: { name: "asc" },
    }),
    listPushLog(orgId, { limit: 100 }),
  ]);

  const card = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: "14px 18px" } as const;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/settings" style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>← Einstellungen</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em", marginTop: 6 }}>Push-Benachrichtigungen</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
          „Angenommen“ heißt: Apple bzw. Google hat die Nachricht zur Zustellung übernommen. Ob sie auf dem Handy angezeigt wurde, meldet kein Dienst zurück.
        </p>
      </div>

      <div style={card}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>Angemeldete Geräte</p>
        {users.map((u) => (
          <div key={u.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", color: "rgba(255,255,255,0.8)" }}>
            <span>{u.name}</span>
            <span style={{ color: u._count.pushSubscriptions ? "#5eead4" : "#fca5a5" }}>
              {u._count.pushSubscriptions ? `${u._count.pushSubscriptions} Gerät${u._count.pushSubscriptions > 1 ? "e" : ""}` : "kein Gerät – bekommt nichts"}
              {u._count.pushSubscriptions > 0 && <PushTestButton userId={u.id} />}
            </span>
          </div>
        ))}
      </div>

      <div style={card}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>Versandprotokoll (seit 01.11.2026)</p>
        {log.length === 0 && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Noch nichts versendet.</p>}
        {log.map((r) => {
          const ok = r.sent > 0 && r.failed === 0;
          return (
            <div key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px 0", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "rgba(255,255,255,0.85)" }}>
                <span><strong>{r.userName}</strong> · {r.title}</span>
                <span style={{ flexShrink: 0, color: ok ? "#5eead4" : "#fca5a5" }}>{ok ? "✓ angenommen" : "✗ nicht zugestellt"}</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                {fmt(r.createdAt)} · {r.sent}/{r.devices} Gerät(e){r.error ? ` · ${r.error}` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
