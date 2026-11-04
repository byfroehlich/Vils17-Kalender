import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { setExtraBeds, ActionError } from "@/lib/booking-actions";

const schema = z.object({ extraBeds: z.number().int().min(0).max(3) }).strict();

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role)) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  try {
    const r = await setExtraBeds({ organizationId: session.user.organizationId, bookingId: params.id, extraBeds: parsed.data.extraBeds, actor: { userId: session.user.id } });
    return NextResponse.json({ success: true, ...r });
  } catch (err) {
    if (err instanceof ActionError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
