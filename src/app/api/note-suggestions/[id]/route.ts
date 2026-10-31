import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ActionError } from "@/lib/booking-actions";
import { acceptNoteSuggestion, rejectNoteSuggestion } from "@/lib/note-suggestions";

// Vorschlag „Hinweis für die Reinigung“ übernehmen oder verwerfen (Seite /messages)
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), text: z.string().trim().min(1).max(500).optional(), extraBeds: z.number().int().min(0).max(3).optional() }).strict(),
  z.object({ action: z.literal("reject") }).strict(),
]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role)) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  const base = { organizationId: session.user.organizationId, id: params.id, actor: { userId: session.user.id } };
  try {
    if (parsed.data.action === "reject") {
      await rejectNoteSuggestion(base);
      return NextResponse.json({ success: true });
    }
    const r = await acceptNoteSuggestion({ ...base, text: parsed.data.text ?? null, extraBeds: parsed.data.extraBeds ?? null });
    return NextResponse.json({ success: true, ...r });
  } catch (err) {
    if (err instanceof ActionError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
