"use client";

import { useState, useMemo } from "react";
import { getYear, getMonth, differenceInCalendarDays } from "date-fns";
import { getCommission, calcPayout } from "@/lib/commissions";
import { TrendingUp, Calendar, Home, Info } from "lucide-react";

interface Apartment {
  id: string;
  name: string;
  color: string | null;
}

interface Booking {
  id: string;
  guestName: string;
  guestCount: number;
  checkIn: Date;
  checkOut: Date;
  channelName: string | null;
  price: number | null;
  currency: string | null;
  apartmentId: string;
  apartment: { name: string; color: string | null };
}

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function fmt(n: number): string {
  return n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nights(b: Booking): number {
  return Math.max(1, differenceInCalendarDays(new Date(b.checkOut), new Date(b.checkIn)));
}

const glassCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 20,
  overflow: "hidden",
};

export function StatisticsView({
  apartments,
  bookings,
}: {
  apartments: Apartment[];
  bookings: Booking[];
}) {
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const ys = new Set(bookings.map((b) => getYear(new Date(b.checkIn))));
    ys.add(currentYear);
    return Array.from(ys).sort((a, b) => b - a);
  }, [bookings, currentYear]);

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedAptId, setSelectedAptId] = useState<string>("all");

  const filtered = useMemo(() =>
    bookings.filter((b) => {
      const y = getYear(new Date(b.checkIn));
      return y === selectedYear && (selectedAptId === "all" || b.apartmentId === selectedAptId);
    }),
    [bookings, selectedYear, selectedAptId]
  );

  const monthlyData = useMemo(() => {
    return MONTHS.map((label, monthIdx) => {
      const monthBookings = filtered.filter((b) => getMonth(new Date(b.checkIn)) === monthIdx);
      const grossTotal = monthBookings.reduce((sum, b) => sum + (b.price ?? 0), 0);
      const payoutTotal = monthBookings.reduce((sum, b) =>
        sum + (b.price ? calcPayout(b.price, b.channelName) : 0), 0
      );
      const commissionTotal = grossTotal - payoutTotal;
      const nightsTotal = monthBookings.reduce((sum, b) => sum + nights(b), 0);
      return { label, monthIdx, bookings: monthBookings, grossTotal, payoutTotal, commissionTotal, nightsTotal };
    });
  }, [filtered]);

  const yearTotals = useMemo(() => ({
    gross: filtered.reduce((s, b) => s + (b.price ?? 0), 0),
    payout: filtered.reduce((s, b) => s + (b.price ? calcPayout(b.price, b.channelName) : 0), 0),
    bookings: filtered.length,
    nights: filtered.reduce((s, b) => s + nights(b), 0),
    noPriceCount: filtered.filter((b) => b.price === null).length,
  }), [filtered]);

  const channelBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; gross: number; payout: number }>();
    for (const b of filtered) {
      const ch = b.channelName ?? "Direkt / Unbekannt";
      const entry = map.get(ch) ?? { count: 0, gross: 0, payout: 0 };
      entry.count++;
      entry.gross += b.price ?? 0;
      entry.payout += b.price ? calcPayout(b.price, b.channelName) : 0;
      map.set(ch, entry);
    }
    return Array.from(map.entries())
      .map(([ch, v]) => ({ channel: ch, ...v, commission: getCommission(ch) }))
      .sort((a, b) => b.gross - a.gross);
  }, [filtered]);

  const hasAnyPrice = filtered.some((b) => b.price !== null);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Titel + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingUp style={{ width: 20, height: 20, color: "#14B8A6" }} />
            Statistiken
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Ertrag und Belegung im Überblick</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="form-input"
            style={{ width: "auto", paddingLeft: 12, paddingRight: 12 }}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={selectedAptId}
            onChange={(e) => setSelectedAptId(e.target.value)}
            className="form-input"
            style={{ width: "auto", paddingLeft: 12, paddingRight: 12 }}
          >
            <option value="all">Alle Wohnungen</option>
            {apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {/* Hinweis wenn kein Preis */}
      {!hasAnyPrice && filtered.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 14, fontSize: 13, color: "#fcd34d" }}>
          <Info style={{ width: 16, height: 16, marginTop: 1, flexShrink: 0 }} />
          <span>Noch keine Preis-Daten vorhanden — bitte einmal Sync starten um die Preise aus Smoobu zu laden.</span>
        </div>
      )}

      {/* Jahres-Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Umsatz brutto" value={hasAnyPrice ? `€ ${fmt(yearTotals.gross)}` : "–"} sub="inkl. Portalgebühren" accent="#14B8A6" />
        <SummaryCard label="Auszahlung netto" value={hasAnyPrice ? `€ ${fmt(yearTotals.payout)}` : "–"} sub="nach Provision" accent="#10b981" />
        <SummaryCard label="Buchungen" value={String(yearTotals.bookings)} sub={yearTotals.noPriceCount > 0 ? `${yearTotals.noPriceCount} ohne Preis` : "alle mit Preis"} accent="#3b82f6" />
        <SummaryCard label="Nächte" value={String(yearTotals.nights)} sub="Belegungsnächte" accent="#8b5cf6" />
      </div>

      {/* Monatsübersicht */}
      <div style={glassCard}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar style={{ width: 16, height: 16, color: "#14B8A6" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>Monatliche Übersicht {selectedYear}</span>
        </div>

        {/* Desktop-Tabelle */}
        <div className="hidden sm:block overflow-x-auto">
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {["Monat", "Buchungen", "Nächte", "Umsatz", "Provision", "Auszahlung"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 16px", fontWeight: 600, fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m) => {
                const hasData = m.bookings.length > 0;
                return (
                  <tr key={m.monthIdx} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "10px 16px", fontWeight: 600, color: hasData ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)" }}>{m.label}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: hasData ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)" }}>{hasData ? m.bookings.length : "–"}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: hasData ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)" }}>{hasData ? m.nightsTotal : "–"}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: hasData && m.grossTotal > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>
                      {hasData && m.grossTotal > 0 ? `€ ${fmt(m.grossTotal)}` : "–"}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: hasData && m.commissionTotal > 0 ? "#fca5a5" : "rgba(255,255,255,0.2)" }}>
                      {hasData && m.commissionTotal > 0 ? `–€ ${fmt(m.commissionTotal)}` : "–"}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: hasData && m.payoutTotal > 0 ? "#6ee7b7" : "rgba(255,255,255,0.2)" }}>
                      {hasData && m.payoutTotal > 0 ? `€ ${fmt(m.payoutTotal)}` : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {hasAnyPrice && (
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "10px 16px", fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Gesamt</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{yearTotals.bookings}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{yearTotals.nights}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>€ {fmt(yearTotals.gross)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#fca5a5" }}>–€ {fmt(yearTotals.gross - yearTotals.payout)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: "#6ee7b7" }}>€ {fmt(yearTotals.payout)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Mobile-Karten */}
        <div className="sm:hidden">
          {monthlyData.filter((m) => m.bookings.length > 0).map((m) => (
            <div key={m.monthIdx} style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.85)", fontSize: 14 }}>{m.label}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{m.bookings.length} Buchung{m.bookings.length !== 1 ? "en" : ""} · {m.nightsTotal} Nächte</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Umsatz</p>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>€ {fmt(m.grossTotal)}</p>
                </div>
                {m.commissionTotal > 0 && (
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Provision</p>
                    <p style={{ fontSize: 13, color: "#fca5a5" }}>–€ {fmt(m.commissionTotal)}</p>
                  </div>
                )}
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Auszahlung</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#6ee7b7" }}>€ {fmt(m.payoutTotal)}</p>
                </div>
              </div>
            </div>
          ))}
          {hasAnyPrice && (
            <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.85)", fontSize: 14 }}>Gesamt {selectedYear}</span>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Auszahlung gesamt</p>
                <p style={{ fontSize: 17, fontWeight: 700, color: "#6ee7b7" }}>€ {fmt(yearTotals.payout)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Kanal-Aufschlüsselung */}
      {channelBreakdown.length > 0 && (
        <div style={glassCard}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
            <Home style={{ width: 16, height: 16, color: "#14B8A6" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>Buchungskanäle {selectedYear}</span>
          </div>
          <div>
            {channelBreakdown.map((ch) => (
              <div key={ch.channel} style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>{ch.channel}</span>
                      {ch.commission > 0 && (
                        <span style={{ fontSize: 11, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", padding: "1px 7px", borderRadius: 20, fontWeight: 600 }}>
                          {ch.commission}%
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{ch.count} Buchung{ch.count !== 1 ? "en" : ""}</p>
                  </div>
                  {ch.gross > 0 && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>€ {fmt(ch.gross)}</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#6ee7b7" }}>→ € {fmt(ch.payout)}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              Schätzwerte: Airbnb 18%, Booking.com 18%, FeWo-direkt 11%, Direkt 0%
            </p>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
          Keine Buchungen für {selectedYear}{selectedAptId !== "all" ? " / diese Wohnung" : ""} gefunden.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.08)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 16,
      padding: 16,
    }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color: accent, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{sub}</p>
    </div>
  );
}
