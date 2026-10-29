import { z } from "zod";
import { prisma } from "../../prisma";
import { defineTool, preview, bestaetigtSchema, ToolError, type ToolContext } from "../tool";
import { day, viennaIso, minutesSince } from "../format";
import { assignCleaner, setAssignmentNotes, setGuestCount, ActionError } from "../../booking-actions";
import { runAutoSync, AUTO_SYNC_MAX_AGE_MS } from "../../sync-runner";

// ─── Stufe 2: schreibende Tools ───────────────────────────────────────────────
// Ohne "bestaetigt": true liefern alle nur eine Vorschau und ändern nichts.
// Kein Löschen, keine Preise, keine Änderungen an Smoobu, keine Gästenachrichten.

const buchungId = z.string().min(1).describe("ID der Buchung (aus buchungen_list, anreisen_abreisen oder reinigungen)");

const via = (ctx: ToolContext) => ({ via: `mcp:${ctx.tokenName}` });

/** ActionError aus den gemeinsamen Funktionen → verständliche Tool-Fehler */
async function act<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ActionError) throw new ToolError(err.message);
    throw err;
  }
}

async function loadBooking(ctx: ToolContext, id: string) {
  const b = await prisma.booking.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      apartment: { select: { name: true } },
      cleaningAssignment: { include: { cleaner: { select: { name: true } }, declinedBy: { select: { name: true } } } },
    },
  });
  if (!b) throw new ToolError(`Buchung ${id} nicht gefunden`);
  return b;
}

function describeBooking(b: Awaited<ReturnType<typeof loadBooking>>) {
  return `${b.apartment.name}, Reinigung am ${day(b.checkIn)} (Anreise ${b.guestName}, ${b.guestCount} Gäste)`;
}

function describeCleaning(b: Awaited<ReturnType<typeof loadBooking>>) {
  const a = b.cleaningAssignment;
  if (!a) return "noch kein Reinigungsauftrag";
  if (a.isSelfClean || a.status === "SELF_CLEAN") return "Selbstreinigung";
  if (a.cleanerUnavailable) return `offen — abgesagt von ${a.cleaner?.name ?? a.declinedBy?.name ?? "?"}`;
  if (a.status === "ASSIGNED") return `zugewiesen an ${a.cleaner?.name ?? "?"}`;
  if (a.status === "COMPLETED") return `erledigt von ${a.cleaner?.name ?? "?"}`;
  return "offen";
}

// ─── reinigung_zuweisen ───────────────────────────────────────────────────────

export const reinigungZuweisen = defineTool({
  name: "reinigung_zuweisen",
  title: "Reinigung zuweisen",
  description:
    "Weist die Reinigung einer Buchung einer Reinigungskraft zu — gleiche Logik wie „Zuweisung ändern“ in der App, inklusive " +
    "Benachrichtigung (Push, und E-Mail/WhatsApp falls eingerichtet). Erst OHNE bestaetigt aufrufen, Mathias die Vorschau zeigen, " +
    "nach seiner Zustimmung mit bestaetigt: true ausführen.",
  scope: "cleaning:write",
  write: true,
  input: {
    buchung_id: buchungId,
    reinigungskraft: z.string().min(1).describe("ID oder Name (Teil) der Reinigungskraft, z.B. \"Kerstin\""),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const b = await loadBooking(ctx, args.buchung_id);
    const cleaners = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, role: "CLEANER", active: true },
      select: { id: true, name: true },
    });
    const hits = cleaners.filter((c) => c.id === args.reinigungskraft || c.name.toLowerCase().includes(args.reinigungskraft.toLowerCase()));
    if (hits.length !== 1) {
      throw new ToolError(
        `${hits.length ? "Mehrdeutig" : "Nicht gefunden"}: "${args.reinigungskraft}". Aktive Reinigungskräfte: ${cleaners.map((c) => c.name).join(", ")}`
      );
    }
    const cleaner = hits[0];
    const vorher = describeCleaning(b);

    if (b.cleaningAssignment?.cleanerId === cleaner.id && b.cleaningAssignment.status === "ASSIGNED" && !b.cleaningAssignment.cleanerUnavailable) {
      return { ausgefuehrt: false, unveraendert: true, hinweis: `${cleaner.name} ist bereits zugewiesen.`, buchung: describeBooking(b) };
    }

    if (!args.bestaetigt) {
      return preview(`${describeBooking(b)}: ${vorher} → ${cleaner.name}. ${cleaner.name} wird benachrichtigt.`, {
        buchung_id: b.id,
        vorher,
        nachher: `zugewiesen an ${cleaner.name}`,
      });
    }

    const r = await act(() =>
      assignCleaner({ organizationId: ctx.organizationId, bookingId: b.id, cleanerId: cleaner.id, actor: via(ctx) })
    );
    return {
      ausgefuehrt: true,
      buchung: describeBooking(b),
      vorher,
      nachher: r.status === "COMPLETED" ? `erledigt, jetzt ${cleaner.name} zugeordnet` : `zugewiesen an ${cleaner.name}`,
      benachrichtigt: r.notified,
    };
  },
});

// ─── buchung_notiz ────────────────────────────────────────────────────────────

export const buchungNotiz = defineTool({
  name: "buchung_notiz",
  title: "Notiz für die Reinigung",
  description:
    "Setzt die Notiz zum Reinigungsauftrag einer Buchung (sieht die Reinigungskraft in ihrer App, z.B. „Kinderbett aufbauen“). " +
    "Ersetzt die bisherige Notiz; leerer Text entfernt sie. Erst ohne bestaetigt aufrufen (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: {
    buchung_id: buchungId,
    notiz: z.string().max(1000).describe("Neuer Notiztext (leer = Notiz entfernen)"),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const b = await loadBooking(ctx, args.buchung_id);
    if (!b.cleaningAssignment) throw new ToolError("Zu dieser Buchung gibt es keinen Reinigungsauftrag");
    const vorher = b.cleaningAssignment.notes;
    const nachher = args.notiz.trim() || null;

    if (vorher === nachher) return { ausgefuehrt: false, unveraendert: true, notiz: vorher };

    if (!args.bestaetigt) {
      return preview(
        nachher ? `Notiz für ${describeBooking(b)} setzen.` : `Notiz für ${describeBooking(b)} entfernen.`,
        { buchung_id: b.id, notiz_vorher: vorher, notiz_nachher: nachher }
      );
    }

    await act(() => setAssignmentNotes({ organizationId: ctx.organizationId, bookingId: b.id, notes: args.notiz, actor: via(ctx) }));
    return { ausgefuehrt: true, buchung: describeBooking(b), notiz_vorher: vorher, notiz_nachher: nachher };
  },
});

// ─── gaestezahl_korrigieren ───────────────────────────────────────────────────

export const gaestezahlKorrigieren = defineTool({
  name: "gaestezahl_korrigieren",
  title: "Gästezahl korrigieren",
  description:
    "Korrigiert die Gästezahl einer Buchung von Hand, wenn Smoobu sie falsch oder gar nicht liefert (z.B. Booking.com). " +
    "Die Korrektur bleibt bestehen — Sync und Mail-Import überschreiben sie nicht; Wäschemengen rechnen dann damit. " +
    "gaeste: null hebt die Korrektur auf. Erst ohne bestaetigt aufrufen (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: {
    buchung_id: buchungId,
    gaeste: z.number().int().min(1).max(99).nullable().describe("Richtige Anzahl Gäste, oder null = Korrektur aufheben"),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const b = await loadBooking(ctx, args.buchung_id);
    if (args.gaeste !== null && b.guestCount === args.gaeste && b.guestCountManual) {
      return { ausgefuehrt: false, unveraendert: true, gaeste: b.guestCount };
    }
    if (args.gaeste === null && !b.guestCountManual) {
      return { ausgefuehrt: false, unveraendert: true, hinweis: "Die Gästezahl ist nicht von Hand korrigiert." };
    }

    const was =
      args.gaeste === null
        ? `Korrektur der Gästezahl bei ${b.apartment.name} (${b.guestName}, Anreise ${day(b.checkIn)}) aufheben — der nächste Sync setzt wieder den Wert aus Smoobu.`
        : `Gästezahl bei ${b.apartment.name} (${b.guestName}, Anreise ${day(b.checkIn)}): ${b.guestCount} → ${args.gaeste}.`;

    if (!args.bestaetigt) return preview(was, { buchung_id: b.id, vorher: b.guestCount, nachher: args.gaeste });

    const r = await act(() => setGuestCount({ organizationId: ctx.organizationId, bookingId: b.id, guestCount: args.gaeste, actor: via(ctx) }));
    return { ausgefuehrt: true, was, gaeste: r.booking.guestCount, von_hand_korrigiert: r.booking.guestCountManual };
  },
});

// ─── sync_ausloesen ───────────────────────────────────────────────────────────

export const syncAusloesen = defineTool({
  name: "sync_ausloesen",
  title: "Smoobu-Sync auslösen",
  description:
    "Holt die Buchungen neu aus Smoobu — wie die App beim Öffnen: nur wenn der letzte Abgleich älter als 10 Minuten ist " +
    "(erzwingen: true ignoriert das). Danach werden Warnungen geprüft. Ändert nichts an Smoobu. " +
    "Erst ohne bestaetigt aufrufen (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: {
    erzwingen: z.boolean().optional().describe("Auch synchronisieren, wenn der letzte Abgleich jünger als 10 Minuten ist"),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const org = await prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { lastSyncAt: true } });
    const age = minutesSince(org?.lastSyncAt ?? null);
    const due = args.erzwingen || age === null || age * 60_000 >= AUTO_SYNC_MAX_AGE_MS;

    if (!args.bestaetigt) {
      return preview(
        due
          ? `Buchungen aus Smoobu neu abholen (letzter Abgleich ${age === null ? "unbekannt" : `vor ${age} Min`}).`
          : `Nichts zu tun: letzter Abgleich vor ${age} Min (unter 10 Min). Mit erzwingen: true trotzdem synchronisieren.`,
        { letzter_sync: viennaIso(org?.lastSyncAt) }
      );
    }

    const before = await prisma.booking.count({ where: { organizationId: ctx.organizationId } });
    const r = await runAutoSync(ctx.organizationId, !!args.erzwingen);
    const after = await prisma.booking.count({ where: { organizationId: ctx.organizationId } });
    return {
      ausgefuehrt: r.synced,
      ...(r.synced ? {} : { hinweis: "Nicht synchronisiert — letzter Abgleich jünger als 10 Minuten." }),
      letzter_sync: viennaIso(r.lastSyncAt),
      neue_buchungen: Math.max(0, after - before),
    };
  },
});
