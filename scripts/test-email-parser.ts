// Prüfung der Portal-Mail-Parser gegen realistische Mailtexte.
// Aufruf:  npx tsx scripts/test-email-parser.ts
// Kein Test-Framework nötig — die Parser sind reine Funktionen.

import { parsePortalMail, htmlToText } from "../src/lib/email-import/parse";

let failed = 0;
let passed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = actual instanceof Date ? actual.toISOString().slice(0, 10) : actual;
  const e = expected instanceof Date ? expected.toISOString().slice(0, 10) : expected;
  if (JSON.stringify(a) === JSON.stringify(e)) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${label}: erwartet ${JSON.stringify(e)}, bekommen ${JSON.stringify(a)}`);
  }
}

function run(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ─── Booking.com, deutsch ─────────────────────────────────────────────────────
run("Booking.com · deutsch", () => {
  const mail = parsePortalMail({
    from: "noreply@booking.com",
    subject: "Neue Buchung: Tim Spengler",
    text: `Neue Buchung für Ihre Unterkunft
Buchungsnummer: 148903641
Unterkunft: Lodge No. 17 - Vils
Gastname: Tim Spengler
Anreise: Samstag, 15. August 2026 ab 14:00 Uhr
Abreise: Samstag, 22. August 2026 bis 10:00 Uhr
Gäste: 2 Erwachsene, 2 Kinder (0 und 5 Jahre alt)
Nachricht von Tim Spengler: An extra bed/crib was requested.`,
  })!;
  check("portal", mail.portal, "booking.com");
  check("reference", mail.reference, "148903641");
  check("guestName", mail.guestName, "Tim Spengler");
  check("adults", mail.adults, 2);
  check("children", mail.children, 2);
  check("guestCount", mail.guestCount, 4);
  check("checkIn", mail.checkIn, new Date(Date.UTC(2026, 7, 15)));
  check("checkOut", mail.checkOut, new Date(Date.UTC(2026, 7, 22)));
  check("remarks", mail.remarks, ["Zusatzbett angefordert", "Kinderbett angefordert"]);
});

// ─── Booking.com, englisch ────────────────────────────────────────────────────
run("Booking.com · englisch", () => {
  const mail = parsePortalMail({
    from: "customer.service@booking.com",
    subject: "New booking confirmed",
    text: `New reservation
Booking number: 1489 036 41
Guest name: Anna Weber
Check-in: Saturday, August 15, 2026
Check-out: Saturday, August 22, 2026
Guests: 3 adults, 1 child
Pets: yes`,
  })!;
  check("reference (Leerzeichen entfernt)", mail.reference, "148903641");
  check("guestName", mail.guestName, "Anna Weber");
  check("adults", mail.adults, 3);
  check("children", mail.children, 1);
  check("guestCount", mail.guestCount, 4);
  check("pets", mail.pets, 1);
  check("checkIn", mail.checkIn, new Date(Date.UTC(2026, 7, 15)));
});

// ─── Booking.com, nur Gesamtzahl ──────────────────────────────────────────────
run("Booking.com · nur Gesamtzahl", () => {
  const mail = parsePortalMail({
    from: "noreply@booking.com",
    subject: "Buchung",
    text: `Buchungsnummer: 987654321
Anreise: 03.09.2026
Abreise: 07.09.2026
5 Gäste`,
  })!;
  check("adults", mail.adults, null);
  check("guestCount (Fallback)", mail.guestCount, 5);
  check("checkIn (numerisch)", mail.checkIn, new Date(Date.UTC(2026, 8, 3)));
  check("checkOut (numerisch)", mail.checkOut, new Date(Date.UTC(2026, 8, 7)));
});

// ─── Airbnb, deutsch ──────────────────────────────────────────────────────────
run("Airbnb · deutsch", () => {
  const mail = parsePortalMail({
    from: "automated@airbnb.com",
    subject: "Reservierung bestätigt",
    text: `Reservierung bestätigt
Reservierungscode: HMQ4XZ8ABC
Anreise: 15. Aug. 2026
Abreise: 22. Aug. 2026
2 Erwachsene, 1 Kind, 1 Kleinkind
1 Hund`,
  })!;
  check("portal", mail.portal, "airbnb");
  check("reference", mail.reference, "HMQ4XZ8ABC");
  check("adults", mail.adults, 2);
  check("children inkl. Kleinkind", mail.children, 2);
  check("guestCount", mail.guestCount, 4);
  check("pets", mail.pets, 1);
  check("checkIn", mail.checkIn, new Date(Date.UTC(2026, 7, 15)));
});

// ─── Airbnb, englisch, nur Gästezahl ──────────────────────────────────────────
run("Airbnb · englisch", () => {
  const mail = parsePortalMail({
    from: "express@airbnb.com",
    subject: "Reservation confirmed - HMABC12345",
    text: `Confirmation code: HMABC12345
Check-in: 15 August 2026
Check-out: 22 August 2026
2 guests`,
  })!;
  check("reference", mail.reference, "HMABC12345");
  check("guestCount (Fallback)", mail.guestCount, 2);
  check("checkIn", mail.checkIn, new Date(Date.UTC(2026, 7, 15)));
});

// ─── Weitergeleitete HTML-Mail ────────────────────────────────────────────────
run("Weitergeleitet · HTML · Portal nur im Text", () => {
  const text = htmlToText(`<html><body><p>Weitergeleitete Nachricht von
    <b>Booking.com</b></p><table><tr><td>Buchungsnummer:</td><td>555444333</td></tr>
    <tr><td>G&auml;ste:</td><td>4 Erwachsene</td></tr>
    <tr><td>Anreise:</td><td>01.10.2026</td></tr></table></body></html>`);
  const mail = parsePortalMail({ from: "ich@example.com", subject: "Fwd: Buchung", text })!;
  check("portal aus Text erkannt", mail.portal, "booking.com");
  check("reference", mail.reference, "555444333");
  check("adults", mail.adults, 4);
  check("checkIn", mail.checkIn, new Date(Date.UTC(2026, 9, 1)));
});

// ─── Fremde Mail wird ignoriert ───────────────────────────────────────────────
run("Nicht-Portal-Mail", () => {
  const mail = parsePortalMail({
    from: "rechnung@stromanbieter.de",
    subject: "Ihre Jahresabrechnung",
    text: "Sehr geehrter Kunde, anbei Ihre Abrechnung über 2 Zähler.",
  });
  check("wird ignoriert", mail, null);
});

console.log(`\n${passed} Prüfungen bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed > 0 ? 1 : 0);
