// ─── Sonderwünsche im Gästechat erkennen ──────────────────────────────────────
// Entscheidung Mathias 31.10.2026: Hinweise für die Reinigung nicht von Hand pflegen, sondern aus
// den Gästechats (Smoobu) vorschlagen lassen. Erkannt wird nur, was hier steht — Liste bei Bedarf
// erweitern (und tests/hinweise.test.ts ergänzen). Reine Funktionen, testbar.

export interface SpecialRequestRule {
  /** Text, der im Hinweis für die Reinigung erscheint */
  label: string;
  /** Wortstämme/Ausdrücke (DE + EN), Groß-/Kleinschreibung egal */
  patterns: RegExp[];
  /** Zusätzliche Betten für die Wäscheplanung, wenn erkannt */
  extraBeds?: number;
}

export const SPECIAL_REQUEST_RULES: SpecialRequestRule[] = [
  { label: "Kinderbett", patterns: [/\b(?:kinder|baby|reise)bett(?:chen)?\b/i, /\bgitterbett\b/i, /\b(?:cot|crib|baby\s*bed|travel\s*cot|pack\s*(?:'?n'?|and)\s*play)\b/i] },
  { label: "Hochstuhl", patterns: [/\b(?:hochstuhl|kinderstuhl|babystuhl)\b/i, /\bhigh\s*chair\b/i] },
  { label: "Zustellbett", extraBeds: 1, patterns: [/\b(?:zustell|extra|zusatz|klapp|beistell)bett\b/i, /\b(?:extra|additional|rollaway|spare)\s+bed\b/i] },
  { label: "Sofa als Bett", extraBeds: 1, patterns: [/\b(?:sofa|couch)\s*(?:als|zum)\s*(?:bett|schlafen)\b/i, /\b(?:schlaf(?:sofa|couch))\b/i, /\b(?:sofa\s*bed|couch\s*as\s*(?:a\s*)?bed|sleep(?:ing)?\s+on\s+the\s+(?:sofa|couch))\b/i] },
  { label: "Getrennt schlafen (beide Schlafzimmer)", patterns: [/\bbeide(?:n)?\s+schlafzimmer(?:n)?\b/i, /\bgetrennt(?:e|en)?\b/i, /\bseparate\s+(?:bed)?rooms?\b/i, /\b(?:both|two)\s+bedrooms\b/i, /\b(?:separate|twin|single)\s+beds\b/i, /\bsleep\s+separately\b/i, /\bseparately\b/i] },
  { label: "Früher Check-in", patterns: [/\bfr[üu]h(?:er|ere[nr]?)?\s+(?:anreise|anreisen|ankommen|einchecken|check-?in)\b/i, /\bfr[üu]her\s+(?:da|kommen)\b/i, /\bearly\s+(?:check-?in|arrival)\b/i, /\barrive\s+early\b/i] },
  { label: "Später Check-out", patterns: [/\bsp[äa]te(?:r|re[nr]?)?\s+(?:abreise|abreisen|auschecken|check-?out)\b/i, /\blate\s+check-?out\b/i, /\bleave\s+later\b/i] },
];

const NEGATION = /\b(?:kein(?:e|en|er)?|nicht|ohne|no|not|without|don'?t\s+need|brauchen\s+kein)\b/i;

export interface SpecialRequestMatch {
  labels: string[];
  extraBeds: number;
  /** Auszug rund um die erste Fundstelle, höchstens 200 Zeichen */
  excerpt: string;
}

function excerptAround(text: string, index: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 110);
  const s = `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
  return s.length > 200 ? `${s.slice(0, 199)}…` : s;
}

/**
 * Erkennt Sonderwünsche in einer Gästenachricht. Fundstellen mit Verneinung direkt davor
 * („wir brauchen kein Kinderbett“, „no crib needed“) zählen nicht. null = nichts erkannt.
 */
export function detectSpecialRequests(text: string | null | undefined): SpecialRequestMatch | null {
  if (!text) return null;
  const t = text.normalize("NFC");
  const labels: string[] = [];
  let extraBeds = 0;
  let first = -1;
  for (const rule of SPECIAL_REQUEST_RULES) {
    for (const re of rule.patterns) {
      const m = re.exec(t);
      if (!m) continue;
      // Verneinung in den 25 Zeichen davor (gleicher Satz)
      const before = t.slice(Math.max(0, m.index - 25), m.index).split(/[.!?\n]/).pop() ?? "";
      if (NEGATION.test(before)) continue;
      labels.push(rule.label);
      extraBeds = Math.max(extraBeds, rule.extraBeds ?? 0);
      if (first < 0 || m.index < first) first = m.index;
      break;
    }
  }
  if (!labels.length) return null;
  return { labels, extraBeds: Math.min(3, extraBeds), excerpt: excerptAround(t, first) };
}
