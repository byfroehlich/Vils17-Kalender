import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { McpTokenManager } from "@/components/settings/McpTokenManager";
import { SCOPES, SCOPE_LABELS } from "@/lib/mcp/tokens";
import { listConnections } from "@/lib/oauth/flow";

export default async function SchnittstellePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  // OAuth-Zugriffstoken (stündlich neu) erscheinen gebündelt als Verbindung, nicht hier
  const tokens = await prisma.mcpToken.findMany({
    where: { organizationId: session.user.organizationId, oauthFamilyId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });

  const connections = await listConnections(session.user.organizationId);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/settings" style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>← Einstellungen</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em", marginTop: 6 }}>
          Claude-Schnittstelle
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
          Verbindungen und Zugangstoken, mit denen Claude Buchungen, Reinigung und Umsätze direkt abfragen kann.
        </p>
      </div>
      <McpTokenManager
        initialTokens={tokens.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          revokedAt: t.revokedAt?.toISOString() ?? null,
        }))}
        connections={connections}
        scopes={SCOPES.map((s) => ({ id: s, label: SCOPE_LABELS[s] }))}
      />
    </div>
  );
}
