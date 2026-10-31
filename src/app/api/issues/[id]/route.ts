import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { setIssueDone, IssueError } from "@/lib/issues";

const schema = z.object({ done: z.boolean(), note: z.string().trim().max(500).optional() }).strict();

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role)) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  try {
    await setIssueDone({ organizationId: session.user.organizationId, id: params.id, done: parsed.data.done, note: parsed.data.note ?? null, actor: { userId: session.user.id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof IssueError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
