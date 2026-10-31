import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMessage, updateMessage } from "@/lib/mailbox";
import { mailSession, unauthorized, mailError, parseUid } from "@/lib/mailbox/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { uid: string } }) {
  if (!(await mailSession())) return unauthorized();
  const uid = parseUid(params.uid);
  if (!uid) return NextResponse.json({ error: "Ungültige Mail" }, { status: 400 });
  try {
    // Öffnen in der App = gelesen (wie in jedem Mailprogramm)
    return NextResponse.json(await getMessage(req.nextUrl.searchParams.get("folder") || "INBOX", uid, { markSeen: true }));
  } catch (err) {
    return mailError(err);
  }
}

const patchSchema = z.object({
  folder: z.string().min(1).max(200),
  seen: z.boolean().optional(),
  flagged: z.boolean().optional(),
  move: z.enum(["trash", "inbox", "archive"]).optional(),
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: { uid: string } }) {
  if (!(await mailSession())) return unauthorized();
  const uid = parseUid(params.uid);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!uid || !parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  const { folder, ...change } = parsed.data;
  try {
    return NextResponse.json({ success: true, ...(await updateMessage(folder, uid, change)) });
  } catch (err) {
    return mailError(err);
  }
}
