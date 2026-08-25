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
 * Holt ungelesene Mails aus dem konfigurierten Postfach und markiert sie als
 * gelesen. Die Doppelverarbeitung verhindert zusätzlich die messageId-Sperre in
 * der Datenbank — das Gelesen-Markieren ist nur die günstige erste Hürde.
 */
export async function fetchUnreadMails(limit = 50): Promise<FetchedMail[]> {
  if (!isImapConfigured()) {
    throw new Error("IMAP nicht konfiguriert (IMAP_HOST / IMAP_USER / IMAP_PASS fehlen)");
  }

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
      // search() liefert false, wenn die Suche fehlschlägt
      const uids = await client.search({ seen: false });
      const selected = Array.isArray(uids) ? uids.slice(-limit) : [];

      for (const uid of selected) {
        const msg = await client.fetchOne(String(uid), { source: true });
        if (!msg || !msg.source) continue;

        const parsed = await simpleParser(msg.source);
        const html = typeof parsed.html === "string" ? parsed.html : "";
        const text = (parsed.text && parsed.text.trim().length > 0)
          ? parsed.text
          : htmlToText(html);

        results.push({
          messageId: parsed.messageId ?? `uid-${folder}-${uid}`,
          from: parsed.from?.text ?? "",
          subject: parsed.subject ?? "",
          text,
          receivedAt: parsed.date ?? null,
        });

        // Als gelesen markieren, damit der nächste Lauf sie nicht erneut zieht
        await client.messageFlagsAdd(String(uid), ["\\Seen"]);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return results;
}
