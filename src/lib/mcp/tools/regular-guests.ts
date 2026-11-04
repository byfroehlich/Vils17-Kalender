import { z } from "zod";
import { defineTool } from "../tool";
import { pagingFields, paging, page } from "../shared";
import { viennaIso } from "../format";
import { prisma } from "../../prisma";
import { unsubscribeUrl } from "../../regular-guests";

// ─── Stammgast-Liste (nur lesen) ──────────────────────────────────────────────
// Eintragung läuft ausschließlich über das Formular auf vils17.at/stammgast/ —
// mit Einwilligung des Gastes. Kein Anlegen, Ändern oder Löschen über MCP.

const WOHNUNG: Record<string, string> = { penthouse: "Penthouse No. 17", lodge: "Lodge No. 17" };

export const stammgaeste = defineTool({
  name: "stammgaeste",
  title: "Stammgast-Liste",
  description:
    "Gäste, die sich über den QR-Code in der Gästemappe (vils17.at/stammgast/) freiwillig in die eigene Stammgast-Liste eingetragen haben — " +
    "mit Name, E-Mail, Telefon, Wohnung und Einwilligung je Kanal (E-Mail / WhatsApp). Angebote nur über die Kanäle schicken, für die eine Einwilligung vorliegt. " +
    "abmelde_link gehört in jede Nachricht mit Angeboten. Abgemeldete Gäste erscheinen nur mit abgemeldete: true und dürfen nicht mehr angeschrieben werden.",
  scope: "messages:read",
  input: {
    abgemeldete: z.boolean().optional().describe("true = auch abgemeldete Gäste zeigen (gekennzeichnet)"),
    ...pagingFields,
  },
  async handler(args, ctx) {
    const { take, skip } = paging(args);
    const rows = await prisma.regularGuest.findMany({
      where: { organizationId: ctx.organizationId, ...(args.abgemeldete ? {} : { unsubscribedAt: null }) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: take + 1,
      skip,
    });
    const aktiv = await prisma.regularGuest.count({ where: { organizationId: ctx.organizationId, unsubscribedAt: null } });
    return {
      aktiv_gesamt: aktiv,
      ...page(
        rows.map((g) => ({
          id: g.id,
          name: g.name,
          email: g.email,
          telefon: g.phone,
          wohnung: g.apartment ? WOHNUNG[g.apartment] ?? g.apartment : null,
          einwilligung_email: g.consentEmail,
          einwilligung_whatsapp: g.consentWhatsapp,
          einwilligung_am: viennaIso(g.consentAt),
          eingetragen_am: viennaIso(g.createdAt),
          quelle: g.source,
          ...(g.unsubscribedAt ? {} : { abmelde_link: unsubscribeUrl(g.unsubscribeToken) }),
          ...(g.unsubscribedAt ? { abgemeldet_am: viennaIso(g.unsubscribedAt) } : {}),
        })),
        take,
        skip
      ),
    };
  },
});
