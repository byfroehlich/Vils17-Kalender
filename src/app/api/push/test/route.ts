import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendPushToUsers } from "@/lib/push";

/**
 * Testnachricht an alle Geräte des angemeldeten Nutzers.
 * Antwortet mit dem Ergebnis, damit die App klar sagen kann, woran es hängt.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const result = await sendPushToUsers([session.user.id], {
    title: "Test erfolgreich ✓",
    body: `Hallo ${session.user.name?.split(" ")[0] ?? ""} — Benachrichtigungen kommen auf diesem Gerät an.`,
    url: "/",
  });

  return NextResponse.json(result);
}
