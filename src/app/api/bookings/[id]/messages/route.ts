import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { fetchGuestMessages, sendGuestMessage, lastMessage, GuestMessageError } from "@/lib/guest-messages";

// Gästechat einer Buchung (Smoobu). Nur ADMIN und MANAGER.
// Nachrichtentexte nie ins Audit-Log — nur Länge.

async function auth() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) return null;
  return session;
}

async function load(organizationId: string, id: string) {
  return prisma.booking.findFirst({ where: { id, organizationId }, select: { id: true, smoobuId: true, status: true } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const b = await load(session.user.organizationId, params.id);
  if (!b) return NextResponse.json({ error: "Buchung nicht gefunden" }, { status: 404 });
  if (!b.smoobuId) return NextResponse.json({ error: "Buchung stammt nicht aus Smoobu — kein Chat" }, { status: 400 });
  try {
    const { messages, complete } = await fetchGuestMessages(b.smoobuId);
    const last = lastMessage(messages);
    const sorted = messages.every((m) => /^\d+$/.test(m.id)) ? [...messages].sort((x, y) => Number(x.id) - Number(y.id)) : messages;
    return NextResponse.json({ messages: sorted, complete, waiting: last?.von === "gast" });
  } catch (err) {
    const msg = err instanceof GuestMessageError ? err.message : "Chat konnte nicht geladen werden";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

const sendSchema = z.object({ text: z.string().trim().min(1).max(5000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 });
  const b = await load(session.user.organizationId, params.id);
  if (!b) return NextResponse.json({ error: "Buchung nicht gefunden" }, { status: 404 });
  if (!b.smoobuId) return NextResponse.json({ error: "Buchung stammt nicht aus Smoobu — kein Chat" }, { status: 400 });
  if (b.status !== "confirmed") return NextResponse.json({ error: "Buchung ist storniert" }, { status: 400 });
  try {
    await sendGuestMessage(b.smoobuId, parsed.data.text);
  } catch (err) {
    const msg = err instanceof GuestMessageError ? err.message : "Senden fehlgeschlagen";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "guest.message.sent",
    entityType: "Booking",
    entityId: b.id,
    details: { via: "app", zeichen: parsed.data.text.length },
  });
  return NextResponse.json({ ok: true });
}
