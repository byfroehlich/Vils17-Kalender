import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createIssue, IssueError } from "@/lib/issues";

const schema = z.object({
  apartmentId: z.string().min(1),
  kind: z.enum(["DAMAGE", "SUPPLY"]),
  text: z.string().trim().min(1).max(1000),
  photo: z.string().max(5_000_000).optional(),
}).strict();

/** Mangel / Einkauf von Hand erfassen (Admin, Verwaltung) */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role)) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  try {
    const issue = await createIssue({ organizationId: session.user.organizationId, ...parsed.data, actor: { userId: session.user.id, name: session.user.name } });
    return NextResponse.json({ success: true, id: issue.id });
  } catch (e) {
    if (e instanceof IssueError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
