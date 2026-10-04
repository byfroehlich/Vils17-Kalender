// Prüfung der Satzregeln (lib/rates.ts) — hier hängt Geld dran.
// Aufruf:  npm run test:rates

import { effectiveRate, isPremiumFor, premiumForNewBooking } from "../src/lib/rates";

let failed = 0;
let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.error(`  ✗ ${label}: erwartet ${JSON.stringify(expected)}, bekommen ${JSON.stringify(actual)}`);
  }
}

const VANESSA = "u_vanessa";
const KERSTIN = "u_kerstin";
const base = { cleanerRate: 50 };
const premiumBooking = { premiumRate: 70, premiumRateCleanerId: VANESSA };
const normalBooking = { premiumRate: null, premiumRateCleanerId: null };

console.log("Satz eines Auftrags");
check("Vanessa reinigt 70-€-Buchung → 70",
  effectiveRate({ cleanerId: VANESSA, cleaner: base, booking: premiumBooking }), 70);
check("Kerstin vertritt bei 70-€-Buchung → ihr eigener Satz",
  effectiveRate({ cleanerId: KERSTIN, cleaner: base, booking: premiumBooking }), 50);
check("Vertretung mit anderem Grundsatz → deren Satz",
  effectiveRate({ cleanerId: KERSTIN, cleaner: { cleanerRate: 55 }, booking: premiumBooking }), 55);
check("Vanessa reinigt alte Buchung → 50",
  effectiveRate({ cleanerId: VANESSA, cleaner: base, booking: normalBooking }), 50);
check("festgeschriebener Satz gewinnt immer",
  effectiveRate({ rate: 50, cleanerId: VANESSA, cleaner: base, booking: premiumBooking }), 50);
check("festgeschrieben 70 bleibt, auch wenn Grundsatz später steigt",
  effectiveRate({ rate: 70, cleanerId: VANESSA, cleaner: { cleanerRate: 80 }, booking: premiumBooking }), 70);
check("niemand zugewiesen → Grundsatz-Fallback",
  effectiveRate({ cleanerId: null, cleaner: null, booking: premiumBooking }), 50);

console.log("Markierung");
check("70-€-Buchung für Vanessa", isPremiumFor(premiumBooking, VANESSA), true);
check("nicht für Kerstin", isPremiumFor(premiumBooking, KERSTIN), false);
check("normale Buchung", isPremiumFor(normalBooking, VANESSA), false);

console.log("Vermerk bei neuer Buchung");
const from = new Date("2026-10-03T22:00:00Z"); // 04.10. 00:00 Wien
const penthouse = { cleaningRate: 70, cleaningRateFrom: from, cleaningRateCleanerId: VANESSA };
check("nach Stichtag → Vermerk",
  premiumForNewBooking(penthouse, new Date("2026-10-04T06:00:00Z")),
  { premiumRate: 70, premiumRateCleanerId: VANESSA });
check("vor Stichtag → kein Vermerk",
  premiumForNewBooking(penthouse, new Date("2026-10-03T21:59:00Z")), {});
check("Wohnung ohne Sondersatz → kein Vermerk",
  premiumForNewBooking({ cleaningRate: null, cleaningRateFrom: null, cleaningRateCleanerId: null }), {});
check("Sondersatz ohne Reinigungskraft → kein Vermerk",
  premiumForNewBooking({ cleaningRate: 70, cleaningRateFrom: from, cleaningRateCleanerId: null }), {});
check("Sondersatz 0 € wird respektiert (kein Falsy-Fehler)",
  premiumForNewBooking({ cleaningRate: 0, cleaningRateFrom: from, cleaningRateCleanerId: VANESSA }, new Date("2026-10-05T00:00:00Z")),
  { premiumRate: 0, premiumRateCleanerId: VANESSA });

console.log(`\n${passed} Prüfungen bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed > 0 ? 1 : 0);
