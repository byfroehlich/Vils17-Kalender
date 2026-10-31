import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Postfach: gefälschter IMAP-Server + abgefangener SMTP-Versand ────────────
// Keine echten Verbindungen. Geprüft wird, was die Doku verlangt:
// lesen ohne Gelesen-Markierung, Senden nur mit Bestätigung, Antwort-Verlauf,
// Ablage in „Gesendet“, keine Adressen/Texte im Audit-Log.

type FakeMsg = { uid: number; flags: Set<string>; raw: string };
const imap = vi.hoisted(() => ({
  folders: {} as Record<string, FakeMsg[]>,
  appended: [] as { path: string; raw: string; flags: string[] }[],
  current: "",
  connects: 0,
}));
const smtp = vi.hoisted(() => ({ sent: [] as { envelope: { from: string; to: string[] }; raw: Buffer }[] }));

function rawMail(p: { from: string; to: string; subject: string; text: string; id: string; date?: string }) {
  return [
    `From: ${p.from}`, `To: ${p.to}`, `Subject: ${p.subject}`, `Message-ID: ${p.id}`,
    `Date: ${p.date ?? "Fri, 30 Oct 2026 10:00:00 +0100"}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", p.text, "",
  ].join("\r\n");
}

vi.mock("imapflow", async () => {
  const { simpleParser } = await import("mailparser");
  const toAddr = (a: any) => (a ? a.value.map((v: any) => ({ name: v.name, address: v.address })) : []);
  class ImapFlow {
    mailbox: { path: string; exists: number } | false = false;
    async connect() { imap.connects++; }
    async logout() {}
    async getMailboxLock(path: string) {
      if (!imap.folders[path]) throw new Error("no such mailbox");
      imap.current = path;
      this.mailbox = { path, exists: imap.folders[path]!.length };
      return { release() {} };
    }
    async list() {
      const use: Record<string, string> = { INBOX: "\\Inbox", Sent: "\\Sent", Trash: "\\Trash" };
      return Object.keys(imap.folders).map((p) => ({ path: p, name: p, flags: new Set<string>(), specialUse: use[p], status: { unseen: imap.folders[p]!.filter((m) => !m.flags.has("\\Seen")).length } }));
    }
    async search(q: any) {
      const all = imap.folders[imap.current]!;
      const term = q.or?.[0]?.from?.toLowerCase();
      if (q.all) throw new Error("SEARCH ALL sollte nicht nötig sein");
      return all.filter((m) => (!term || m.raw.toLowerCase().includes(term)) && (q.seen !== false || !m.flags.has("\\Seen")) && (!q.since || true)).map((m) => m.uid);
    }
    async *fetch(range: number[] | string, query: any, opts?: { uid?: boolean }) {
      const all = imap.folders[imap.current]!;
      let pick: FakeMsg[];
      if (typeof range === "string") {
        // Sequenznummern lo:hi (1-basiert)
        const [lo, hi] = range.split(":").map(Number);
        pick = all.slice(lo! - 1, hi!);
        if (opts?.uid) throw new Error("Test erwartet Sequenzbereich ohne uid");
      } else pick = all.filter((x) => range.includes(x.uid));
      for (const m of pick) {
        const p = await simpleParser(m.raw);
        yield { uid: m.uid, flags: new Set(m.flags), size: m.raw.length, envelope: { messageId: p.messageId, subject: p.subject, date: p.date, from: toAddr(p.from), to: toAddr(p.to) }, bodyStructure: { type: "text/plain" }, ...(query.source ? { source: Buffer.from(m.raw) } : {}) };
      }
    }
    async fetchOne(uid: string) {
      const m = imap.folders[imap.current]!.find((x) => x.uid === Number(uid));
      // Wie BODY.PEEK: Flags bleiben unverändert
      return m ? { uid: m.uid, flags: new Set(m.flags), size: m.raw.length, source: Buffer.from(m.raw) } : false;
    }
    async messageFlagsAdd(uid: string, flags: string[]) {
      const m = imap.folders[imap.current]!.find((x) => x.uid === Number(uid));
      flags.forEach((f) => m?.flags.add(f));
      return true;
    }
    async messageFlagsRemove(uid: string, flags: string[]) {
      const m = imap.folders[imap.current]!.find((x) => x.uid === Number(uid));
      flags.forEach((f) => m?.flags.delete(f));
      return true;
    }
    async messageMove(uid: string, target: string) {
      const list = imap.folders[imap.current]!;
      const i = list.findIndex((x) => x.uid === Number(uid));
      const [m] = list.splice(i, 1);
      imap.folders[target]!.push(m!);
      return { path: target };
    }
    async append(path: string, raw: Buffer, flags: string[]) {
      imap.appended.push({ path, raw: raw.toString("utf8"), flags });
      return { destination: path };
    }
  }
  return { ImapFlow };
});

vi.mock("nodemailer", async (orig) => {
  const real = await orig<{ default: Record<string, unknown> }>();
  return {
    ...real,
    default: {
      ...real.default,
      createTransport: () => ({ sendMail: async (m: any) => { smtp.sent.push(m); return { messageId: "x" }; } }),
    },
  };
});

import { prisma } from "@/lib/prisma";
import { runTool, type ToolContext } from "@/lib/mcp/tool";
import { findTool } from "@/lib/mcp/registry";
import { SCOPES } from "@/lib/mcp/tokens";
import { getMessage, updateMessage, replySubject } from "@/lib/mailbox";
import { fetchNewMails } from "@/lib/email-import/imap";
import { resetDb, seedWorld } from "./fixtures";

let ctx: ToolContext;
const call = (name: string, args: Record<string, unknown> = {}) => runTool(findTool(name)!, args, ctx) as Promise<{ ok: boolean; result: any }>;

const ENV = { IMAP_HOST: "imap.strato.de", IMAP_USER: "info@vils17.at", IMAP_PASS: "geheim", SMTP_HOST: "smtp.strato.de", SMTP_PORT: "465" };

beforeEach(async () => {
  await resetDb();
  const world = await seedWorld();
  ctx = { organizationId: world.org.id, tokenId: "tok1", tokenName: "Claude", scopes: [...SCOPES] };
  Object.assign(process.env, ENV);
  imap.folders = {
    INBOX: [
      { uid: 11, flags: new Set(), raw: rawMail({ from: "Anna Gast <anna@example.com>", to: "info@vils17.at", subject: "Anreise mit Hund", text: "Hallo, wir kommen mit Hund.", id: "<a1@example.com>" }) },
      { uid: 12, flags: new Set(["\\Seen"]), raw: rawMail({ from: "Gemeinde Vils <amt@vils.example>", to: "info@vils17.at", subject: "Ortstaxe Quartal", text: "Bitte melden.", id: "<g1@vils.example>", date: "Sat, 31 Oct 2026 08:00:00 +0100" }) },
    ],
    Sent: [],
    Trash: [],
  };
  imap.appended = [];
  smtp.sent = [];
});

afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
});

describe("postfach / mail_lesen", () => {
  it("listet neueste zuerst und sucht nach Absender", async () => {
    const r = await call("postfach");
    expect(r.ok).toBe(true);
    expect(r.result.postfach).toBe("info@vils17.at");
    expect(r.result.mails.map((m: any) => m.uid)).toEqual([12, 11]);
    expect(r.result.mails[1]).toMatchObject({ betreff: "Anreise mit Hund", gelesen: false, von: "Anna Gast <anna@example.com>" });

    const s = await call("postfach", { suche: "anna@example.com" });
    expect(s.result.mails.map((m: any) => m.uid)).toEqual([11]);
  });

  it("mail_lesen liefert den Text und markiert NICHT als gelesen", async () => {
    const r = await call("mail_lesen", { uid: 11 });
    expect(r.result.text).toContain("wir kommen mit Hund");
    expect(r.result.gelesen).toBe(false);
    expect(imap.folders.INBOX![0]!.flags.has("\\Seen")).toBe(false);
  });

  it("Öffnen in der App markiert als gelesen", async () => {
    await getMessage("INBOX", 11, { markSeen: true });
    expect(imap.folders.INBOX![0]!.flags.has("\\Seen")).toBe(true);
  });

  it("ohne Zugangsdaten verständlicher Fehler", async () => {
    delete process.env.IMAP_PASS;
    const r = await call("postfach");
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.result)).toContain("IMAP_HOST, IMAP_USER und IMAP_PASS");
  });

  it("unbekannte Mail → Fehler statt Absturz", async () => {
    const r = await call("mail_lesen", { uid: 999 });
    expect(r.ok).toBe(false);
  });
});

describe("mail_senden", () => {
  it("ohne bestaetigt nur Vorschau, nichts gesendet", async () => {
    const r = await call("mail_senden", { an: ["anna@example.com"], text: "Gern, Hund ist willkommen.", antwort_auf_uid: 11 });
    expect(r.ok).toBe(true);
    expect(r.result.vorschau).toBe(true);
    expect(r.result.betreff).toBe("AW: Anreise mit Hund");
    expect(r.result.von).toBe("info@vils17.at");
    expect(smtp.sent).toHaveLength(0);
    expect(imap.appended).toHaveLength(0);
  });

  it("Antwort: Verlauf-Kopfzeilen, Ablage in Gesendet, Original beantwortet", async () => {
    const r = await call("mail_senden", { an: ["anna@example.com"], text: "Gern, Hund ist willkommen.", antwort_auf_uid: 11, bestaetigt: true });
    expect(r.ok).toBe(true);
    expect(r.result.gesendet).toBe(true);
    expect(smtp.sent).toHaveLength(1);
    const raw = smtp.sent[0]!.raw.toString("utf8");
    expect(raw).toMatch(/^In-Reply-To: <a1@example\.com>/im);
    expect(raw).toMatch(/^References: <a1@example\.com>/im);
    expect(raw).toMatch(/^From:[\s\S]*?<info@vils17\.at>\r?\nTo:/m);
    expect(smtp.sent[0]!.envelope).toEqual({ from: "info@vils17.at", to: ["anna@example.com"] });
    // dieselben Bytes in „Gesendet“
    expect(imap.appended).toEqual([{ path: "Sent", raw, flags: ["\\Seen"] }]);
    expect(imap.folders.INBOX![0]!.flags.has("\\Answered")).toBe(true);
  });

  it("Bcc steht nicht in der Mail, geht aber an den Empfänger", async () => {
    const { sendMail } = await import("@/lib/mailbox");
    await sendMail({ to: ["a@example.com"], bcc: ["geheim@example.com"], subject: "Test", text: "x" });
    const raw = smtp.sent[0]!.raw.toString("utf8");
    expect(raw).not.toContain("geheim@example.com");
    expect(smtp.sent[0]!.envelope.to).toContain("geheim@example.com");
  });

  it("ungültige Adresse wird abgelehnt", async () => {
    const r = await call("mail_senden", { an: ["kein-mail"], betreff: "x", text: "y", bestaetigt: true });
    expect(r.ok).toBe(false);
    expect(smtp.sent).toHaveLength(0);
  });

  it("Audit-Log ohne Adressen und Texte", async () => {
    await call("mail_senden", { an: ["anna@example.com"], betreff: "Hallo Anna", text: "Geheimer Inhalt", bestaetigt: true });
    await call("postfach", { suche: "anna@example.com" });
    const logs = await prisma.auditLog.findMany({ where: { OR: [{ action: { startsWith: "mcp." } }, { action: "mail.sent" }] } });
    expect(logs.length).toBeGreaterThanOrEqual(3);
    const dump = JSON.stringify(logs);
    expect(dump).not.toContain("anna@example.com");
    expect(dump).not.toContain("Geheimer Inhalt");
    expect(dump).not.toContain("Hallo Anna");
  });
});

describe("Verschieben und Markieren", () => {
  it("Papierkorb und zurück", async () => {
    await updateMessage("INBOX", 11, { move: "trash" });
    expect(imap.folders.Trash!.map((m) => m.uid)).toEqual([11]);
    await updateMessage("Trash", 11, { move: "inbox" });
    expect(imap.folders.INBOX!.map((m) => m.uid)).toContain(11);
  });

  it("ungelesen markieren", async () => {
    await updateMessage("INBOX", 12, { seen: false });
    expect(imap.folders.INBOX![1]!.flags.has("\\Seen")).toBe(false);
  });
});

describe("Portal-Import im gemeinsamen Postfach", () => {
  it("markiert nichts als gelesen und überspringt bekannte Mails", async () => {
    const mails = await fetchNewMails(async (id) => id === "<g1@vils.example>");
    expect(mails.map((m) => m.messageId)).toEqual(["<a1@example.com>"]);
    expect(imap.folders.INBOX!.find((m) => m.uid === 11)!.flags.has("\\Seen")).toBe(false);
  });
});

describe("Betreff", () => {
  it("AW/WG nicht doppelt", () => {
    expect(replySubject("AW: Frage", "reply")).toBe("AW: Frage");
    expect(replySubject("Re: Frage", "reply")).toBe("Re: Frage");
    expect(replySubject("Frage", "forward")).toBe("WG: Frage");
  });
});
