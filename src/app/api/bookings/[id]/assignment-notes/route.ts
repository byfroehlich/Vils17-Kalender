import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { setAssignmentNotes, ActionError } from "@/lib/booking-actions";
import { z } from "zod";

const schema = z.object({
  notes: z.string().max(1000),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "MANAGER";
  if (!isAdmin) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });

  try {
    await setAssignmentNotes({
      organizationId: session.user.organizationId,
      bookingId: params.id,
      notes: parsed.data.notes,
      actor: { userId: session.user.id },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ActionError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
