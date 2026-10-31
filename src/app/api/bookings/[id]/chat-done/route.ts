import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { markChatDone, ChatDoneError } from "@/lib/guest-chat-overview";

const schema = z.object({ messageId: z.string().trim().min(1).max(100) }).strict();

/** Gästechat als erledigt markieren („keine Antwort nötig“) — Admin/Verwaltung. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role)) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  try {
    const r = await markChatDone({ organizationId: session.user.organizationId, bookingId: params.id, messageId: parsed.data.messageId, actor: { userId: session.user.id } });
    return NextResponse.json({ success: true, ...r });
  } catch (err) {
    if (err instanceof ChatDoneError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
