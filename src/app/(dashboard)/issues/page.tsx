import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listIssues } from "@/lib/issues";
import { IssueBoard } from "@/components/issues/IssueBoard";

export const dynamic = "force-dynamic";

export default async function IssuesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");
  const organizationId = session.user.organizationId;
  const [open, done, apartments] = await Promise.all([
    listIssues(organizationId, { open: true }),
    listIssues(organizationId, { open: false, limit: 30 }),
    prisma.apartment.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const ser = (xs: typeof open) => xs.map((x) => ({ ...x, createdAt: x.createdAt.toISOString(), doneAt: x.doneAt?.toISOString() ?? null }));
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", gap: 8 }}>
        <Wrench style={{ width: 20, height: 20, color: "#14B8A6" }} /> Mängel &amp; Einkauf
      </h1>
      <IssueBoard open={ser(open)} done={ser(done)} apartments={apartments} />
    </div>
  );
}
