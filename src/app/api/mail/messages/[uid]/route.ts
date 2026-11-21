import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMessage, updateMessage, deleteFromTrash, summarizeMessages, trashFolder } from "@/lib/mailbox";
import { logAudit } from "@/lib/audit";
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

// Endgültig löschen — nur aus dem Papierkorb (Entscheidung Mathias 21.11.2026). deleteFromTrash
// wirkt ausschließlich im Papierkorb-Ordner; eine uid aus einem anderen Ordner trifft dort nichts.
export async function DELETE(_req: NextRequest, { params }: { params: { uid: string } }) {
  const session = await mailSession();
  if (!session) return unauthorized();
  const uid = parseUid(params.uid);
  if (!uid) return NextResponse.json({ error: "Ungültige Mail" }, { status: 400 });
  try {
    // Nur löschen, was wirklich im Papierkorb liegt (UIDs gelten je Ordner)
    const da = await summarizeMessages(await trashFolder(), [uid]);
    if (da.length === 0) return NextResponse.json({ error: "Mail nicht im Papierkorb" }, { status: 404 });
    const r = await deleteFromTrash([uid]);
    await logAudit({
      organizationId: session.user.organizationId, userId: session.user.id,
      action: "mail.deleted", entityType: "Mail", details: { via: "app", anzahl: r.count },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return mailError(err);
  }
}
