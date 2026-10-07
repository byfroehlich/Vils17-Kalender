# Vils17-Kalender

## Projektbeschreibung

Ferienwohnungs-Management-App für zwei Ferienwohnungen in Vils/Tirol.
Zieht Buchungs- und Belegungsdaten aus **Smoobu** (Channel Manager), ermöglicht
Reinigungsplanung, Wäschebestellung und Reinigungszuweisung per Klick.

**Version 1**: Privat für Eigentümer + Mutter + Reinigungskräfte  
**Geplant**: Kommerzielles SaaS für beliebig viele Vermieter (Multi-Tenant)

---

## Tech Stack

| Schicht | Technologie | Begründung |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR + API-Routes + einfaches Render-Deploy |
| Styling | TailwindCSS + shadcn/ui | Schnell, konsistent, barrierefrei |
| Auth | NextAuth.js (credentials) | Einfach, erweiterbar zu Supabase Auth |
| ORM/DB | Prisma + Supabase PostgreSQL | Type-safe, Migrationen, später RLS |
| E-Mail | Nodemailer / Resend | Zuverlässiger SMTP-Versand |
| WhatsApp | Twilio | Optional, per ENV aktivierbar |
| Smoobu | REST API + Webhook | Echtzeit-Buchungsdaten |
| Wäsche-API | Eigener Adapter | Phase 1: Mock, Phase 2: echt |
| Sprache | next-intl | DE (primär) + EN |
| Deployment | Render (Web) + Supabase (DB) | Einfach, günstig, skalierbar |

---

## Lokales Setup

### Voraussetzungen
- Node.js 20+
- pnpm oder npm
- Supabase Projekt (kostenlos) oder lokale PostgreSQL

### Schritte

```bash
# 1. Repository klonen
git clone https://github.com/byfroehlich/Vils17-Kalender.git
cd Vils17-Kalender

# 2. Dependencies installieren
npm install

# 3. Umgebungsvariablen anlegen
cp .env.example .env.local
# .env.local mit echten Werten befüllen (siehe unten)

# 4. Datenbank-Schema anlegen
npx prisma migrate dev --name init

# 5. Erste Organization + Admin anlegen
npx prisma db seed

# 6. Entwicklungsserver starten
npm run dev
# → http://localhost:3000
```

---

## Umgebungsvariablen

Alle Variablen sind in `.env.example` dokumentiert. Für den lokalen Betrieb
`.env.local` anlegen (nie committen!).

### Supabase / Datenbank
```
DATABASE_URL=postgresql://postgres:[pw]@db.[ref].supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[pw]@db.[ref].supabase.co:5432/postgres
```
→ Supabase Dashboard → Settings → Database → Connection String

### NextAuth
```
NEXTAUTH_URL=http://localhost:3000          # lokal
NEXTAUTH_SECRET=<random 32 chars>           # openssl rand -base64 32
```

### Smoobu
```
SMOOBU_API_KEY=<aus Smoobu Settings → API>
SMOOBU_WEBHOOK_SECRET=<selbst gewählt, auch in Smoobu eintragen>
```
API-Doku: https://docs.smoobu.com/

Genutzte Endpunkte:
- `GET /api/reservations` – Buchungen abrufen
- `GET /api/apartments` – Wohnungen abrufen

### E-Mail (SMTP)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deine@email.de
SMTP_PASS=app-passwort
SMTP_FROM="Vils17 Kalender <noreply@vils17.de>"
```
Alternativ: Resend.com API Key verwenden (`RESEND_API_KEY=...`)

### Twilio WhatsApp (optional)
```
TWILIO_ENABLED=false
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```
Nur aktiv wenn `TWILIO_ENABLED=true`.

### Wäsche-Lieferant (Phase 2)
```
LAUNDRY_API_ENABLED=false
LAUNDRY_API_URL=https://api.waesche-lieferant.de
LAUNDRY_API_KEY=...
```

### Cron + App
```
CRON_SECRET=<random string>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Architektur

### Multi-Tenant (von Anfang an)
Jeder Vermieter = eine **Organization**. Alle Daten sind an eine `organizationId`
gebunden. In V1 existiert genau eine Organization.

```
Organization
  ├── Users (ADMIN | CLEANER)
  └── Apartments
       └── Bookings
            └── CleaningAssignment
                 └── LaundryOrder (Phase 2)
```

Die `organizationId` ist in **jedem** DB-Modell vorhanden – so kann später
Multi-Tenancy ohne Datenmigration aktiviert werden.

### Channel Manager Adapter (`src/lib/channel-manager/`)
Jede Buchungsplattform bekommt einen eigenen Adapter. `sync.ts` arbeitet
nur mit dem normalisierten Format – nie mit rohen API-Antworten.

```
src/lib/channel-manager/
  types.ts     ← NormalizedApartment, NormalizedReservation, ChannelManagerAdapter
  smoobu.ts    ← SmoobuAdapter (Zod-validiert, alle Feldnamen-Varianten)
  index.ts     ← getChannelManagerAdapter() – später per Organization wählbar
```

**Neue Integration hinzufügen:**
1. `src/lib/channel-manager/bookingcom.ts` anlegen
2. `ChannelManagerAdapter` Interface implementieren
3. In `index.ts` per `org.channelManager` auswählen
4. `sync.ts` bleibt unverändert

**Zod-Validierung:** Jeder Adapter validiert die rohe API-Antwort mit Zod.
Unbekannte Felder werden durchgelassen (`.passthrough()`), fehlende
Pflichtfelder erzeugen einen Warning-Log statt einen Crash.

### Smoobu Sync
- **Cron**: alle 15 Min ruft Render Cron `POST /api/bookings/sync` auf
- **Webhook**: `POST /api/smoobu/webhook?token=<SMOOBU_WEBHOOK_SECRET>` — stößt
  einen vollständigen Sync an. In Smoobu genau diese URL inkl. `token` eintragen
  (Smoobu signiert Webhooks nicht; ohne Token wird jeder Aufruf abgelehnt).
- **Selbstaktualisierung**: Jede geöffnete App ruft `POST /api/sync/auto` beim
  Öffnen, beim Zurückholen aus dem Hintergrund und alle 3 Min auf
  (`src/components/pwa/AutoRefresh.tsx`). Der Server synchronisiert nur, wenn
  der letzte Lauf älter als 10 Min ist — die Daten bleiben damit aktuell, auch
  wenn der Cron ausfällt.
- **Manuell**: Admin kann Sync per Button auslösen
- Alle Wege laufen über `src/lib/sync-runner.ts`: höchstens ein Sync pro
  Organization gleichzeitig, `Organization.lastSyncAt` wird gesetzt. Das
  Dashboard zeigt „vor X Min aktualisiert" — gelb ab 30 Min, dann läuft der
  Cron nicht.

### PWA (installierbar auf Android + iOS)

Die App lässt sich auf dem Startbildschirm installieren und läuft dann ohne
Adressleiste (`display: standalone`).

```
public/manifest.json            name, start_url "/", scope, standalone, Icons, Shortcuts
public/icon-192.png             Android Startbildschirm
public/icon-512.png             Splashscreen / App-Übersicht
public/icon-maskable-512.png    Android adaptive Icons (Inhalt in sicherer Zone)
public/apple-touch-icon.png     iOS (180px)
public/sw.js                    Service Worker: Push + fetch-Handler + Offline
public/offline.html             Anzeige ohne Verbindung
src/components/pwa/ServiceWorkerRegistration.tsx   registriert sw.js auf allen Seiten
src/components/pwa/InstallPrompt.tsx               Installieren-Knopf (Android) / Anleitung (iOS)
```

**Icons neu erzeugen** (nach Design-Änderung):
```bash
npm i --no-save sharp && node scripts/generate-icons.mjs
```

**Caching-Regel — wichtig:** Seiten und `/api/*` werden **nie** zwischengespeichert,
weil sie kontoabhängige Daten enthalten. Gecacht werden nur `/_next/static/*`
(unveränderlich, Hash im Namen) und die Offline-Seite. Diese Regel beim Erweitern
des Service Workers beibehalten.

**Service Worker aktualisieren:** `VERSION` in `public/sw.js` hochzählen — alte
Caches werden beim Aktivieren automatisch gelöscht.

**App-Rahmen — das Fenster scrollt nie:** Das Dashboard-Layout ist ein fester
Rahmen in Bildschirmgröße (`position: fixed; inset: 0`). Gescrollt wird nur der
Inhaltsbereich `<main id="app-scroll">`. Grund: Scrollt das Fenster, verschiebt
iOS es beim Öffnen der Tastatur und setzt es in der installierten App teils nicht
zurück — Topbar und Menüleiste bleiben dann verrutscht. Weil das Fenster immer
auf 0 stehen muss, setzt `IosViewportFix` jede Verschiebung zurück.
- Scroll-Sperre für Dialoge: `<ScrollLock />` sperrt `#app-scroll` (nicht den Body).
- Scroll-Position: `ScrollMemory` setzt neue Seiten nach oben und stellt beim
  Zurückgehen die alte Position wieder her (das übernimmt der Browser bei einem
  inneren Scroll-Bereich nicht mehr selbst).
- Nie `window.scrollTo` / `window.scrollY` für Inhalte verwenden — immer
  `document.getElementById("app-scroll")`.

### Push-Benachrichtigungen

**iPhone (iOS 16.4+):** Push funktioniert nur in der über „Teilen → Zum
Home-Bildschirm" installierten App, nicht im Safari-Tab. Die Erlaubnis muss
direkt aus einem Tipp angefragt werden — deshalb fragt nur die Glocke
(`PushToggle`), und dort ist `Notification.requestPermission()` das erste
`await`. `PushSubscriber` fragt nie selbst, er hält nur bestehende Anmeldungen
mit dem Server synchron.

**Testen:** Bei aktiven Benachrichtigungen öffnet ein Tipp auf die Glocke ein
Menü mit „Testnachricht senden" (`POST /api/push/test`, nur an die eigenen
Geräte) und „Ausschalten". Die Antwort sagt, woran es hängt: VAPID fehlt,
Gerät nicht angemeldet, Anmeldung abgelaufen oder Versand fehlgeschlagen.

| Ereignis | Empfänger | Auslöser |
|---|---|---|
| Reinigung erledigt | Admin/Verwaltung | `cleaning-status` |
| Reinigung abgesagt / wieder frei | Admin/Verwaltung + Reiniger | `cleaner-unavailable` |
| Reinigung zugesagt | Admin/Verwaltung | `claim` |
| Neuer Auftrag / zugewiesen | betroffene Reinigungskraft | Sync, `assign` |
| Tagesstatus (ab 7 Uhr, 1× täglich) | Admin/Verwaltung: alle heutigen; Reiniger: eigene | `src/lib/notifications.ts` |
| Reinigung frei (≤ 10 Tage) | Reiniger | `runReminders` |
| Ohne Reinigungskraft (≤ 7 Tage) | Admin/Verwaltung | `runReminders` |
| Wäsche nicht bestellt (≤ 3 Tage) | Admin/Verwaltung | `runReminders` |

Warnungen werden gebündelt (eine Nachricht pro Art) und pro Auftrag nur einmal
verschickt (`*ReminderSentAt`). `runReminders` und `maybeSendDailyStatus` laufen
im Cron `push-reminders` **und** als Rückfallebene in `/api/sync/auto` — beides
ist idempotent.

Datumslogik: Buchungsdaten liegen als UTC-Mitternacht des Kalendertags vor.
Verglichen wird über den Kalendertag in Europe/Vienna (`viennaDateKey`), die
Anzeige formatiert mit `timeZone: "UTC"`.

### Reinigungssätze (`src/lib/rates.ts`)

Ein Auftrag kostet nicht pauschal den Satz der Reinigungskraft. Es gibt einen
**Sondersatz pro Wohnung** (z.B. 70 € für Vanessa im Penthouse), und Sätze
werden beim Erledigen **festgeschrieben**.

```
Apartment.cleaningRate / cleaningRateCleanerId / cleaningRateFrom
   → vereinbarter Sondersatz, für wen, gilt für Buchungen ab Zeitpunkt
Booking.premiumRate / premiumRateCleanerId
   → beim Eingang der Buchung von der Wohnung übernommen, danach unverändert
      (= die Markierung „70-€-Buchung")
CleaningAssignment.rate
   → beim Erledigen festgeschrieben; gilt dann für immer
```

Regeln (`effectiveRate`): festgeschriebener Satz → sonst Sondersatz, wenn genau
die vereinbarte Person reinigt → sonst normaler Satz der Reinigungskraft.
**Vertretungen bekommen ihren eigenen Satz**, nicht den Sondersatz.

- Sondersatz ändern (Einstellungen → Unterkunft bearbeiten) wirkt **nie
  rückwirkend**: `cleaningRateFrom` wird auf „jetzt" gesetzt, bestehende
  Buchungen behalten ihren Vermerk. Änderungen landen im Audit-Log.
- Alle Ansichten bekommen `rate`/`isPremium` fertig vom Server — nie im Client
  aus `cleaner.cleanerRate` rechnen, sonst stimmen Sondersatz und Historie nicht.
- Markierung: `RateBadge` („70 €"); durchgestrichen, wenn eine Vertretung reinigt.
- Prüfen: `npm run test:rates`

### Portal-Mail-Import (`src/lib/email-import/`)

Smoobu liefert für manche Kanäle (v.a. Booking.com) **keine Gästezahl** und für
kein Portal Haustierangaben. Direkte APIs sind nicht verfügbar — Airbnb und
Booking.com vergeben Zugang ausschließlich an zertifizierte Partner, nicht an
einzelne Vermieter. Die Bestätigungsmails der Portale enthalten die Angaben
dagegen im Klartext.

```
src/lib/email-import/
  parse.ts   ← reine Parser (Booking.com + Airbnb, DE + EN) — testbar
  match.ts   ← Zuordnung Mail → Buchung über Name, Anreisedatum, Kanal
  imap.ts    ← holt ungelesene Mails, markiert sie als gelesen
  run.ts     ← Ablauf: lesen → parsen → zuordnen → ergänzen → protokollieren
```

**Einrichtung:** Portalmails in ein Postfach weiterleiten, dann in Render
`IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` setzen (Gmail: App-Passwort, IMAP im Konto
aktivieren). Cron `email-import` läuft alle 30 Minuten; in den Einstellungen gibt
es zusätzlich „Jetzt prüfen" und ein Protokoll der letzten 25 Mails.

**Regeln:**
- Eine von Hand gesetzte Gästezahl wird nie überschrieben (`guestCountSource`
  unterscheidet `"manual"` von `"email"`).
- Ohne eindeutige Zuordnung wird nichts geändert, sondern als `UNMATCHED` bzw.
  `AMBIGUOUS` protokolliert.
- Jede Mail wird über ihre `messageId` genau einmal verarbeitet (`EmailImport`).

**Parser prüfen:** `npm run test:mail` — 35 Prüfungen gegen realistische
Mailtexte. Die Parser sind der fragile Teil: Ändern die Portale ihre Vorlagen,
zuerst hier nachziehen und den Test erweitern.

### Wäsche-Adapter (`src/lib/laundry.ts`)
```typescript
interface LaundryAdapter {
  order(params: LaundryOrderParams): Promise<LaundryOrderResult>
}
// Phase 1: MockAdapter (loggt nur, setzt Status)
// Phase 2: EchtAdapter (ruft Lieferanten-API auf)
```

---

## Deployment auf Render

1. Repository mit Render verbinden
2. `render.yaml` liegt im Root → Render erkennt automatisch Web Service + Cron
3. Umgebungsvariablen im Render Dashboard setzen (nicht in render.yaml!)
4. Supabase Connection String als `DATABASE_URL` und `DIRECT_URL` eintragen
5. Erster Deploy: `npx prisma migrate deploy` läuft automatisch beim Start

### Nach jedem Push
- Render deployt automatisch (main branch oder konfigurierter branch)
- Prisma Migrationen laufen beim Serverstart (`startCommand` in render.yaml)

---

## Rollen & Berechtigungen

| Route | ADMIN | MANAGER | CLEANER |
|---|---|---|---|
| `/dashboard` | ✅ | ✅ | ❌ → `/my-jobs` |
| `/calendar` | ✅ | ✅ | ❌ |
| `/bookings` | ✅ | ✅ | ❌ |
| `/cleaners` | ✅ | ✅ | ❌ |
| `/settings` | ✅ | ❌ | ❌ |
| `/my-jobs` | ✅ | ✅ | ✅ |
| `/billing` | ✅ | ✅ | ✅ (nur eigene Jobs) |
| `/api/bookings/sync` | ✅ | ✅ | ❌ |
| `/api/bookings/[id]/assign` | ✅ | ✅ | ❌ |
| `/api/bookings/[id]/laundry` | ✅ | ✅ | ❌ |
| `/api/bookings/[id]/cleaning-status` | ✅ | ✅ | ❌ |
| `/api/users` (Benutzerverwaltung) | ✅ | ❌ | ❌ |

---

## Wäsche-API Integration (Phase 2)

Sobald der Lieferant eine API bereitstellt:

1. `LAUNDRY_API_ENABLED=true` in `.env`
2. `LAUNDRY_API_URL` und `LAUNDRY_API_KEY` eintragen
3. `src/lib/laundry.ts` – `RealLaundryAdapter` implementieren:
   ```typescript
   async order(params) {
     const res = await fetch(`${process.env.LAUNDRY_API_URL}/orders`, {
       method: 'POST',
       headers: { 'Authorization': `Bearer ${process.env.LAUNDRY_API_KEY}` },
       body: JSON.stringify({ quantity: params.quantity, date: params.date })
     })
     return await res.json()
   }
   ```
4. Webhook-Endpunkt des Lieferanten eintragen: `POST /api/laundry/webhook`

---

## SaaS Roadmap

- [ ] Onboarding-Flow: neue Organization anlegen
- [ ] Stripe Billing: FREE / BASIC / PRO Pläne
- [ ] Supabase RLS als zweite Sicherheitsebene
- [ ] Channel Manager: weitere Adapter (Booking.com, Airbnb) → siehe `src/lib/channel-manager/`
- [ ] Public REST API für externe Integrationen
- [ ] Whitelabel-Option
- [ ] Mobile App (React Native / Expo)

---

## Marktplatz-Konzept (Turnio — Phase 2+)

### Vision
Regionale Plattform die drei Seiten verbindet:
1. **Vermieter** — organisieren Reinigung + Wäsche automatisch
2. **Reinigungsfirmen/-personen** — bekommen planbare Aufträge
3. **Wäscherei** — bekommt automatisierte Bestellungen, mehr Volumen

Startregion: **Allgäu + Außerfern/Reutte** (Füssen als Wäscherei-Standort verbindet beide Seiten der Grenze natürlich)

### Erlösmodell
- **2,5% Provision** pro vermittelter Reinigung (zahlt der Vermieter)
- **2,5% Provision** pro Wäschebestellung über die Plattform (oder 5€/Monat Flatrate für Vermieter)
- Reiniger zahlen nichts — sie sind die knappe Ressource, nicht die Vermieter

### Wäscherei-Integration
- Wäscherei in Füssen: modern, RFID-Tracking in Textilien, eigene App
- **Phase 1**: API-Anbindung anstreben (direkt fragen)
- **Phase 2 Fallback**: Browser Use (automatisierter Bot auf deren Web-Portal) als Übergangslösung bis API verfügbar
- Wäscherei profitiert: mehr automatisierte Bestellungen, kein Telefonat
- Wäscherei als Vertriebskanal: ihre bestehenden Kunden = potenzielle Vermieter-Leads

### Reinigungslogik — Stammreiniger-Modell (nachhaltig)
**Erstbuchung:**
- Neue Buchung geht als Anfrage raus an alle verfügbaren Reiniger in der Region
- First come first serve — wer zuerst zusagt bekommt den Auftrag

**Ab 2. Buchung:**
- System fragt Vermieter automatisch: "Möchtest du [Name] als Stammreiniger für diese Wohnung festlegen?"
- Bei Ja: alle künftigen Buchungen gehen direkt nur an diesen Reiniger (mit z.B. 4h Bestätigungsfrist)
- Bei Nicht-Bestätigung innerhalb der Frist: automatisch zurück in den Pool

**Vorteile Stammmodell:**
- Reiniger kennt die Wohnung → weniger Fehler, kein Briefing
- Vermieter hat Planungssicherheit
- Plattform wird sticky — beide Seiten wollen nicht wechseln
- Provision läuft automatisch ohne aktive Vermittlung

### Preislogik
- Preis wird **einmalig zwischen Vermieter und Reiniger vereinbart** und in der App hinterlegt
- Kein öffentliches Preisranking — kein Preisdruck auf Reiniger
- Nur Vermieter + Reiniger sehen den vereinbarten Preis (+ Plattform für Provision)
- Technisch: `preferredCleanerId` + `cleaningPrice` am Apartment hinterlegt

### Bewertungsstrategie
**Phase 1 — Daten sammeln, nichts anzeigen:**
- Nach jeder Reinigung: Vermieter bewertet Reiniger intern (gut/okay/Problem)
- Nach jeder Reinigung: Reiniger bewertet Vermieter intern (fair/okay/schwierig)
- Nichts ist öffentlich sichtbar
- Plattform sieht alle Daten → kann manuell eingreifen bei Problemen

**Intern getrackte Signale (besser als Sterne):**
- Bestätigungsrate des Reinigers
- Stammreiniger-Wahlrate (bester Qualitätsindikator)
- Absagenrate (kurzfristig?)
- Reaktionszeit auf neue Anfragen
- Vermieter: Stornierungsrate, Kommunikationsqualität (laut Reiniger)

**Phase 2 (wenn Plattform groß genug):**
- Gegenseitige Bewertungen sichtbar machen (wie Airbnb)
- Vermieter sieht Reiniger-Score, Reiniger sieht Vermieter-Score
- Erst ab ausreichend Datenpunkten sinnvoll — kleine Gemeinschaft = persönliche Konflikte vermeiden

**Philosophie:** Reiniger sind die knappe Ressource. Gute Reiniger müssen faire Vermieter finden können. Deshalb bewerten beide Seiten.

## Aktueller Stand (Stand: 21.06.2026)

### Erledigt ✅
- Smoobu Sync funktioniert (Buchungen + Apartments automatisch importiert)
- Smoobu Webhook eingerichtet (Echtzeit-Updates bei neuer Buchung)
- Cron-Job alle 15 Min (render.yaml)
- Channel Manager Adapter Pattern (`src/lib/channel-manager/`)
- Dashboard: Stats-Karten, Buchungsliste, 14-Tage-Warnbanner, Dreher-Warnung
- Kalender: durchgehende Buchungsbalken mit Farbwechsel, getrennte/gemeinsame Ansicht
- Einstellungen-Seite: Apartment-Name, Farbe, löschen; Kalenderansicht konfigurieren
- CleaningAssignment wird automatisch bei jedem neuen Import erstellt
- **Buchungsdetail** vollständig gebaut:
  - Gast-Info (Name, Kontakt, Check-in/out, Zeiten, Kanal)
  - Haustiere (`petCount`) manuell pflegbar
  - Reinigung: Reiniger zuweisen (Dialog), Selbstreinigung, Notizen, Als erledigt markieren
  - Wäsche: Mengenberechnung (Betten/Handtücher/Küche), Status-Toggle, Bestellung, Notizen
- **E-Mail-Benachrichtigungen** implementiert (`src/lib/mail.ts`):
  - Nodemailer/SMTP, DE + EN Vorlagen
  - Wird ausgelöst beim Zuweisen eines Reinigers (`/api/bookings/[id]/assign`)
- **WhatsApp-Benachrichtigungen** implementiert (`src/lib/whatsapp.ts`):
  - Twilio, aktivierbar per `TWILIO_ENABLED=true`
  - Wird ausgelöst beim Zuweisen eines Reinigers
- **MANAGER-Rolle** vollständig implementiert:
  - Middleware blockiert `/settings`
  - Alle relevanten API-Endpunkte erlauben ADMIN + MANAGER
  - Topbar zeigt "Verwaltung"-Badge
- **Passwort ändern**: User kann eigenes Passwort in Einstellungen ändern
- **Benutzerverwaltung**: Admin legt User an (ADMIN / MANAGER / CLEANER), bearbeiten, löschen
- Buchungsübersicht nach Monat segmentiert
- Portal-Icon (Airbnb/Booking.com) und Gästezahl in Buchungskarten
- Helles, freundliches Theme mit Glass-Morphism-Design
- **Sicherheits-Fixes:**
  - Smoobu Webhook schlägt jetzt CLOSED fehl (kein Secret = kein Zugang)
  - `timingSafeEqual` Crash bei unterschiedlichen Signaturlängen behoben
  - Push-DELETE Endpoint validiert mit Zod
  - Absage-Dialog: Non-Null-Assertion-Crash behoben
- **Push-Benachrichtigungen** (`src/components/push/`):
  - `PushToggle` in der Topbar (Bell/BellOff Icon)
  - `PushSubscriber` abonniert beim ersten Login automatisch
  - Backend: `POST/DELETE /api/push/subscribe`, `GET /api/push/vapid-public-key`
- **Reiniger-Abrechnung** (`/billing` für CLEANER-Rolle):
  - `CleanerBillingView`: eigene erledigte Jobs gruppiert nach Monat
  - 3 Karten: Gesamt / Ausstehend / Ausgezahlt
  - In Sidebar + Mobile-Nav sichtbar
- **Sync: Catch-up-Logik** (`src/lib/sync.ts`):
  - UNASSIGNED zukünftige Jobs ohne cleanerId werden beim Sync automatisch dem Hauptreiniger (isPrimary=true) zugewiesen
- **Reiniger-Ansichten verbessert:**
  - Reinigername in der Geplant-Liste immer sichtbar (auch Mobile)
  - "Nächste Anreise" entfernt (war immer Abreisedatum des aktuellen Gastes, semantisch falsch)
  - **Anreise-Personenzahl** (`nextGuestCount`): Liste, Dashboard-Karten und Kalender zeigen die Anzahl der anreisenden Gäste (nicht der abreisenden) — Reiniger weiß wie viele Betten/Handtücher vorzubereiten sind
  - Kalender-Tageskürzel korrigiert: Mo/Di/Mi/Do/Fr/Sa/So
  - Abmelden-Button zeigt Text auf Mobile

### Bekannte offene Punkte
- "Wohnung 1" und "Wohnung 2" (Platzhalter) in Einstellungen manuell löschen, falls noch vorhanden
- E-Mail/WhatsApp: SMTP + Twilio Credentials noch nicht in Render konfiguriert
- Benutzer deaktivieren (ohne löschen): Backend-Feld `active` vorhanden, UI-Toggle fehlt noch
- **VAPID-Keys für Push-Benachrichtigungen** noch nicht in Render eingetragen:
  ```bash
  npx web-push generate-vapid-keys
  ```
  Dann in Render → Environment: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_MAILTO`

## Geplante Features (später)

### Saugroboter-Automatisierung (Dreame Wischi X50 Ultra)
- Gerät: **Dreame Wischi X50 Ultra**, gesteuert über Dreame Home App
- Dreame Konto-ID: **CT115077**
- Ziel: Roboter startet automatisch um 10:00 Uhr an jedem Abreisetag
- Umsetzung: Render-Cron um 10:00 prüft ob heute Checkout-Tag → schickt Start-Befehl an Dreame Cloud API
- Benötigt als Render-Umgebungsvariablen: `DREAME_EMAIL`, `DREAME_PASSWORD`
- Zuständig für: **Penthouse No. 17 – Vils** (apartmentId beim Sync ermitteln)
- Die Dreame Cloud API ist nicht offiziell dokumentiert, aber gut bekannt aus Open-Source-Projekten (python-dreame, HA-Integration)

### Reinigungsstatistik
- Welche Reinigungskraft wie oft im Einsatz
- Kosten pro Einsatz (Stundensatz oder Pauschale am Reiniger hinterlegen)
- Export für Buchhaltung (CSV/PDF)

### Wäschestatistik
- Bestellte Mengen pro Monat/Jahr
- Kosten (Preis pro Einheit am Lieferanten hinterlegen)

### Steuer-Export
- Buchungsliste mit Gast, Datum, Nächte, Kanal, Umsatz
- PDF + CSV Export für Steuerbüro
- Jahresübersicht pro Wohnung (Neon/Supabase hat alle Daten – nie löschen!)

---

## Code-Konventionen

- TypeScript strict mode
- Alle API-Endpunkte validieren mit **Zod**
- Alle DB-Abfragen filtern nach `organizationId` (niemals vergessen!)
- Audit-Log für alle sicherheitsrelevanten Aktionen via `src/lib/audit.ts`
- Keine Passwörter/Secrets im Code
- Fehler immer auf Deutsch in der UI anzeigen
