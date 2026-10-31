"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, Inbox, Send, Trash2, Archive, FileText, ShieldAlert, Folder, RefreshCw, PenSquare, ArrowLeft, Reply, ReplyAll, Forward, Paperclip, Star, MailOpen, Search, X, Image as ImageIcon, Download } from "lucide-react";

// ─── Mail-Bereich: kleines Mailprogramm für info@vils17.at ────────────────────
// Liste → Mail → Antworten. Alles live vom Server (IMAP), nichts zwischengespeichert.

type Address = { name: string; address: string };
type Folder = { path: string; name: string; specialUse: string | null; unseen: number | null };
type Summary = { uid: number; folder: string; from: Address[]; to: Address[]; subject: string; date: string | null; seen: boolean; answered: boolean; flagged: boolean; hasAttachments: boolean };
type Message = Summary & { cc: Address[]; replyTo: Address[]; text: string; html: string | null; attachments: { index: number; filename: string; contentType: string; size: number }[] };
type Draft = { to: string; cc: string; bcc: string; subject: string; text: string; replyUid?: number; replyFolder?: string; note?: string };

const glass = { background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20 } as const;
const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 12, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 600, cursor: "pointer" } as const;
const primary = { ...btn, background: "#14B8A6", border: "1px solid #14B8A6", color: "#fff" } as const;
const input = { width: "100%", padding: "10px 12px", borderRadius: 12, background: "rgba(0,0,0,0.20)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontSize: 14, outline: "none" } as const;
const muted = "rgba(255,255,255,0.55)";

const FOLDER_ICON: Record<string, React.ComponentType<{ style?: React.CSSProperties }>> = {
  "\\Inbox": Inbox, "\\Sent": Send, "\\Trash": Trash2, "\\Archive": Archive, "\\Drafts": FileText, "\\Junk": ShieldAlert,
};

const person = (a?: Address) => (a ? a.name || a.address : "");
const full = (list: Address[]) => list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ");

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toLocaleDateString("de-AT", { timeZone: "Europe/Vienna" }) === now.toLocaleDateString("de-AT", { timeZone: "Europe/Vienna" });
  return sameDay
    ? d.toLocaleTimeString("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("de-AT", { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", year: d.getFullYear() === now.getFullYear() ? undefined : "2-digit" });
}
const longDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-AT", { timeZone: "Europe/Vienna", dateStyle: "full", timeStyle: "short" }) : "");
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function reSubject(s: string, kind: "reply" | "forward") {
  const t = s.trim();
  if (kind === "reply") return /^(re|aw|antw)\s*:/i.test(t) ? t : `AW: ${t}`;
  return /^(fw|fwd|wg)\s*:/i.test(t) ? t : `WG: ${t}`;
}
function quote(m: Message) {
  const head = `Am ${longDate(m.date)} schrieb ${full(m.from) || "Unbekannt"}:`;
  return `\n\n${head}\n${m.text.split("\n").map((l) => `> ${l}`).join("\n")}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Fehler beim Laden");
  return data as T;
}

/** HTML-Mail im abgeschotteten Rahmen: keine Skripte, fremde Bilder erst auf Wunsch */
function HtmlBody({ html, images }: { html: string; images: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(300);
  const doc = useMemo(() => {
    const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: cid:${images ? " https: http:" : ""};`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;padding:16px;font-family:-apple-system,system-ui,sans-serif;font-size:14px;color:#1f2937;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${html}</body></html>`;
  }, [html, images]);
  const measure = () => {
    const b = ref.current?.contentDocument?.body;
    if (b) setHeight(Math.min(20000, Math.max(120, b.scrollHeight + 8)));
  };
  return (
    <iframe
      ref={ref}
      title="Mailinhalt"
      // allow-same-origin nur zum Messen der Höhe — Skripte bleiben verboten
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      onLoad={() => { measure(); setTimeout(measure, 400); }}
      style={{ width: "100%", height, border: 0, borderRadius: 14, background: "#fff" }}
    />
  );
}

export function MailApp({ address, canSend }: { address: string | null; canSend: boolean }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [configured, setConfigured] = useState(true);
  const [folder, setFolder] = useState("INBOX");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Summary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Message | null>(null);
  const [opening, setOpening] = useState(false);
  const [images, setImages] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const scrollTop = () => document.getElementById("app-scroll")?.scrollTo({ top: 0 });

  const loadFolders = useCallback(async () => {
    try {
      const r = await api<{ configured: boolean; folders: Folder[] }>("/api/mail/folders");
      setConfigured(r.configured);
      setFolders(r.folders);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadList = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ folder, page: String(p) });
      if (query) params.set("q", query);
      const r = await api<{ total: number; messages: Summary[] }>(`/api/mail/messages?${params}`);
      setTotal(r.total);
      setPage(p);
      setItems((prev) => (p === 1 ? r.messages : [...prev, ...r.messages]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [folder, query]);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { if (configured) loadList(1); }, [loadList, configured]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const openMail = async (s: Summary) => {
    setOpening(true);
    setImages(false);
    setError(null);
    try {
      const m = await api<Message>(`/api/mail/messages/${s.uid}?folder=${encodeURIComponent(s.folder)}`);
      setOpen(m);
      setItems((prev) => prev.map((x) => (x.uid === s.uid ? { ...x, seen: true } : x)));
      if (!s.seen) setFolders((prev) => prev.map((f) => (f.path === s.folder && f.unseen ? { ...f, unseen: f.unseen - 1 } : f)));
      scrollTop();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  };

  const patch = async (m: Summary, change: { seen?: boolean; flagged?: boolean; move?: "trash" | "inbox" }) => {
    try {
      await api(`/api/mail/messages/${m.uid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder: m.folder, ...change }) });
      if (change.move) {
        setItems((prev) => prev.filter((x) => x.uid !== m.uid));
        setTotal((t) => t - 1);
        setOpen(null);
        setToast(change.move === "trash" ? "In den Papierkorb verschoben" : "In den Posteingang verschoben");
        loadFolders();
      } else {
        setItems((prev) => prev.map((x) => (x.uid === m.uid ? { ...x, ...change } : x)));
        if (open?.uid === m.uid) setOpen({ ...open, ...change });
        if (change.seen === false) { setOpen(null); loadFolders(); }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const startReply = (m: Message, kind: "reply" | "all" | "forward") => {
    const replyTargets = m.replyTo.length ? m.replyTo : m.from;
    const me = (address ?? "").toLowerCase();
    const others = [...m.to, ...m.cc].filter((a) => a.address.toLowerCase() !== me && !replyTargets.some((r) => r.address === a.address));
    if (kind === "forward") {
      const head = `\n\n---------- Weitergeleitete Nachricht ----------\nVon: ${full(m.from)}\nDatum: ${longDate(m.date)}\nBetreff: ${m.subject}\nAn: ${full(m.to)}\n\n`;
      setDraft({ to: "", cc: "", bcc: "", subject: reSubject(m.subject, "forward"), text: head + m.text, note: m.attachments.length ? "Anhänge der Originalmail werden nicht mitgeschickt — bei Bedarf unten neu anhängen." : undefined });
    } else {
      setDraft({
        to: replyTargets.map((a) => a.address).join(", "),
        cc: kind === "all" ? others.map((a) => a.address).join(", ") : "",
        bcc: "",
        subject: reSubject(m.subject, "reply"),
        text: quote(m),
        replyUid: m.uid,
        replyFolder: m.folder,
      });
    }
    scrollTop();
  };

  const currentFolder = folders.find((f) => f.path === folder);

  if (!configured) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Title address={address} />
        <div style={{ ...glass, padding: "20px 24px", color: "rgba(255,255,255,0.85)", fontSize: 14 }}>
          Das Postfach ist noch nicht verbunden. In Render nötig: <strong>IMAP_HOST</strong> (imap.strato.de), <strong>IMAP_USER</strong> (info@vils17.at), <strong>IMAP_PASS</strong> und zum Senden <strong>SMTP_HOST</strong> (smtp.strato.de).
        </div>
      </div>
    );
  }

  // ─── Neue Mail / Antwort ────────────────────────────────────────────────────
  if (draft) return <Compose draft={draft} address={address} canSend={canSend} onCancel={() => setDraft(null)} onSent={(saved) => { setDraft(null); setToast(saved ? "Gesendet" : "Gesendet (nicht in „Gesendet“ abgelegt)"); if (open && draft.replyUid === open.uid) setOpen({ ...open, answered: true }); loadFolders(); if (folder !== "INBOX") loadList(1); }} />;

  // ─── Einzelne Mail ──────────────────────────────────────────────────────────
  if (open) {
    const hasRemote = open.html ? /<img[^>]+src=["']?https?:/i.test(open.html) : false;
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        {toast && <Toast text={toast} />}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => setOpen(null)}><ArrowLeft style={{ width: 16, height: 16 }} /> Zurück</button>
          <span style={{ flex: 1 }} />
          {canSend && <button style={primary} onClick={() => startReply(open, "reply")}><Reply style={{ width: 16, height: 16 }} /> Antworten</button>}
          {canSend && <button style={btn} onClick={() => startReply(open, "all")} title="Allen antworten"><ReplyAll style={{ width: 16, height: 16 }} /></button>}
          {canSend && <button style={btn} onClick={() => startReply(open, "forward")} title="Weiterleiten"><Forward style={{ width: 16, height: 16 }} /></button>}
        </div>
        {error && <ErrorBox text={error} />}
        <div style={{ ...glass, padding: "18px 20px" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 10, wordBreak: "break-word" }}>{open.subject || "(kein Betreff)"}</h1>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, wordBreak: "break-word" }}>
            <div><span style={{ color: muted }}>Von </span>{full(open.from)}</div>
            <div><span style={{ color: muted }}>An </span>{full(open.to)}</div>
            {open.cc.length > 0 && <div><span style={{ color: muted }}>Cc </span>{full(open.cc)}</div>}
            <div style={{ color: muted }}>{longDate(open.date)}{open.answered ? " · beantwortet" : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button style={btn} onClick={() => patch(open, { seen: false })}><MailOpen style={{ width: 15, height: 15 }} /> Ungelesen</button>
            <button style={btn} onClick={() => patch(open, { flagged: !open.flagged })}><Star style={{ width: 15, height: 15, fill: open.flagged ? "#fbbf24" : "none", color: open.flagged ? "#fbbf24" : undefined }} /> {open.flagged ? "Markiert" : "Markieren"}</button>
            {currentFolder?.specialUse === "\\Trash"
              ? <button style={btn} onClick={() => patch(open, { move: "inbox" })}><Inbox style={{ width: 15, height: 15 }} /> Zurück in Posteingang</button>
              : <button style={btn} onClick={() => patch(open, { move: "trash" })}><Trash2 style={{ width: 15, height: 15 }} /> Papierkorb</button>}
          </div>
        </div>

        {open.attachments.length > 0 && (
          <div style={{ ...glass, padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {open.attachments.map((a) => (
              <a key={a.index} href={`/api/mail/messages/${open.uid}/attachments/${a.index}?folder=${encodeURIComponent(open.folder)}`} style={{ ...btn, textDecoration: "none" }}>
                <Download style={{ width: 14, height: 14 }} /> {a.filename} <span style={{ color: muted, fontWeight: 400 }}>{kb(a.size)}</span>
              </a>
            ))}
          </div>
        )}

        {open.html && hasRemote && !images && (
          <button style={btn} onClick={() => setImages(true)}><ImageIcon style={{ width: 15, height: 15 }} /> Bilder laden</button>
        )}
        {open.html
          ? <HtmlBody html={open.html} images={images} />
          : <div style={{ ...glass, padding: "18px 20px", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, color: "rgba(255,255,255,0.92)", lineHeight: 1.55 }}>{open.text || "(leer)"}</div>}
      </div>
    );
  }

  // ─── Liste ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {toast && <Toast text={toast} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Title address={address} />
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={() => { loadFolders(); loadList(1); }} title="Aktualisieren"><RefreshCw style={{ width: 16, height: 16 }} className={loading ? "animate-spin" : ""} /></button>
        {canSend && <button style={primary} onClick={() => setDraft({ to: "", cc: "", bcc: "", subject: "", text: "" })}><PenSquare style={{ width: 16, height: 16 }} /> Neu</button>}
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {folders.map((f) => {
          const Icon = (f.specialUse && FOLDER_ICON[f.specialUse]) || Folder;
          const active = f.path === folder;
          return (
            <button key={f.path} onClick={() => { setFolder(f.path); setOpen(null); }} style={{ ...btn, flexShrink: 0, background: active ? "rgba(20,184,166,0.35)" : btn.background, borderColor: active ? "#14B8A6" : "rgba(255,255,255,0.18)" }}>
              <Icon style={{ width: 15, height: 15 }} /> {f.name}{f.unseen ? <span style={{ background: "#14B8A6", borderRadius: 999, padding: "0 7px", fontSize: 11 }}>{f.unseen}</span> : null}
            </button>
          );
        })}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }} style={{ position: "relative" }}>
        <Search style={{ position: "absolute", left: 12, top: 12, width: 16, height: 16, color: muted }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen (Absender, Betreff)" style={{ ...input, paddingLeft: 36, paddingRight: query ? 36 : 12 }} />
        {query && <button type="button" onClick={() => { setQ(""); setQuery(""); }} style={{ position: "absolute", right: 8, top: 8, background: "none", border: 0, color: muted, cursor: "pointer" }}><X style={{ width: 18, height: 18 }} /></button>}
      </form>

      {error && <ErrorBox text={error} />}

      <div style={{ ...glass, overflow: "hidden" }}>
        {items.length === 0 && !loading && <p style={{ padding: 20, fontSize: 14, color: muted }}>{query ? "Nichts gefunden." : "Keine Mails in diesem Ordner."}</p>}
        {items.map((m, i) => {
          const sent = currentFolder?.specialUse === "\\Sent" || currentFolder?.specialUse === "\\Drafts";
          const name = sent ? `An: ${person(m.to[0])}${m.to.length > 1 ? ` +${m.to.length - 1}` : ""}` : person(m.from[0]) || "(unbekannt)";
          return (
            <button key={`${m.folder}-${m.uid}`} onClick={() => openMail(m)} disabled={opening}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 16px", background: m.seen ? "transparent" : "rgba(20,184,166,0.10)", border: 0, borderTop: i ? "1px solid rgba(255,255,255,0.10)" : 0, color: "#fff", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!m.seen && <span style={{ width: 8, height: 8, borderRadius: 999, background: "#14B8A6", flexShrink: 0 }} />}
                <span style={{ fontSize: 14, fontWeight: m.seen ? 500 : 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                {m.flagged && <Star style={{ width: 14, height: 14, color: "#fbbf24", fill: "#fbbf24", flexShrink: 0 }} />}
                {m.hasAttachments && <Paperclip style={{ width: 14, height: 14, color: muted, flexShrink: 0 }} />}
                {m.answered && <Reply style={{ width: 14, height: 14, color: muted, flexShrink: 0 }} />}
                <span style={{ fontSize: 12, color: muted, flexShrink: 0 }}>{shortDate(m.date)}</span>
              </div>
              <div style={{ fontSize: 13, color: m.seen ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.92)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: m.seen ? 0 : 16 }}>{m.subject || "(kein Betreff)"}</div>
            </button>
          );
        })}
        {loading && <p style={{ padding: 16, fontSize: 13, color: muted }}>Lädt …</p>}
      </div>
      {!loading && items.length < total && (
        <button style={{ ...btn, width: "100%", justifyContent: "center" }} onClick={() => loadList(page + 1)}>Ältere laden ({total - items.length})</button>
      )}
    </div>
  );
}

function Title({ address }: { address: string | null }) {
  return (
    <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <Mail style={{ width: 20, height: 20, color: "#14B8A6", flexShrink: 0 }} /> Post
      {address && <span style={{ fontSize: 13, fontWeight: 500, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{address}</span>}
    </h1>
  );
}

function Toast({ text }: { text: string }) {
  return <div style={{ position: "fixed", left: "50%", bottom: 96, transform: "translateX(-50%)", background: "rgba(15,118,110,0.95)", color: "#fff", padding: "10px 16px", borderRadius: 14, fontSize: 14, fontWeight: 600, zIndex: 60 }}>{text}</div>;
}

function ErrorBox({ text }: { text: string }) {
  return <div style={{ padding: "10px 14px", borderRadius: 14, background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.45)", color: "#fecaca", fontSize: 13 }}>{text}</div>;
}

function Compose({ draft, address, canSend, onCancel, onSent }: { draft: Draft; address: string | null; canSend: boolean; onCancel: () => void; onSent: (savedToSent: boolean) => void }) {
  const [d, setD] = useState(draft);
  const [files, setFiles] = useState<File[]>([]);
  const [showBcc, setShowBcc] = useState(Boolean(draft.bcc));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Bei Antworten Cursor an den Anfang (über das Zitat)
    if (draft.replyUid && textRef.current) { textRef.current.focus(); textRef.current.setSelectionRange(0, 0); }
  }, [draft.replyUid]);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("to", d.to); fd.set("cc", d.cc); fd.set("bcc", d.bcc);
      fd.set("subject", d.subject); fd.set("text", d.text);
      if (d.replyUid) { fd.set("replyUid", String(d.replyUid)); fd.set("replyFolder", d.replyFolder ?? "INBOX"); }
      files.forEach((f) => fd.append("attachments", f));
      const r = await api<{ savedToSent: boolean }>("/api/mail/send", { method: "POST", body: fd });
      onSent(r.savedToSent);
    } catch (e) {
      setError((e as Error).message);
      setSending(false);
    }
  };

  const label = { fontSize: 12, color: muted, marginBottom: 4, display: "block" } as const;
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button style={btn} onClick={onCancel} disabled={sending}><X style={{ width: 16, height: 16 }} /> Verwerfen</button>
        <span style={{ flex: 1 }} />
        <button style={{ ...primary, opacity: sending || !canSend ? 0.6 : 1 }} onClick={send} disabled={sending || !canSend}><Send style={{ width: 16, height: 16 }} /> {sending ? "Sendet …" : "Senden"}</button>
      </div>
      {error && <ErrorBox text={error} />}
      {d.note && <div style={{ fontSize: 12, color: "#fcd34d" }}>{d.note}</div>}
      <div style={{ ...glass, padding: "16px 18px" }} className="space-y-3">
        <div style={{ fontSize: 12, color: muted }}>Von {address}</div>
        <div><label style={label}>An</label><input style={input} value={d.to} onChange={set("to")} placeholder="name@beispiel.at, …" inputMode="email" autoComplete="email" /></div>
        <div style={{ display: "grid", gridTemplateColumns: showBcc ? "1fr 1fr" : "1fr auto", gap: 8, alignItems: "end" }}>
          <div><label style={label}>Cc</label><input style={input} value={d.cc} onChange={set("cc")} inputMode="email" /></div>
          {showBcc
            ? <div><label style={label}>Bcc</label><input style={input} value={d.bcc} onChange={set("bcc")} inputMode="email" /></div>
            : <button type="button" style={btn} onClick={() => setShowBcc(true)}>Bcc</button>}
        </div>
        <div><label style={label}>Betreff</label><input style={input} value={d.subject} onChange={set("subject")} /></div>
        <div><textarea ref={textRef} style={{ ...input, minHeight: 280, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} value={d.text} onChange={set("text")} placeholder="Text …" /></div>
        <div>
          <label style={{ ...btn, display: "inline-flex" }}>
            <Paperclip style={{ width: 15, height: 15 }} /> Anhang
            <input type="file" multiple style={{ display: "none" }} onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
          </label>
          {files.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {files.map((f, i) => (
                <span key={i} style={{ ...btn, cursor: "default" }}>{f.name} <span style={{ color: muted, fontWeight: 400 }}>{kb(f.size)}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} style={{ background: "none", border: 0, color: muted, cursor: "pointer", padding: 0 }}><X style={{ width: 14, height: 14 }} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
