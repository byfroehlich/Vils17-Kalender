import { NextResponse } from "next/server";
import { listFolders, isMailboxConfigured } from "@/lib/mailbox";
import { mailSession, unauthorized, mailError } from "@/lib/mailbox/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await mailSession())) return unauthorized();
  if (!isMailboxConfigured()) return NextResponse.json({ configured: false, folders: [] });
  try {
    return NextResponse.json({ configured: true, folders: await listFolders() });
  } catch (err) {
    return mailError(err);
  }
}
