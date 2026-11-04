import { z } from "zod";
import { prisma } from "../../prisma";
import { defineTool, preview, bestaetigtSchema } from "../tool";
import { viennaIso } from "../format";
import { pushDiagnostics, sendPushToUsers, listPushLog } from "../../push";

// ─── Push-Diagnose ────────────────────────────────────────────────────────────
// Anlass 31.10.2026: Mathias hat nie eine Push-Nachricht bekommen. Ohne Server-Logs muss sichtbar sein,
// ob Push eingerichtet ist, welche Geräte angemeldet sind und woran ein Versand scheitert.

export const pushStatus = defineTool({
  name: "push_status",
  title: "Push-Benachrichtigungen: Diagnose",
  description:
    "Zeigt, ob Push eingerichtet ist (VAPID-Schlüssel), wie viele Geräte je Benutzer angemeldet sind (Dienst, z. B. web.push.apple.com) " +
    "und das letzte Versandergebnis bzw. den letzten Fehler seit dem Start des Dienstes. Keine Geräteadressen im Klartext.",
  scope: "bookings:read",
  input: {},
  async handler(_args, ctx) {
    const d = await pushDiagnostics(ctx.organizationId);
    return {
      eingerichtet: d.configured,
      fehler_einrichtung: d.initError,
      oeffentlicher_schluessel: d.publicKeySet,
      privater_schluessel: d.privateKeySet,
      absender: d.subject,
      benutzer: d.users.map((u) => ({
        name: u.name, rolle: u.role, aktiv: u.active, geraete: u.devices, dienste: u.services, zuletzt_angemeldet: viennaIso(u.newest),
      })),
      letzter_versand: d.lastSend ? { ...d.lastSend, at: viennaIso(d.lastSend.at) } : null,
      letzter_fehler: d.lastFailure ? { ...d.lastFailure, at: viennaIso(d.lastFailure.at) } : null,
    };
  },
});

export const pushTest = defineTool({
  name: "push_test",
  title: "Push-Testnachricht an Admin/Verwaltung",
  description:
    "Schickt eine Testnachricht an alle angemeldeten Geräte der aktiven Admins/Verwaltung und meldet das Ergebnis " +
    "(Geräte, gesendet, fehlgeschlagen, abgelaufen entfernt). Erst ohne bestaetigt (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: { bestaetigt: bestaetigtSchema },
  async handler(args, ctx) {
    const users = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, active: true, role: { in: ["ADMIN", "MANAGER"] } },
      select: { id: true, name: true },
    });
    if (!args.bestaetigt) {
      return preview(`Testnachricht an ${users.length} Person(en) senden: ${users.map((u) => u.name).join(", ")}.`);
    }
    const r = await sendPushToUsers(users.map((u) => u.id), {
      title: "🔔 Vils17 – Test",
      body: "Push-Benachrichtigungen funktionieren.",
      url: "/dashboard",
    });
    const d = await pushDiagnostics(ctx.organizationId);
    return {
      nicht_eingerichtet: r.notConfigured,
      fehler_einrichtung: d.initError,
      geraete: r.devices, gesendet: r.sent, fehlgeschlagen: r.failed, abgelaufen_entfernt: r.removed,
      letzter_fehler: d.lastFailure ? { ...d.lastFailure, at: viennaIso(d.lastFailure.at) } : null,
    };
  },
});

// Entscheidung Mathias 31.10.2026: Reinigungskräften kurze Nachrichten aufs Handy schicken (Push),
// z. B. „Bitte schon morgen reinigen“. Kommt nur an, wenn die Person die App installiert und
// Benachrichtigungen eingeschaltet hat — die Antwort sagt, ob ein Gerät angemeldet war.
export const reinigungNachricht = defineTool({
  name: "reinigung_push",
  title: "Push-Nachricht an eine Reinigungskraft",
  description:
    "Schickt einer Reinigungskraft eine kurze Push-Nachricht auf ihre angemeldeten Geräte (installierte App mit eingeschalteten Benachrichtigungen). " +
    "Optional mit Link auf eine Buchung. Meldet, wie viele Geräte erreicht wurden. Erst ohne bestaetigt (Vorschau mit Text), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: {
    reinigungskraft: z.string().trim().min(1).describe("ID oder Name (Teil) der Reinigungskraft, z.B. \"Kerstin\""),
    text: z.string().trim().min(1).max(500),
    buchung_id: z.string().min(1).optional().describe("Optional: Buchung, die beim Tippen geöffnet wird"),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const q = args.reinigungskraft;
    const users = await prisma.user.findMany({
      where: {
        organizationId: ctx.organizationId, active: true, role: "CLEANER",
        OR: [{ id: q }, { name: { contains: q, mode: "insensitive" } }],
      },
      select: { id: true, name: true, _count: { select: { pushSubscriptions: true } } },
    });
    if (users.length !== 1) {
      return { fehler: users.length === 0 ? "Keine passende Reinigungskraft gefunden." : `Mehrdeutig: ${users.map((u) => u.name.trim()).join(", ")}` };
    }
    const u = users[0]!;
    let url = "/my-jobs";
    if (args.buchung_id) {
      const b = await prisma.booking.findFirst({ where: { id: args.buchung_id, organizationId: ctx.organizationId }, select: { id: true } });
      if (!b) return { fehler: "Buchung nicht gefunden." };
      url = `/my-jobs/list`;
    }
    if (!args.bestaetigt) {
      return preview(`Push an ${u.name.trim()} (${u._count.pushSubscriptions} Gerät(e) angemeldet): „${args.text}“`);
    }
    const r = await sendPushToUsers([u.id], { title: "🧹 Vils17 – Nachricht", body: args.text, url });
    return {
      ausgefuehrt: true, an: u.name.trim(), geraete: r.devices, gesendet: r.sent, fehlgeschlagen: r.failed,
      hinweis: r.devices === 0 ? "Kein Gerät angemeldet – Nachricht kam nicht an. App installieren und Glocke einschalten." : null,
    };
  },
});

export const pushProtokoll = defineTool({
  name: "push_protokoll",
  title: "Push-Versandprotokoll",
  description:
    "Wer wann welche Push-Benachrichtigung bekommen hat (nur Titel) und ob der Push-Dienst sie angenommen hat: Geräte, gesendet, fehlgeschlagen, abgelaufen. " +
    "„Angenommen“ heißt: Apple/Google hat sie zur Zustellung übernommen — ob sie auf dem Handy angezeigt wurde, meldet kein Dienst zurück. Neueste zuerst.",
  scope: "bookings:read",
  input: {
    person: z.string().trim().min(1).optional().describe("Name (Teil) einer Person, z.B. \"Vanessa\""),
    limit: z.number().int().min(1).max(200).optional(),
  },
  async handler(args, ctx) {
    let userId: string | undefined;
    if (args.person) {
      const u = await prisma.user.findFirst({
        where: { organizationId: ctx.organizationId, name: { contains: args.person, mode: "insensitive" } },
        select: { id: true },
      });
      if (!u) return { fehler: "Person nicht gefunden." };
      userId = u.id;
    }
    const rows = await listPushLog(ctx.organizationId, { ...(userId ? { userId } : {}), limit: args.limit ?? 30 });
    return {
      eintraege: rows.map((r) => ({
        zeit: viennaIso(r.createdAt), an: r.userName, titel: r.title,
        geraete: r.devices, angenommen: r.sent, fehlgeschlagen: r.failed, abgelaufen_entfernt: r.removed, hinweis: r.error,
      })),
      hinweis: "Protokoll seit 01.11.2026. Ältere Versände sind nicht gespeichert.",
    };
  },
});
