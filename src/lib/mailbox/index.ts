import { ImapFlow, type FetchMessageObject, type ListResponse, type MessageAddressObject, type MessageStructureObject } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer";
import { mailboxConfig, smtpTransport, type MailboxConfig } from "./config";
import { htmlToText } from "../email-import/parse";

// ─── Postfach: lesen, markieren, verschieben, senden ──────────────────────────
// Quelle ist immer der Server (IMAP) — die App speichert keine Mails. Apple Mail
// und die App sehen damit denselben Stand (gelesen, beantwortet, Ordner).
// Gesendete Mails werden zusätzlich in „Gesendet“ abgelegt.

export class MailboxError extends Error {}

export interface Address { name: string; address: string }

export interface MailFolder {
  path: string;
  name: string;
  /** \Inbox, \Sent, \Trash, \Drafts, \Junk, \Archive */
  specialUse: string | null;
  unseen: number | null;
}

export interface MailSummary {
  uid: number;
  folder: string;
  from: Address[];
  to: Address[];
  subject: string;
  date: string | null;
  seen: boolean;
  answered: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  size: number | null;
}

export interface MailAttachment { index: number; filename: string; contentType: string; size: number }

export interface MailMessage extends MailSummary {
  cc: Address[];
  replyTo: Address[];
  messageId: string | null;
  references: string[];
  text: string;
  html: string | null;
  attachments: MailAttachment[];
}

/** So viele neueste Mails werden bei Suche/Filter durchsucht */
const SEARCH_WINDOW = 1000;

const FOLDER_ORDER = ["\\Inbox", "\\Sent", "\\Drafts", "\\Archive", "\\Junk", "\\Trash"];
const FOLDER_LABELS: Record<string, string> = {
  "\\Inbox": "Posteingang", "\\Sent": "Gesendet", "\\Drafts": "Entwürfe", "\\Archive": "Archiv", "\\Junk": "Spam", "\\Trash": "Papierkorb",
};

function requireConfig(): MailboxConfig {
  const cfg = mailboxConfig();
  if (!cfg) throw new MailboxError("Postfach nicht eingerichtet — IMAP_HOST, IMAP_USER und IMAP_PASS in Render eintragen.");
  return cfg;
}

export function isMailboxConfigured(): boolean {
  return mailboxConfig() !== null;
}

/** Eine IMAP-Verbindung für die Dauer von fn */
export async function withImap<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const { imap } = requireConfig();
  const client = new ImapFlow({
    host: imap.host, port: imap.port, secure: imap.secure,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
  });
  try {
    await client.connect();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new MailboxError(/auth/i.test(msg) ? "Anmeldung am Postfach fehlgeschlagen — Passwort in Render prüfen." : "Postfach nicht erreichbar.");
  }
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function withFolder<T>(client: ImapFlow, folder: string, fn: () => Promise<T>): Promise<T> {
  let lock;
  try {
    lock = await client.getMailboxLock(folder);
  } catch {
    throw new MailboxError(`Ordner „${folder}“ gibt es nicht.`);
  }
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

const addr = (list?: MessageAddressObject[] | null): Address[] =>
  (list ?? []).filter((a) => a.address).map((a) => ({ name: a.name ?? "", address: a.address! }));

const parsedAddr = (a?: AddressObject | AddressObject[]): Address[] =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((o) => o.value).filter((v) => v.address).map((v) => ({ name: v.name ?? "", address: v.address! }));

function hasAttachment(node?: MessageStructureObject): boolean {
  if (!node) return false;
  if (node.disposition?.toLowerCase() === "attachment") return true;
  return (node.childNodes ?? []).some(hasAttachment);
}

async function findSpecial(client: ImapFlow, use: string): Promise<string | null> {
  const list = await client.list();
  return list.find((f) => f.specialUse === use)?.path ?? null;
}

// ─── Ordner ───────────────────────────────────────────────────────────────────

export async function listFolders(): Promise<MailFolder[]> {
  return withImap(async (client) => {
    const list: ListResponse[] = await client.list({ statusQuery: { unseen: true } });
    const folders = list
      .filter((f) => !f.flags.has("\\Noselect"))
      .map((f) => ({
        path: f.path,
        name: (f.specialUse && FOLDER_LABELS[f.specialUse]) || f.name,
        specialUse: f.specialUse ?? null,
        unseen: f.status?.unseen ?? null,
      }));
    const rank = (f: MailFolder) => (f.specialUse ? FOLDER_ORDER.indexOf(f.specialUse) : -1);
    return folders.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra >= 0 && rb >= 0) return ra - rb;
      if (ra >= 0) return -1;
      if (rb >= 0) return 1;
      return a.name.localeCompare(b.name, "de");
    });
  });
}

// ─── Liste ────────────────────────────────────────────────────────────────────

export async function listMessages(params: { folder?: string; page?: number; pageSize?: number; query?: string; unseenOnly?: boolean }): Promise<{ total: number; page: number; pageSize: number; messages: MailSummary[] }> {
  const folder = params.folder || "INBOX";
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 30));
  const q = params.query?.trim();

  return withImap((client) => withFolder(client, folder, async () => {
    const toSummary = (m: FetchMessageObject): MailSummary => ({
      uid: m.uid,
      folder,
      from: addr(m.envelope?.from),
      to: addr(m.envelope?.to),
      subject: m.envelope?.subject ?? "",
      date: m.envelope?.date ? new Date(m.envelope.date).toISOString() : null,
      seen: m.flags?.has("\\Seen") ?? false,
      answered: m.flags?.has("\\Answered") ?? false,
      flagged: m.flags?.has("\\Flagged") ?? false,
      hasAttachments: hasAttachment(m.bodyStructure),
      size: m.size ?? null,
    });
    const query = { uid: true, envelope: true, flags: true, bodyStructure: true, size: true } as const;
    const messages: MailSummary[] = [];

    // Ohne Filter: über Sequenznummern blättern (neueste = höchste Nummer) — kein SEARCH nötig
    if (!q && !params.unseenOnly) {
      const exists = client.mailbox ? client.mailbox.exists : 0;
      const hi = exists - (page - 1) * pageSize;
      const lo = Math.max(1, hi - pageSize + 1);
      if (hi >= 1) {
        for await (const m of client.fetch(`${lo}:${hi}`, query)) messages.push(toSummary(m));
      }
      messages.sort((a, b) => b.uid - a.uid);
      return { total: exists, page, pageSize, messages };
    }

    // Mit Filter: IMAP-SEARCH liefert bei Strato keine Treffer — daher die letzten
    // SEARCH_WINDOW Mails holen und hier filtern (Absender, Empfänger, Betreff).
    const exists = client.mailbox ? client.mailbox.exists : 0;
    const needle = q?.toLowerCase();
    const matches = (m: MailSummary) =>
      (!params.unseenOnly || !m.seen) &&
      (!needle || [m.subject, ...m.from.flatMap((a) => [a.name, a.address]), ...m.to.flatMap((a) => [a.name, a.address])].some((v) => v.toLowerCase().includes(needle)));
    if (exists >= 1) {
      for await (const m of client.fetch(`${Math.max(1, exists - SEARCH_WINDOW + 1)}:${exists}`, query)) {
        const sm = toSummary(m);
        if (matches(sm)) messages.push(sm);
      }
    }
    messages.sort((a, b) => b.uid - a.uid);
    return { total: messages.length, page, pageSize, messages: messages.slice((page - 1) * pageSize, page * pageSize) };
  }));
}

// ─── Einzelne Mail ────────────────────────────────────────────────────────────

async function fetchParsed(client: ImapFlow, uid: number) {
  const m = await client.fetchOne(String(uid), { uid: true, source: true, flags: true, size: true }, { uid: true });
  if (!m || !m.source) throw new MailboxError("Mail nicht gefunden — eventuell verschoben oder gelöscht.");
  return { m, parsed: await simpleParser(m.source) };
}

/** Liest eine Mail. markSeen: true markiert sie als gelesen (Öffnen in der App). */
export async function getMessage(folder: string, uid: number, opts: { markSeen?: boolean } = {}): Promise<MailMessage> {
  return withImap((client) => withFolder(client, folder, async () => {
    const { m, parsed } = await fetchParsed(client, uid);
    if (opts.markSeen && !m.flags?.has("\\Seen")) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    const html = typeof parsed.html === "string" ? parsed.html : null;
    const refs = parsed.references;
    return {
      uid,
      folder,
      from: parsedAddr(parsed.from),
      to: parsedAddr(parsed.to),
      cc: parsedAddr(parsed.cc),
      replyTo: parsedAddr(parsed.replyTo),
      subject: parsed.subject ?? "",
      date: parsed.date ? parsed.date.toISOString() : null,
      seen: opts.markSeen ? true : m.flags?.has("\\Seen") ?? false,
      answered: m.flags?.has("\\Answered") ?? false,
      flagged: m.flags?.has("\\Flagged") ?? false,
      size: m.size ?? null,
      messageId: parsed.messageId ?? null,
      references: Array.isArray(refs) ? refs : refs ? [refs] : [],
      text: parsed.text?.trim() ? parsed.text : html ? htmlToText(html) : "",
      html,
      attachments: parsed.attachments
        .map((a, index) => ({ index, filename: a.filename ?? `Anhang-${index + 1}`, contentType: a.contentType, size: a.size, related: a.related }))
        .filter((a) => !a.related)
        .map(({ related: _r, ...a }) => a),
      hasAttachments: parsed.attachments.some((a) => !a.related),
    };
  }));
}

export async function getAttachment(folder: string, uid: number, index: number): Promise<{ filename: string; contentType: string; content: Buffer }> {
  return withImap((client) => withFolder(client, folder, async () => {
    const { parsed } = await fetchParsed(client, uid);
    const a = parsed.attachments[index];
    if (!a) throw new MailboxError("Anhang nicht gefunden.");
    return { filename: a.filename ?? `Anhang-${index + 1}`, contentType: a.contentType, content: a.content };
  }));
}

// ─── Markieren / Verschieben ──────────────────────────────────────────────────

export async function updateMessage(folder: string, uid: number, change: { seen?: boolean; flagged?: boolean; move?: "trash" | "inbox" | "archive" }): Promise<{ movedTo?: string }> {
  return withImap((client) => withFolder(client, folder, async () => {
    const range = String(uid);
    if (change.seen !== undefined) {
      await (change.seen ? client.messageFlagsAdd(range, ["\\Seen"], { uid: true }) : client.messageFlagsRemove(range, ["\\Seen"], { uid: true }));
    }
    if (change.flagged !== undefined) {
      await (change.flagged ? client.messageFlagsAdd(range, ["\\Flagged"], { uid: true }) : client.messageFlagsRemove(range, ["\\Flagged"], { uid: true }));
    }
    if (change.move) {
      const target = change.move === "inbox" ? "INBOX" : await findSpecial(client, change.move === "trash" ? "\\Trash" : "\\Archive");
      if (!target) throw new MailboxError(change.move === "trash" ? "Kein Papierkorb im Postfach gefunden." : "Kein Archiv-Ordner im Postfach gefunden.");
      await client.messageMove(range, target, { uid: true });
      return { movedTo: target };
    }
    return {};
  }));
}

// ─── Senden ───────────────────────────────────────────────────────────────────

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  /** Antwort auf eine vorhandene Mail: setzt In-Reply-To/References und markiert sie als beantwortet */
  replyTo?: { folder: string; uid: number };
  attachments?: { filename: string; contentType?: string; content: Buffer }[];
}

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export function validateRecipients(list: string[]): string[] {
  const clean = list.map((s) => s.trim()).filter(Boolean);
  const bad = clean.filter((s) => !EMAIL.test(s));
  if (bad.length) throw new MailboxError(`Ungültige Adresse: ${bad.join(", ")}`);
  return clean;
}

export async function sendMail(mail: OutgoingMail): Promise<{ messageId: string; savedToSent: boolean }> {
  const cfg = requireConfig();
  const transport = cfg.smtp ? smtpTransport() : null;
  if (!transport) throw new MailboxError("Versand nicht eingerichtet — SMTP_HOST in Render eintragen (Strato: smtp.strato.de).");

  const to = validateRecipients(mail.to);
  const cc = validateRecipients(mail.cc ?? []);
  const bcc = validateRecipients(mail.bcc ?? []);
  if (!to.length) throw new MailboxError("Kein Empfänger angegeben.");
  if (!mail.subject.trim()) throw new MailboxError("Betreff fehlt.");

  return withImap(async (client) => {
    // Bezug zur Originalmail herstellen
    let inReplyTo: string | undefined;
    let references: string[] | undefined;
    if (mail.replyTo) {
      await withFolder(client, mail.replyTo.folder, async () => {
        const { parsed } = await fetchParsed(client, mail.replyTo!.uid);
        if (parsed.messageId) {
          inReplyTo = parsed.messageId;
          const prev = parsed.references;
          references = [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parsed.messageId];
        }
      });
    }

    const message = {
      from: { name: cfg.fromName, address: cfg.address },
      to, cc, bcc,
      subject: mail.subject.trim(),
      text: mail.text,
      ...(inReplyTo ? { inReplyTo, references } : {}),
      attachments: (mail.attachments ?? []).map((a) => ({ filename: a.filename, content: a.content, ...(a.contentType ? { contentType: a.contentType } : {}) })),
    };

    // Einmal bauen: dieselben Bytes gehen raus und landen in „Gesendet“
    const raw: Buffer = await new MailComposer({ ...message, bcc: undefined }).compile().build();
    const messageId = /^Message-ID:\s*(<[^>]+>)/im.exec(raw.toString("utf8"))?.[1] ?? "";
    await transport.sendMail({ envelope: { from: cfg.address, to: [...to, ...cc, ...bcc] }, raw });

    let savedToSent = false;
    const sent = await findSpecial(client, "\\Sent").catch(() => null);
    if (sent) savedToSent = Boolean(await client.append(sent, raw, ["\\Seen"]).catch(() => false));

    if (mail.replyTo) {
      await withFolder(client, mail.replyTo.folder, () => client.messageFlagsAdd(String(mail.replyTo!.uid), ["\\Answered"], { uid: true })).catch(() => undefined);
    }
    return { messageId, savedToSent };
  });
}

// ─── Hilfen für Antworten ─────────────────────────────────────────────────────

export function replySubject(subject: string, kind: "reply" | "forward"): string {
  const s = subject.trim();
  if (kind === "reply") return /^(re|aw|antw)\s*:/i.test(s) ? s : `AW: ${s}`;
  return /^(fw|fwd|wg)\s*:/i.test(s) ? s : `WG: ${s}`;
}

export function quoteText(m: Pick<MailMessage, "from" | "date" | "text">): string {
  const who = m.from[0] ? (m.from[0].name ? `${m.from[0].name} <${m.from[0].address}>` : m.from[0].address) : "Unbekannt";
  const when = m.date ? new Date(m.date).toLocaleString("de-AT", { timeZone: "Europe/Vienna", dateStyle: "medium", timeStyle: "short" }) : "";
  const body = m.text.split("\n").map((l) => `> ${l}`).join("\n");
  return `\n\nAm ${when} schrieb ${who}:\n${body}`;
}
