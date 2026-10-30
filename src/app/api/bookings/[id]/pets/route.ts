import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ActionError } from "@/lib/booking-actions";
import { GuestMessageError } from "@/lib/guest-messages";
import { scanBookingForDogs, setPetFeeStatus, petFeeDraft, requestPetFee } from "@/lib/pet-actions";

// Hunde & Hundegebühr einer Buchung. Nur ADMIN und MANAGER.

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scan") }),
  z.object({ action: z.literal("draft") }),
  z.object({ action: z.literal("request"), text: z.string().trim().min(1).max(5000) }),
  z.object({ action: z.literal("fee"), status: z.enum(["PAID", "WAIVED", "REQUESTED"]).nullable(), amount: z.number().min(0).max(10000).optional() }),
]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });

  const organizationId = session.user.organizationId;
  const actor = { userId: session.user.id, via: "app" };
  const bookingId = params.id;
  try {
    const a = parsed.data;
    switch (a.action) {
      case "scan": {
        const r = await scanBookingForDogs({ organizationId, bookingId, actor });
        return NextResponse.json({ ok: true, found: r.detection, source: r.source, changed: r.changed, skippedManual: r.skippedManual });
      }
      case "draft": {
        const d = await petFeeDraft(organizationId, bookingId);
        return NextResponse.json({ ok: true, text: d.text, amount: d.fee.amount, paymentConfigured: d.paymentConfigured });
      }
      case "request":
        await requestPetFee({ organizationId, bookingId, text: a.text, actor });
        return NextResponse.json({ ok: true });
      case "fee":
        await setPetFeeStatus({ organizationId, bookingId, status: a.status, ...(a.amount !== undefined ? { amount: a.amount } : {}), actor });
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    if (err instanceof ActionError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof GuestMessageError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
