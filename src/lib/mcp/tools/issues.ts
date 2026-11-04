import { z } from "zod";
import { defineTool, preview, bestaetigtSchema, ToolError } from "../tool";
import { resolveApartmentId, wohnungFilter } from "../shared";
import { listIssues, createIssue, setIssueDone, IssueError } from "../../issues";
import { prisma } from "../../prisma";

// ─── Mängel & Einkauf ─────────────────────────────────────────────────────────

export const maengel = defineTool({
  name: "maengel",
  title: "Mängel und Einkaufsliste",
  description:
    "Offene Schäden/Mängel am Inventar und Verbrauchsmaterial zum Nachkaufen — gemeldet von der Reinigung beim „Erledigt“ oder von Hand erfasst. " +
    "Bei Schäden mit dem Aufenthalt davor (möglicher Verursacher) und bei Airbnb der Frist, bis wann der Gast angeschrieben werden muss (14 Tage nach Abreise).",
  scope: "cleaning:read",
  input: { erledigte: z.boolean().optional().describe("true = auch zuletzt erledigte zeigen") },
  async handler(args, ctx) {
    const open = await listIssues(ctx.organizationId, { open: true });
    const done = args.erledigte ? await listIssues(ctx.organizationId, { open: false, limit: 30 }) : [];
    const view = (i: (typeof open)[number]) => ({
      id: i.id, art: i.kind === "DAMAGE" ? "Schaden" : "Nachkaufen", wohnung: i.apartment, text: i.text,
      gemeldet_am: i.createdAt.toISOString().slice(0, 10), gemeldet_von: i.reportedBy, foto: i.hasPhoto,
      aufenthalt_davor: i.previous, airbnb_frist: i.claimDeadline, ...(i.done ? { erledigt_am: i.doneAt?.toISOString().slice(0, 10), notiz: i.doneNote } : {}),
    });
    return { offen: open.map(view), ...(args.erledigte ? { erledigt: done.map(view) } : {}) };
  },
});

export const mangelErfassen = defineTool({
  name: "mangel_erfassen",
  title: "Mangel oder Einkauf eintragen",
  description: "Trägt einen Schaden/Mangel oder etwas zum Nachkaufen für eine Wohnung ein, oder markiert einen Eintrag als erledigt (id + erledigt). Erst ohne bestaetigt (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: {
    wohnung: wohnungFilter,
    art: z.enum(["schaden", "nachkaufen"]).optional(),
    text: z.string().trim().min(1).max(1000).optional(),
    id: z.string().min(1).optional().describe("Bestehender Eintrag — zum Erledigen"),
    erledigt: z.boolean().optional(),
    notiz: z.string().trim().max(500).optional(),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    try {
      if (args.id) {
        const done = args.erledigt ?? true;
        if (!args.bestaetigt) return preview(`Eintrag ${args.id} als ${done ? "erledigt" : "wieder offen"} markieren.`);
        await setIssueDone({ organizationId: ctx.organizationId, id: args.id, done, note: args.notiz ?? null, actor: {} });
        return { ausgefuehrt: true, id: args.id, erledigt: done };
      }
      if (!args.art || !args.text) throw new ToolError("art und text angeben (oder id zum Erledigen).");
      const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);
      if (!apartmentId) throw new ToolError("Wohnung angeben.");
      const apt = await prisma.apartment.findFirst({ where: { id: apartmentId }, select: { name: true } });
      const kind = args.art === "schaden" ? "DAMAGE" : "SUPPLY";
      if (!args.bestaetigt) return preview(`${args.art === "schaden" ? "Schaden" : "Nachkaufen"} für ${apt?.name}: „${args.text}“ eintragen.`);
      const issue = await createIssue({ organizationId: ctx.organizationId, apartmentId, kind, text: args.text, actor: { name: `Claude (${ctx.tokenName})` } });
      return { ausgefuehrt: true, id: issue.id };
    } catch (e) {
      if (e instanceof IssueError) throw new ToolError(e.message);
      throw e;
    }
  },
});
