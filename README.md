# Vils17-Kalender

Ferienwohnungs-Management für Lodge No. 17 und Penthouse No. 17 in Vils/Tirol:
Buchungen aus Smoobu, Reinigungsplanung, Wäsche, Abrechnung der Reinigungskräfte.
Technische Details und Konventionen stehen in [CLAUDE.md](CLAUDE.md).

## Claude-Schnittstelle (MCP)

Claude kann Belegung, An-/Abreisen, Reinigung, Wäsche und Umsätze direkt abfragen
und — nach Bestätigung — Reinigungen zuweisen. Zwei Wege: **claude.ai mit Anmeldung
(OAuth)** für Handy, Web und Cloud — oder ein **Token** für Claude Desktop/Claude Code. Adresse:

```
https://vils17-kalender.onrender.com/api/mcp
```

### claude.ai (Handy, Web, Cloud ohne Mac) — empfohlen

1. claude.ai → **Einstellungen → Connectoren → Eigenen Connector hinzufügen**
2. Name „Vils17-Kalender“, URL `https://vils17-kalender.onrender.com/api/mcp`, Felder für
   Client-ID/Secret leer lassen → **Hinzufügen** → **Verbinden**
3. Es öffnet sich die Anmeldung der App → mit dem **Admin-Konto** anmelden
4. Zustimmungsseite: Bereiche prüfen (`cleaning:write` abwählen, wenn Claude nur lesen soll) → **Zulassen**

Danach steht der Connector in allen Claude-Apps desselben Kontos bereit (auch in der
Handy-App). Kein Token zu kopieren. Trennen: **Einstellungen → Claude-Schnittstelle →
Trennen** (sperrt sofort alle Token dieser Verbindung).

Technik: OAuth 2.1 mit PKCE (S256), Dynamic Client Registration und
Client-ID-Metadaten-Dokumenten. Das Zugriffstoken ist intern ein normales `v17_`-Token
(Hash in der DB) mit 1 h Laufzeit; das Refresh-Token (30 Tage) wird bei jeder Erneuerung
getauscht — taucht ein altes wieder auf, wird die ganze Verbindung gesperrt. Zustimmen
kann nur ein aktives Admin-Konto; Rücksprung nur zu claude.ai/claude.com oder Loopback.

### 1. Token anlegen (Claude Desktop, Claude Code)

In der App: **Einstellungen → Claude-Schnittstelle → Neues Token**. Bereiche ankreuzen:

| Bereich | erlaubt |
|---|---|
| `bookings:read` | Wohnungen, Buchungen, An-/Abreisen, Belegung, Sync-Status |
| `cleaning:read` | Reinigungen, Absagen, Wäschemengen |
| `finance:read` | Umsatz, erwartete Auszahlungen, Ortstaxe, Auszahlungen Reinigung |
| `cleaning:write` | Reinigung zuweisen, Notiz, Gästezahl korrigieren, Sync auslösen |

Das Token (`v17_…`) wird **genau einmal** angezeigt. Die Seite bietet die fertige
Claude-Desktop-Konfiguration zum Kopieren an. Widerrufen geht jederzeit auf derselben Seite.

### 2. In Claude Desktop eintragen (Mac)

Datei `~/Library/Application Support/Claude/claude_desktop_config.json`, unter `"mcpServers"`:

```json
"vils17-kalender": {
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://vils17-kalender.onrender.com/api/mcp", "--header", "Authorization:${MCP_TOKEN}"],
  "env": { "MCP_TOKEN": "Bearer v17_…" }
}
```

Danach Claude Desktop neu starten. Die Tools stehen dann auch in Cloud-Sitzungen
zur Verfügung, solange der Mac verbunden ist.

Claude Code geht auch ohne Token: `claude mcp add --transport http vils17 https://vils17-kalender.onrender.com/api/mcp`
— die Anmeldung läuft dann wie bei claude.ai über den Browser.

### Tools

| Tool | Bereich | wofür |
|---|---|---|
| `wohnungen_list` | bookings:read | Wohnungen, Reinigungskraft, Reinigungssatz, Wäsche-Konfiguration |
| `buchungen_list` | bookings:read | Buchungen im Zeitraum, filterbar nach Wohnung/Kanal/Status |
| `anreisen_abreisen` | bookings:read | Wer kommt/geht an welchem Tag, Reinigung zugewiesen ja/nein |
| `belegung` | bookings:read | Auslastung in % je Wohnung und Monat, freie Lücken |
| `sync_status` | bookings:read | Letzter Smoobu-Sync, E-Mail-Import, Fehler |
| `reinigungen` | cleaning:read | Status, Reinigungskraft, Absagen, Wäsche |
| `umsatz` | finance:read | Umsatz je Monat und Kanal, erwartete Auszahlungen (Schätzung) |
| `ortstaxe` | finance:read | Nächte × Erwachsene × 3,50 €; Kinder je Buchung abziehbar |
| `auszahlungen_reinigung` | finance:read | Beträge je Reinigungskraft und Monat, offen/ausgezahlt |
| `reinigung_zuweisen` | cleaning:write | wie „Zuweisung ändern“ in der App, inkl. Benachrichtigung |
| `buchung_notiz` | cleaning:write | Notiz für die Reinigungskraft setzen |
| `gaestezahl_korrigieren` | cleaning:write | Gästezahl von Hand korrigieren (bleibt bei Sync erhalten) |
| `sync_ausloesen` | cleaning:write | Smoobu-Abgleich wie beim Öffnen der App |
| `wochenplan` | cleaning:read | Nächste N Tage mit Warnungen: ohne Reinigungskraft, abgesagt, Wäsche offen, Wechseltag |
| `reinigung_status` | cleaning:write | erledigt (Satz festschreiben) / Selbstreinigung / offen |
| `waesche_status` | cleaning:write | offen / bestellt / vorhanden, mit Notiz und Mengen (bestellt wird auf der Website der Wäscherei) |
| `gaeste_nachrichten` | messages:read | Chat mit dem Gast aus Smoobu (Airbnb, Booking.com, direkt) |
| `offene_gaestenachrichten` | messages:read | Aktuelle/kommende Buchungen, bei denen der Gast auf Antwort wartet |
| `gast_antworten` | messages:write | Nachricht an den Gast über Smoobu — nur nach Freigabe des Texts |

**Schreib-Tools ändern nur mit `"bestaetigt": true`.** Ohne liefern sie eine Vorschau
(„Das würde passieren: …“). Es gibt bewusst kein Löschen und keine Preis- oder
Smoobu-Änderungen. Nachrichten an Gäste gehen nur mit `messages:write` und
`"bestaetigt": true` raus; der Text wird vorher freigegeben.
Bestehende claude.ai-Verbindungen müssen für die `messages:*`-Bereiche einmal
getrennt und neu verbunden werden.

### Sicherheit

- Token nur als SHA-256-Hash in der DB; Klartext einmalig bei der Erstellung.
- Jeder Aufruf im Audit-Log (`mcp.<tool>`, Token, Ziel-Buchung, Parameter ohne Freitexte, Status, Dauer).
- 60 Aufrufe pro Minute und Token, danach 429 mit `Retry-After`.
- `/api/mcp` läuft nicht über die Login-Middleware, hat eigene Token-Prüfung und kein CORS.
  Ohne gültiges Token: 401 mit `WWW-Authenticate: Bearer resource_metadata=…` (dort findet claude.ai die Anmeldung).
- OAuth-Endpunkte: `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`,
  `/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`. Registrierung 10/min, Token 30/min pro IP.
- Jede Zustimmung, Ablehnung, Verbindung und Sperre steht im Audit-Log (`oauth.*`).

### Prüfen

```bash
npm test                                   # vitest gegen echte Postgres (PGlite)
MCP_TOKEN=v17_… npm run mcp:pruefen -- https://vils17-kalender.onrender.com/api/mcp
npx @modelcontextprotocol/inspector        # interaktiv, Transport „Streamable HTTP“
```
