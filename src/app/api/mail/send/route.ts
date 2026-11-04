import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendMail } from "@/lib/mailbox";
import { mailSession, unauthorized, mailError } from "@/lib/mailbox/route-helpers";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MAX_TOTAL = 15 * 1024 * 1024; // Strato nimmt bis ~50 MB, Empfänger oft weniger

const list = (s: FormDataEntryValue | null) => String(s ?? "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

const schema = z.object({
  to: z.array(z.string().max(200)).min(1, "Empfänger fehlt").max(20),
  cc: z.array(z.string().max(200)).max(20),
  bcc: z.array(z.string().max(200)).max(20),
  subject: z.string().trim().min(1, "Betreff fehlt").max(300),
  text: z.string().max(50_000),
  replyFolder: z.string().max(200).optional(),
  replyUid: z.coerce.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  const session = await mailSession();
  if (!session) return unauthorized();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });

  const parsed = schema.safeParse({
    to: list(form.get("to")),
    cc: list(form.get("cc")),
    bcc: list(form.get("bcc")),
    subject: form.get("subject") ?? "",
    text: form.get("text") ?? "",
    replyFolder: form.get("replyFolder") || undefined,
    replyUid: form.get("replyUid") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Daten" }, { status: 400 });

  const files = form.getAll("attachments").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f && f.size > 0);
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL) return NextResponse.json({ error: "Anhänge zusammen größer als 15 MB" }, { status: 400 });

  const d = parsed.data;
  try {
    const r = await sendMail({
      to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, text: d.text,
      ...(d.replyUid ? { replyTo: { folder: d.replyFolder || "INBOX", uid: d.replyUid } } : {}),
      attachments: await Promise.all(files.map(async (f) => ({ filename: f.name, contentType: f.type || undefined, content: Buffer.from(await f.arrayBuffer()) }))),
    });
    await logAudit({
      organizationId: session.user.organizationId,
      userId: session.user.id,
      action: "mail.sent",
      entityType: "Mail",
      entityId: r.messageId || undefined,
      details: { empfaenger: d.to.length + d.cc.length + d.bcc.length, anhaenge: files.length, antwort: Boolean(d.replyUid) },
    });
    return NextResponse.json({ success: true, savedToSent: r.savedToSent });
  } catch (err) {
    return mailError(err);
  }
}
