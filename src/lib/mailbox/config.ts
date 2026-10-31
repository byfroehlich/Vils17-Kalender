import nodemailer from "nodemailer";

// ─── Postfach der Vermietung (info@vils17.at bei Strato) ──────────────────────
// Ein Postfach für alles rund ums Haus: Portale, Gäste, Behörden.
// Lesen über IMAP, Senden über SMTP — Zugangsdaten nur aus der Umgebung.
//   IMAP_HOST, IMAP_USER, IMAP_PASS (Pflicht), IMAP_PORT (993), IMAP_SECURE (true)
//   SMTP_HOST, SMTP_PORT (465 → TLS), SMTP_USER/SMTP_PASS (Vorgabe: wie IMAP)
//   MAIL_FROM_NAME — Anzeigename beim Senden

export interface ServerConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface MailboxConfig {
  imap: ServerConfig;
  smtp: ServerConfig | null;
  address: string;
  fromName: string;
}

const env = (k: string) => (process.env[k] ?? "").trim();

export function mailboxConfig(): MailboxConfig | null {
  const host = env("IMAP_HOST");
  const user = env("IMAP_USER");
  const pass = process.env.IMAP_PASS ?? "";
  if (!host || !user || !pass) return null;

  const imapPort = Number(env("IMAP_PORT") || 993);
  const imap: ServerConfig = { host, port: imapPort, secure: env("IMAP_SECURE") !== "false", user, pass };

  const smtpHost = env("SMTP_HOST");
  const smtpPort = Number(env("SMTP_PORT") || 465);
  const smtp: ServerConfig | null = smtpHost
    ? { host: smtpHost, port: smtpPort, secure: smtpPort === 465, user: env("SMTP_USER") || user, pass: process.env.SMTP_PASS || pass }
    : null;

  return { imap, smtp, address: user, fromName: env("MAIL_FROM_NAME") || "Vils17 · Lodge & Penthouse No. 17" };
}

/** SMTP-Versand für alle Mails der App (auch Reinigungsaufträge). null = nicht eingerichtet. */
export function smtpTransport() {
  const cfg = mailboxConfig();
  // Ohne Postfach: alter Weg nur mit SMTP_* (z.B. Gmail)
  const smtp = cfg?.smtp ?? (env("SMTP_HOST") && env("SMTP_USER")
    ? { host: env("SMTP_HOST"), port: Number(env("SMTP_PORT") || 587), secure: Number(env("SMTP_PORT") || 587) === 465, user: env("SMTP_USER"), pass: process.env.SMTP_PASS ?? "" }
    : null);
  if (!smtp) return null;
  return nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: { user: smtp.user, pass: smtp.pass } });
}

/** Absender: SMTP_FROM, sonst Anzeigename + Postfachadresse */
export function defaultFrom(): string | undefined {
  if (env("SMTP_FROM")) return env("SMTP_FROM");
  const cfg = mailboxConfig();
  return cfg ? `"${cfg.fromName}" <${cfg.address}>` : undefined;
}
