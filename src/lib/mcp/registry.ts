import type { ToolDef } from "./tool";
import { wohnungenList, buchungenList, anreisenAbreisen, belegung } from "./tools/bookings";
import { umsatz, ortstaxe, auszahlungenReinigung } from "./tools/finance";
import { reinigungen, syncStatus } from "./tools/cleaning";
import { reinigungZuweisen, buchungNotiz, gaestezahlKorrigieren, syncAusloesen } from "./tools/write";

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
  // Stufe 2 — schreiben (nur mit "bestaetigt": true)
  reinigungZuweisen,
  buchungNotiz,
  gaestezahlKorrigieren,
  syncAusloesen,
] as unknown as ToolDef[];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
