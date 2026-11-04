import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { htmlToText } from "./parse";

export interface FetchedMail {
  messageId: string;
  from: string;
  subject: string;
  text: string;
  receivedAt: Date | null;
}

export function isImapConfigured(): boolean {
  return Boolean(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS);
}

/**
 * Holt die Mails der letzten Tage, die noch nicht verarbeitet sind.
 * Markiert NICHTS als gelesen — das Postfach ist zugleich das Arbeitspostfach
 * (Apple Mail, Mail-Bereich der App). Die Doppelverarbeitung verhindert die
 * messageId-Sperre: bekannte Mails werden schon am Umschlag erkannt und gar
 * nicht erst geladen.
 */
export async function fetchNewMails(isKnown: (messageId: string) => Promise<boolean>, opts: { days?: number; limit?: number } = {}): Promise<FetchedMail[]> {
  if (!isImapConfigured()) {
    throw new Error("IMAP nicht konfiguriert (IMAP_HOST / IMAP_USER / IMAP_PASS fehlen)");
  }
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 50;

  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: (process.env.IMAP_SECURE ?? "true") !== "false",
    auth: {
      user: process.env.IMAP_USER!,
      pass: process.env.IMAP_PASS!,
    },
    logger: false,
  });

  const folder = process.env.IMAP_FOLDER ?? "INBOX";
  const results: FetchedMail[] = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock(folder);
    try {
      const since = Date.now() - days * 86_400_000;
      // Kein IMAP-SEARCH (liefert bei Strato nichts): die neuesten 300 Umschläge
      // holen und nach Datum filtern. Bekannte Mails werden gar nicht geladen.
      const exists = client.mailbox ? client.mailbox.exists : 0;
      const fresh: { uid: number; messageId: string }[] = [];
      if (exists >= 1) {
        for await (const m of client.fetch(`${Math.max(1, exists - 299)}:${exists}`, { uid: true, envelope: true, internalDate: true })) {
          const d = m.envelope?.date ?? (m.internalDate ? new Date(m.internalDate) : null);
          if (d && new Date(d).getTime() < since) continue;
          const id = m.envelope?.messageId ?? `uid-${folder}-${m.uid}`;
          if (!(await isKnown(id))) fresh.push({ uid: m.uid, messageId: id });
        }
      }
      fresh.sort((a, b) => a.uid - b.uid);

      for (const { uid, messageId } of fresh.slice(-limit)) {
        // source wird mit BODY.PEEK geholt — \Seen bleibt unverändert
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;

        const parsed = await simpleParser(msg.source);
        const html = typeof parsed.html === "string" ? parsed.html : "";
        const text = (parsed.text && parsed.text.trim().length > 0)
          ? parsed.text
          : htmlToText(html);

        results.push({
          messageId,
          from: parsed.from?.text ?? "",
          subject: parsed.subject ?? "",
          text,
          receivedAt: parsed.date ?? null,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return results;
}
