import { NextRequest, NextResponse } from "next/server";
import { listMessages } from "@/lib/mailbox";
import { mailSession, unauthorized, mailError } from "@/lib/mailbox/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await mailSession())) return unauthorized();
  const p = req.nextUrl.searchParams;
  try {
    const r = await listMessages({
      folder: p.get("folder") || "INBOX",
      page: Number(p.get("page") ?? 1) || 1,
      pageSize: 30,
      query: p.get("q")?.slice(0, 200) || undefined,
      unseenOnly: p.get("unseen") === "1",
    });
    return NextResponse.json(r);
  } catch (err) {
    return mailError(err);
  }
}
