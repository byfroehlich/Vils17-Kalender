import { z } from "zod";
import { defineTool, preview, bestaetigtSchema, ToolError } from "../tool";
import { listMessages, getMessage, sendMail, validateRecipients, replySubject, MailboxError } from "../../mailbox";
import { mailboxConfig } from "../../mailbox/config";
import { viennaIso } from "../format";
import { logAudit } from "../../audit";

// ─── Postfach info@vils17.at ──────────────────────────────────────────────────
// Lesen: messages:read (markiert nichts als gelesen). Senden: messages:write,
// nur mit "bestaetigt": true. Mailinhalte und Adressen landen nie im Audit-Log
// (Adresslisten sind Arrays → sanitizeForAudit macht "[Wert]" daraus).

async function mailbox<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MailboxError) throw new ToolError(err.message);
    throw err;
  }
}

const who = (list: { name: string; address: string }[]) => list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ");
const when = (iso: string | null) => (iso ? viennaIso(new Date(iso)) : null);

const ordner = z.string().trim().min(1).max(200).optional().describe("Ordner (Vorgabe INBOX). Pfade liefert postfach im Feld ordner.");

export const postfach = defineTool({
  name: "postfach",
  title: "Postfach durchsuchen",
  description:
    "Listet Mails aus dem Vermietungs-Postfach info@vils17.at (Portale, Gäste, Behörden, alles rund ums Haus), neueste zuerst. " +
    "Mit suche nach Absender, Empfänger oder Betreff filtern. Markiert nichts als gelesen. Für den Inhalt: mail_lesen.",
  scope: "messages:read",
  input: {
    ordner,
    suche: z.string().trim().max(200).optional().describe("Suchbegriff (Absender, Empfänger, Betreff; durchsucht die neuesten 1000 Mails)"),
    nur_ungelesen: z.boolean().optional(),
    seite: z.number().int().min(1).max(100).optional(),
    pro_seite: z.number().int().min(1).max(50).optional().describe("Vorgabe 20"),
  },
  async handler(args) {
    const r = await mailbox(() => listMessages({ folder: args.ordner ?? "INBOX", page: args.seite ?? 1, pageSize: args.pro_seite ?? 20, query: args.suche, unseenOnly: args.nur_ungelesen }));
    return {
      postfach: mailboxConfig()?.address ?? null,
      ordner: args.ordner ?? "INBOX",
      gesamt: r.total,
      seite: r.page,
      seiten: Math.max(1, Math.ceil(r.total / r.pageSize)),
      mails: r.messages.map((m) => ({
        uid: m.uid, von: who(m.from), an: who(m.to), betreff: m.subject, datum: when(m.date),
        gelesen: m.seen, beantwortet: m.answered, markiert: m.flagged, anhang: m.hasAttachments,
      })),
    };
  },
});

export const mailLesen = defineTool({
  name: "mail_lesen",
  title: "Mail lesen",
  description: "Liest eine Mail aus dem Postfach info@vils17.at vollständig als Text (uid aus postfach). Markiert sie NICHT als gelesen.",
  scope: "messages:read",
  input: {
    uid: z.number().int().positive(),
    ordner,
  },
  async handler(args) {
    const m = await mailbox(() => getMessage(args.ordner ?? "INBOX", args.uid));
    const max = 20_000;
    return {
      uid: m.uid, ordner: m.folder,
      von: who(m.from), an: who(m.to), cc: who(m.cc), antwort_an: who(m.replyTo) || null,
      betreff: m.subject, datum: when(m.date), gelesen: m.seen, beantwortet: m.answered,
      text: m.text.length > max ? `${m.text.slice(0, max)}\n[… gekürzt, ${m.text.length} Zeichen]` : m.text,
      anhaenge: m.attachments.map((a) => ({ name: a.filename, typ: a.contentType, groesse_kb: Math.round(a.size / 1024) })),
    };
  },
});

export const mailSenden = defineTool({
  name: "mail_senden",
  title: "Mail senden",
  description:
    "Sendet eine Mail von info@vils17.at (wird auch in „Gesendet“ abgelegt). Für Antworten antwort_auf_uid angeben — dann hängt die Mail am Verlauf " +
    "und das Original wird als beantwortet markiert; ohne betreff wird „AW: …“ übernommen. " +
    "Erst OHNE bestaetigt aufrufen und Mathias Empfänger, Betreff und genauen Text zeigen; erst nach seiner ausdrücklichen Zustimmung mit bestaetigt: true senden. Gesendet ist gesendet.",
  scope: "messages:write",
  write: true,
  input: {
    an: z.array(z.string().trim().min(3).max(200)).min(1).max(20).describe("Empfänger-Adressen"),
    cc: z.array(z.string().trim().min(3).max(200)).max(20).optional(),
    betreff: z.string().trim().max(300).optional(),
    text: z.string().trim().min(1).max(20_000).describe("Mailtext (reiner Text)"),
    antwort_auf_uid: z.number().int().positive().optional().describe("uid der Mail, auf die geantwortet wird"),
    ordner: ordner.describe("Ordner der Originalmail (Vorgabe INBOX)"),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const to = await mailbox(async () => validateRecipients(args.an));
    const cc = await mailbox(async () => validateRecipients(args.cc ?? []));
    const folder = args.ordner ?? "INBOX";

    let subject = args.betreff ?? "";
    let bezug: { betreff: string; von: string } | null = null;
    if (args.antwort_auf_uid) {
      const orig = await mailbox(() => getMessage(folder, args.antwort_auf_uid!));
      bezug = { betreff: orig.subject, von: who(orig.from) };
      if (!subject) subject = replySubject(orig.subject, "reply");
    }
    if (!subject) throw new ToolError("Betreff fehlt.");
    const from = mailboxConfig()?.address ?? null;

    if (!args.bestaetigt) {
      return preview(`Mail von ${from ?? "info@vils17.at"} an ${to.join(", ")} senden.`, {
        von: from, an: to, cc, betreff: subject, text: args.text, ...(bezug ? { antwort_auf: bezug } : {}),
      });
    }

    const r = await mailbox(() => sendMail({
      to, cc, subject, text: args.text,
      ...(args.antwort_auf_uid ? { replyTo: { folder, uid: args.antwort_auf_uid } } : {}),
    }));
    await logAudit({
      organizationId: ctx.organizationId,
      action: "mail.sent",
      entityType: "Mail",
      entityId: r.messageId || undefined,
      details: { via: `mcp:${ctx.tokenName}`, empfaenger: to.length + cc.length, zeichen: args.text.length, antwort: Boolean(args.antwort_auf_uid) },
    });
    return { ausgefuehrt: true, gesendet: true, an: to, betreff: subject, in_gesendet_abgelegt: r.savedToSent };
  },
});
