import Link from "next/link";
import { darkGlass } from "@/components/dashboard/admin/AdminOverview";
import {
  ABSCHNITT_LABEL,
  STATS_PERIODS,
  WOHNUNG_LABEL,
  formatDuration,
  type CountRow,
  type WebsiteStats,
} from "@/lib/website-stats";

// Seite „Website“: Besuchermessung vils17.at im dunklen Glas-Stil (Entscheidung Mathias 06.11.2026).
// Reine Server-Komponente — der Zeitraum wechselt über ?tage=7|30|90.

const label = { fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.64)" } as const;
const muted = "rgba(255,255,255,0.64)";
const accent = "#2DD4BF";

const GERAET: Record<string, string> = { mobil: "Smartphone", tablet: "Tablet", desktop: "Computer" };
const SPRACHE: Record<string, string> = { de: "Deutsch", en: "Englisch", nl: "Niederländisch", fr: "Französisch", it: "Italienisch", cs: "Tschechisch", pl: "Polnisch" };
const KONTAKT: Record<string, string> = { telefon: "Telefon", mail: "E-Mail", whatsapp: "WhatsApp" };
const QUELLE: Record<string, string> = { direkt: "Direkt / Lesezeichen", google: "Google", airbnb: "Airbnb", "booking.com": "Booking.com", instagram: "Instagram", facebook: "Facebook", smoobu: "Smoobu" };
const SEITE: Record<string, string> = { "/": "Startseite", "/penthouse/": "Penthouse", "/lodge/": "Lodge", "/stammgast/": "Stammgast", "/datenschutz/": "Datenschutz", "/impressum/": "Impressum" };

const fmtDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
};
const num = (n: number) => n.toLocaleString("de-AT");

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section style={{ ...darkGlass, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, paddingBottom: 10 }}>
        <h2 style={label}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function BarList({ rows, names = {}, unit = "Besuche", empty = "Noch keine Daten" }: { rows: CountRow[]; names?: Record<string, string>; unit?: string; empty?: string }) {
  if (!rows.length) return <p style={{ fontSize: 13, color: muted }}>{empty}</p>;
  const max = Math.max(...rows.map((r) => r.besuche), 1);
  return (
    <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0 }}>
      {rows.slice(0, 10).map((r) => (
        <li key={r.key} title={`${num(r.besuche)} ${unit}`}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{names[r.key] ?? r.key}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: muted }}>{num(r.besuche)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", marginTop: 4 }}>
            <div style={{ height: 6, borderRadius: 3, width: `${Math.max(2, (r.besuche / max) * 100)}%`, background: "linear-gradient(90deg, #0D9488, #2DD4BF)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Kpi({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div style={{ ...darkGlass, borderRadius: 20, padding: "14px 16px", minWidth: 0 }}>
      <p style={{ fontSize: 12, color: muted }}>{title}</p>
      <p style={{ fontSize: 26, fontWeight: 300, lineHeight: 1.2, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: muted, marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

function DailyChart({ stats }: { stats: WebsiteStats }) {
  const rows = stats.verlauf;
  const max = Math.max(...rows.map((r) => r.besucher), 1);
  const W = 700;
  const H = 140;
  const gap = rows.length > 40 ? 1 : 3;
  const bw = W / rows.length - gap;
  const step = rows.length > 31 ? 14 : rows.length > 10 ? 5 : 1;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label="Besucher pro Tag" style={{ display: "block" }}>
        {rows.map((r, i) => {
          const h = (r.besucher / max) * H;
          const x = i * (bw + gap);
          return (
            <g key={r.tag}>
              <title>{`${fmtDay(r.tag)}: ${r.besucher} Besucher, ${r.seitenaufrufe} Seitenaufrufe, ${r.buchungsklicks} Buchungsklicks`}</title>
              <rect x={x} y={H - h} width={Math.max(bw, 1)} height={Math.max(h, r.besucher ? 2 : 0)} rx={Math.min(3, bw / 2)} fill={accent} opacity={0.85} />
              {r.besucher === 0 && <rect x={x} y={H - 1} width={Math.max(bw, 1)} height={1} fill="rgba(255,255,255,0.15)" />}
              {r.buchungsklicks > 0 && <circle cx={x + bw / 2} cy={Math.max(H - h - 6, 4)} r={3} fill="#FBBF24" />}
              {i % step === 0 && (
                <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.5)">{fmtDay(r.tag)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption style={{ display: "flex", gap: 14, fontSize: 12, color: muted, marginTop: 6 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: accent, marginRight: 6 }} />Besucher</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: "#FBBF24", marginRight: 6 }} />Tag mit Buchungsklick</span>
      </figcaption>
    </figure>
  );
}

export function WebsiteStatsView({ stats }: { stats: WebsiteStats }) {
  const klicks = stats.buchungsklicks.reduce((s, b) => s + b.klicks, 0);
  const seitenRows: CountRow[] = stats.seiten.map((p) => ({ key: p.path, besuche: p.aufrufe }));
  const abschnittRows = stats.abschnitte;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100, color: "#FFFFFF" }}>
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 300 }}>Website vils17.at</h1>
          <p style={{ fontSize: 13, color: muted, marginTop: 2 }}>
            {fmtDay(stats.von)} – {fmtDay(stats.bis)} · cookielos gemessen, ein Besuch = ein Besucher pro Tag
          </p>
        </div>
        <nav aria-label="Zeitraum" style={{ display: "flex", gap: 6 }}>
          {STATS_PERIODS.map((t) => {
            const active = t === stats.tage;
            return (
              <Link
                key={t}
                href={`/website?tage=${t}`}
                aria-current={active ? "page" : undefined}
                style={{
                  minHeight: 36, padding: "0 14px", borderRadius: 18, display: "flex", alignItems: "center", fontSize: 13, fontWeight: 600, textDecoration: "none",
                  ...(active
                    ? { background: "linear-gradient(135deg, #2DD4BF 0%, #0D9488 100%)", color: "#031512" }
                    : { border: "0.5px solid rgba(255,255,255,0.22)", color: "#FFFFFF" }),
                }}
              >
                {t} Tage
              </Link>
            );
          })}
        </nav>
      </header>

      {stats.seitenaufrufe === 0 && (
        <div style={{ ...darkGlass, borderRadius: 18, padding: "12px 16px", fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.8)" }}>
          In diesem Zeitraum gibt es noch keine Messdaten. Sobald die Website mit dem Messskript ausgeliefert ist, erscheinen hier die ersten Besuche.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Kpi title="Besucher" value={num(stats.besucher)} sub={`${stats.seitenJeBesuch.toLocaleString("de-AT")} Seiten je Besuch`} />
        <Kpi title="Seitenaufrufe" value={num(stats.seitenaufrufe)} />
        <Kpi title="Mittlere Verweildauer" value={formatDuration(stats.mittlereVerweildauerSek)} sub={`Scrolltiefe Ø ${stats.mittlereScrolltiefe} %`} />
        <Kpi title="Buchungsklicks" value={num(klicks)} sub={stats.stammgastEintragungen ? `${stats.stammgastEintragungen} Stammgast-Eintragungen` : undefined} />
      </div>

      <Card title="Verlauf pro Tag">
        <DailyChart stats={stats} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <Card title="Weg zur Buchung">
          <ol style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none", padding: 0 }}>
            {stats.trichter.map((t, i) => (
              <li key={t.schritt}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                  <span>{i + 1}. {t.schritt}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: muted }}>{num(t.besuche)} · {t.anteil.toLocaleString("de-AT")} %</span>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.08)", marginTop: 4 }}>
                  <div style={{ height: 10, borderRadius: 5, width: `${Math.max(t.besuche ? 2 : 0, t.anteil)}%`, background: "linear-gradient(90deg, #0D9488, #2DD4BF)" }} />
                </div>
              </li>
            ))}
          </ol>
          <p style={{ fontSize: 12, color: muted, marginTop: 10, lineHeight: 1.4 }}>Jede Stufe zählt Besuche, die auch alle Stufen davor erreicht haben. Klicks direkt auf der Startseite stehen bei „Buchungsklicks je Wohnung“.</p>
        </Card>

        <Card title="Buchungsklicks je Wohnung">
          {stats.buchungsklicks.length === 0 ? (
            <p style={{ fontSize: 13, color: muted }}>Noch keine Klicks</p>
          ) : (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: muted, textAlign: "left" }}>
                  <th style={{ fontWeight: 500, paddingBottom: 6 }}>Wohnung</th>
                  <th style={{ fontWeight: 500, paddingBottom: 6, textAlign: "right" }}>„Jetzt buchen“</th>
                  <th style={{ fontWeight: 500, paddingBottom: 6, textAlign: "right" }}>Maske benutzt</th>
                </tr>
              </thead>
              <tbody>
                {stats.buchungsklicks.map((b) => (
                  <tr key={b.wohnung} style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)" }}>
                    <td style={{ padding: "8px 0" }}>{WOHNUNG_LABEL[b.wohnung] ?? b.wohnung}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(b.klicks)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(b.maskeBenutzt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: muted, marginTop: 10, lineHeight: 1.4 }}>„Maske benutzt“ = Besuche, in denen jemand in die eingebettete Smoobu-Buchungsmaske getippt hat.</p>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <Card title="Herkunft"><BarList rows={stats.herkunft} names={QUELLE} /></Card>
        <Card title="Seiten"><BarList rows={seitenRows} names={SEITE} unit="Aufrufe" /></Card>
        <Card title="Gesehene Abschnitte"><BarList rows={abschnittRows} names={ABSCHNITT_LABEL} /></Card>
        <Card title="Geräte"><BarList rows={stats.geraete} names={GERAET} /></Card>
        <Card title="Länder"><BarList rows={stats.laender} empty="Noch keine Daten" /></Card>
        <Card title="Sprachen"><BarList rows={stats.sprachen} names={SPRACHE} /></Card>
        {stats.kampagnen.length > 0 && <Card title="Kampagnen (utm)"><BarList rows={stats.kampagnen} /></Card>}
        <Card title="Kontakt-Klicks"><BarList rows={stats.kontakt} names={KONTAKT} unit="Klicks" empty="Noch keine Klicks" /></Card>
      </div>

      {stats.seiten.length > 0 && (
        <Card title="Verweildauer je Seite">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", minWidth: 420 }}>
              <thead>
                <tr style={{ color: muted, textAlign: "left" }}>
                  <th style={{ fontWeight: 500, paddingBottom: 6 }}>Seite</th>
                  <th style={{ fontWeight: 500, textAlign: "right" }}>Aufrufe</th>
                  <th style={{ fontWeight: 500, textAlign: "right" }}>Besucher</th>
                  <th style={{ fontWeight: 500, textAlign: "right" }}>Ø Dauer</th>
                  <th style={{ fontWeight: 500, textAlign: "right" }}>Ø Scrolltiefe</th>
                </tr>
              </thead>
              <tbody>
                {stats.seiten.map((p) => (
                  <tr key={p.path} style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)", fontVariantNumeric: "tabular-nums" }}>
                    <td style={{ padding: "8px 0" }}>{SEITE[p.path] ?? p.path}</td>
                    <td style={{ textAlign: "right" }}>{num(p.aufrufe)}</td>
                    <td style={{ textAlign: "right" }}>{num(p.besucher)}</td>
                    <td style={{ textAlign: "right" }}>{formatDuration(p.mittlereVerweildauerSek)}</td>
                    <td style={{ textAlign: "right" }}>{p.mittlereScrolltiefe} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>
        Gemessen ohne Cookies und ohne Speicherung auf dem Gerät; IP-Adressen werden nicht gespeichert, Do-Not-Track wird beachtet.
        Länder erscheinen nur, wenn ein vorgeschalteter Dienst sie mitliefert. Rohdaten werden nach 13 Monaten gelöscht.
      </p>
    </div>
  );
}
