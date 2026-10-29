import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { McpTokenManager } from "@/components/settings/McpTokenManager";
import { SCOPES, SCOPE_LABELS } from "@/lib/mcp/tokens";

export default async function SchnittstellePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const tokens = await prisma.mcpToken.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/settings" style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>← Einstellungen</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em", marginTop: 6 }}>
          Claude-Schnittstelle
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
          Zugangstoken, mit denen Claude Buchungen, Reinigung und Umsätze direkt abfragen kann.
        </p>
      </div>
      <McpTokenManager
        initialTokens={tokens.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          revokedAt: t.revokedAt?.toISOString() ?? null,
        }))}
        scopes={SCOPES.map((s) => ({ id: s, label: SCOPE_LABELS[s] }))}
      />
    </div>
  );
}
