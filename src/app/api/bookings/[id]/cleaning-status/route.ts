import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { setCleaningStatus, ActionError } from "@/lib/booking-actions";
import { checkSchema, recordCleaningCheck, parsePhoto, IssueError } from "@/lib/issues";

const schema = z.object({
  status: z.enum(["UNASSIGNED", "SELF_CLEAN", "ASSIGNED", "COMPLETED"]),
  /** Pflicht-Check beim Erledigen (Inventar, Verbrauchsmaterial) — für Reinigungskräfte Pflicht */
  check: checkSchema.optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "MANAGER";
  const isCleaner = session.user.role === "CLEANER";

  if (!isAdmin && !isCleaner) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Daten" }, { status: 400 });
  }

  // CLEANER darf nur COMPLETED setzen (nicht zurücksetzen)
  if (isCleaner && parsed.data.status !== "COMPLETED") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  // Reinigungskräfte müssen beim Erledigen die Fragen zu Inventar und Verbrauchsmaterial beantworten
  if (isCleaner && parsed.data.status === "COMPLETED" && !parsed.data.check) {
    return NextResponse.json({ error: "Bitte zuerst Inventar und Verbrauchsmaterial bestätigen." }, { status: 400 });
  }
  try {
    parsePhoto(parsed.data.check?.damagePhoto); // Foto vorab prüfen, bevor der Status sich ändert
  } catch (err) {
    if (err instanceof IssueError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    const { assignment: updated } = await setCleaningStatus({
      organizationId: session.user.organizationId,
      bookingId: params.id,
      status: parsed.data.status,
      actor: { userId: session.user.id },
      actorName: session.user.name ?? "",
      // CLEANER: nur eigene Aufträge
      ...(isCleaner ? { onlyCleanerId: session.user.id } : {}),
    });
    if (parsed.data.status === "COMPLETED" && parsed.data.check) {
      await recordCleaningCheck({
        organizationId: session.user.organizationId,
        bookingId: params.id,
        check: parsed.data.check,
        actor: { userId: session.user.id, name: session.user.name },
      });
    }
    return NextResponse.json({ success: true, assignment: updated });
  } catch (err) {
    if (err instanceof ActionError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
