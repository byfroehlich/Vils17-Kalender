import type { ToolDef } from "./tool";
import { wohnungenList, buchungenList, anreisenAbreisen, belegung } from "./tools/bookings";
import { umsatz, ortstaxe, auszahlungenReinigung } from "./tools/finance";
import { reinigungen, syncStatus, wochenplan } from "./tools/cleaning";
import { reinigungZuweisen, buchungNotiz, gaestezahlKorrigieren, syncAusloesen, reinigungStatus, waescheStatus } from "./tools/write";
import { gaesteNachrichten, offeneGaestenachrichten, gastAntworten } from "./tools/guests";
import { hundeUebersicht, hundePruefen, hundeEintragen, hundegebuehrAnfordern, hundegebuehrStatus } from "./tools/pets";
import { postfach, mailLesen, mailSenden } from "./tools/mail";
import { waescheBedarf, waescheBestandErfassen, waescheLieferungErfassen, waescheReserve, waescheBetten } from "./tools/laundry";

/** Alle Tools der Schnittstelle. tools/list zeigt nur die, deren Scope das Token hat. */
export const TOOLS: ToolDef[] = [
  // Stufe 1 — lesen
  wohnungenList,
  buchungenList,
  anreisenAbreisen,
  belegung,
  reinigungen,
  umsatz,
  ortstaxe,
  auszahlungenReinigung,
  syncStatus,
  wochenplan,
  gaesteNachrichten,
  offeneGaestenachrichten,
  hundeUebersicht,
  waescheBedarf,
  postfach,
  mailLesen,
  // Stufe 2 — schreiben (nur mit "bestaetigt": true)
  reinigungZuweisen,
  buchungNotiz,
  gaestezahlKorrigieren,
  syncAusloesen,
  reinigungStatus,
  waescheStatus,
  gastAntworten,
  hundePruefen,
  hundeEintragen,
  hundegebuehrAnfordern,
  hundegebuehrStatus,
  waescheBestandErfassen,
  waescheLieferungErfassen,
  waescheReserve,
  waescheBetten,
  mailSenden,
] as unknown as ToolDef[];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
