import { NextRequest, NextResponse } from "next/server";
import { getAttachment } from "@/lib/mailbox";
import { mailSession, unauthorized, mailError, parseUid } from "@/lib/mailbox/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { uid: string; index: string } }) {
  if (!(await mailSession())) return unauthorized();
  const uid = parseUid(params.uid);
  const index = Number(params.index);
  if (!uid || !Number.isInteger(index) || index < 0) return NextResponse.json({ error: "Ungültiger Anhang" }, { status: 400 });
  try {
    const a = await getAttachment(req.nextUrl.searchParams.get("folder") || "INBOX", uid, index);
    // Immer als Download — nie im Kontext der App darstellen (HTML/SVG aus fremden Mails)
    return new NextResponse(new Uint8Array(a.content), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return mailError(err);
  }
}
