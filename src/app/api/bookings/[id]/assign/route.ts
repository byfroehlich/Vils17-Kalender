import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assignCleaner, ActionError } from "@/lib/booking-actions";
import { z } from "zod";

const assignSchema = z.object({
  cleanerId: z.string().nullable(), // null = Selbstreinigung
  isSelfClean: z.boolean().default(false),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }

  try {
    const { assignment } = await assignCleaner({
      organizationId: session.user.organizationId,
      bookingId: params.id,
      ...parsed.data,
      actor: { userId: session.user.id },
    });
    return NextResponse.json({ success: true, assignment });
  } catch (err) {
    if (err instanceof ActionError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
