import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { saveLaundryCount, recordLaundryDelivery, cancelLaundryDelivery, confirmLaundryDelivery, setLaundryReserve } from "@/lib/laundry-proposal";
import { normalizeQuantity } from "@/lib/laundry-order";
import { parseDay } from "@/lib/mcp/format";

// Wäsche-Bestand, Lieferungen, Reserve. Nur ADMIN und MANAGER.

const qty = z.record(z.string(), z.number().int().min(0).max(999));
const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("count"), countedOn: dayStr, quantities: qty, notes: z.string().max(500).optional() }),
  z.object({ action: z.literal("delivery"), deliveryOn: dayStr, quantities: qty, reference: z.string().max(200).optional() }),
  z.object({ action: z.literal("cancelDelivery"), id: z.string().min(1) }),
  z.object({ action: z.literal("arrived"), id: z.string().min(1) }),
  z.object({ action: z.literal("reserve"), quantities: qty }),
]);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  const organizationId = session.user.organizationId;
  const actor = { userId: session.user.id, via: "app" };
  const a = parsed.data;
  switch (a.action) {
    case "count":
      await saveLaundryCount({ organizationId, countedOn: parseDay(a.countedOn), quantities: normalizeQuantity(a.quantities), notes: a.notes ?? null, actor });
      break;
    case "delivery":
      await recordLaundryDelivery({ organizationId, deliveryOn: parseDay(a.deliveryOn), quantities: normalizeQuantity(a.quantities), reference: a.reference ?? null, actor });
      break;
    case "cancelDelivery":
      if (!(await cancelLaundryDelivery({ organizationId, id: a.id, actor }))) return NextResponse.json({ error: "Lieferung nicht gefunden" }, { status: 404 });
      break;
    case "arrived": {
      const r = await confirmLaundryDelivery({ organizationId, id: a.id, actor });
      if (r.status === "notFound") return NextResponse.json({ error: "Lieferung nicht gefunden" }, { status: 404 });
      break;
    }
    case "reserve":
      await setLaundryReserve({ organizationId, reserve: normalizeQuantity(a.quantities), actor });
      break;
  }
  return NextResponse.json({ ok: true });
}
