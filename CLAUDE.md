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

| Route | ADMIN | CLEANER |
|---|---|---|
| `/dashboard` | ✅ | ❌ → `/my-jobs` |
| `/calendar` | ✅ | ❌ |
| `/bookings` | ✅ | ❌ |
| `/cleaners` | ✅ | ❌ |
| `/my-jobs` | ✅ | ✅ |
| `/api/bookings/sync` | ✅ | ❌ |
| `/api/bookings/[id]/assign` | ✅ | ❌ |

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
- [ ] Channel Manager: weitere Adapter (Booking.com, Airbnb)
- [ ] Public REST API für externe Integrationen
- [ ] Whitelabel-Option
- [ ] Mobile App (React Native / Expo)

---

## Code-Konventionen

- TypeScript strict mode
- Alle API-Endpunkte validieren mit **Zod**
- Alle DB-Abfragen filtern nach `organizationId` (niemals vergessen!)
- Audit-Log für alle sicherheitsrelevanten Aktionen via `src/lib/audit.ts`
- Keine Passwörter/Secrets im Code
- Fehler immer auf Deutsch in der UI anzeigen
