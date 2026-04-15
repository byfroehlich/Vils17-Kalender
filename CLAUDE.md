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
- **Webhook**: `POST /api/smoobu/webhook` empfängt Echtzeit-Events
- **Manuell**: Admin kann Sync per Button auslösen

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

## Aktueller Stand (Stand: 15.04.2026)

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

### Bekannte offene Punkte
- Zweite Wohnung kommt im Mai → wird beim nächsten Sync automatisch importiert
- "Wohnung 1" und "Wohnung 2" (Platzhalter) in Einstellungen manuell löschen
- "First Accept Wins" Reinigungsanfrage (Push an alle Reiniger) noch nicht implementiert
- E-Mail/WhatsApp: SMTP + Twilio Credentials noch nicht in Render konfiguriert
- Benutzer deaktivieren (ohne löschen): Backend-Feld `active` vorhanden, UI-Toggle fehlt noch

## Geplante Features (später)

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
