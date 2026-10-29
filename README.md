# Vils17-Kalender

Ferienwohnungs-Management für Lodge No. 17 und Penthouse No. 17 in Vils/Tirol:
Buchungen aus Smoobu, Reinigungsplanung, Wäsche, Abrechnung der Reinigungskräfte.
Technische Details und Konventionen stehen in [CLAUDE.md](CLAUDE.md).

## Claude-Schnittstelle (MCP)

Claude kann Belegung, An-/Abreisen, Reinigung, Wäsche und Umsätze direkt abfragen
und — nach Bestätigung — Reinigungen zuweisen. Adresse:

```
https://vils17-kalender.onrender.com/api/mcp
```

### 1. Token anlegen

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

claude.ai (Handy, Cloud ohne Mac) braucht OAuth — das ist Stufe 3 und noch nicht gebaut.

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

**Schreib-Tools ändern nur mit `"bestaetigt": true`.** Ohne liefern sie eine Vorschau
(„Das würde passieren: …“). Es gibt bewusst kein Löschen, keine Preis- oder
Smoobu-Änderungen und keine Nachrichten an Gäste.

### Sicherheit

- Token nur als SHA-256-Hash in der DB; Klartext einmalig bei der Erstellung.
- Jeder Aufruf im Audit-Log (`mcp.<tool>`, Token, Ziel-Buchung, Parameter ohne Freitexte, Status, Dauer).
- 60 Aufrufe pro Minute und Token, danach 429 mit `Retry-After`.
- `/api/mcp` läuft nicht über die Login-Middleware, hat eigene Token-Prüfung und kein CORS.

### Prüfen

```bash
npm test                                   # vitest gegen echte Postgres (PGlite)
MCP_TOKEN=v17_… npm run mcp:pruefen -- https://vils17-kalender.onrender.com/api/mcp
npx @modelcontextprotocol/inspector        # interaktiv, Transport „Streamable HTTP“
```
