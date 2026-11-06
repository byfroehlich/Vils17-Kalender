import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { loadWebsiteStats, STATS_PERIODS } from "@/lib/website-stats";
import { WebsiteStatsView } from "@/components/website/WebsiteStatsView";

// Website-Besuchermessung vils17.at — nur ADMIN und MANAGER (Verwaltung)
export const dynamic = "force-dynamic";

export default async function WebsitePage({ searchParams }: { searchParams?: { tage?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") redirect("/my-jobs");

  const requested = Number(searchParams?.tage);
  const tage = (STATS_PERIODS as readonly number[]).includes(requested) ? requested : 30;
  const stats = await loadWebsiteStats(session.user.organizationId, tage);

  return <WebsiteStatsView stats={stats} />;
}
