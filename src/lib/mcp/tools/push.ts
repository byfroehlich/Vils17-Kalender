import { z } from "zod";
import { prisma } from "../../prisma";
import { defineTool, preview, bestaetigtSchema } from "../tool";
import { viennaIso } from "../format";
import { pushDiagnostics, sendPushToUsers } from "../../push";

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
