import type { ToolDef } from "./tool";
import { wohnungenList, buchungenList, gaestezahlOffen, anreisenAbreisen, belegung } from "./tools/bookings";
import { umsatz, ortstaxe, auszahlungenReinigung } from "./tools/finance";
import { reinigungen, syncStatus, wochenplan } from "./tools/cleaning";
import { reinigungZuweisen, buchungNotiz, gaestezahlKorrigieren, syncAusloesen, reinigungStatus, waescheStatus } from "./tools/write";
import { gaesteNachrichten, offeneGaestenachrichten, gastAntworten, gaestechatErledigt } from "./tools/guests";
import { hundeUebersicht, hundePruefen, hundeEintragen, hundegebuehrAnfordern, hundegebuehrStatus } from "./tools/pets";
import { postfach, mailLesen, mailSenden } from "./tools/mail";
import { maengel, mangelErfassen } from "./tools/issues";
import { hinweisVorschlaege, hinweisUebernehmen } from "./tools/hints";
import { pushStatus, pushTest, reinigungNachricht } from "./tools/push";
import { stammgaeste } from "./tools/regular-guests";
import { waescheBedarf, waescheBestandErfassen, waescheLieferungErfassen, waescheLieferungAngekommen, waescheReserve, waescheBetten } from "./tools/laundry";

/** Alle Tools der Schnittstelle. tools/list zeigt nur die, deren Scope das Token hat. */
export const TOOLS: ToolDef[] = [
  // Stufe 1 — lesen
  wohnungenList,
  buchungenList,
  gaestezahlOffen,
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
  maengel,
  hinweisVorschlaege,
  pushStatus,
  stammgaeste,
  // Stufe 2 — schreiben (nur mit "bestaetigt": true)
  reinigungZuweisen,
  pushTest,
  reinigungNachricht,
  buchungNotiz,
  gaestezahlKorrigieren,
  syncAusloesen,
  reinigungStatus,
  waescheStatus,
  gastAntworten,
  gaestechatErledigt,
  hundePruefen,
  hundeEintragen,
  hundegebuehrAnfordern,
  hundegebuehrStatus,
  waescheBestandErfassen,
  waescheLieferungErfassen,
  waescheLieferungAngekommen,
  waescheReserve,
  waescheBetten,
  mailSenden,
  mangelErfassen,
  hinweisUebernehmen,
] as unknown as ToolDef[];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
