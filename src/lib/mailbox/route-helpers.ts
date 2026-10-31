import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth";
import { MailboxError } from ".";

/** Postfach nur für ADMIN und MANAGER */
export async function mailSession() {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role)) return null;
  return session;
}

export const unauthorized = () => NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

/** MailboxError → verständliche Meldung, alles andere → 500 ohne Details */
export function mailError(err: unknown) {
  if (err instanceof MailboxError) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error("[mail]", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Postfach-Fehler" }, { status: 500 });
}

export function parseUid(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
