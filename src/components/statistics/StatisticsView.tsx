"use client";

import { useState, useMemo } from "react";
import { format, getYear, getMonth, differenceInCalendarDays } from "date-fns";
import { de } from "date-fns/locale";
import { getCommission, calcPayout, DEFAULT_COMMISSIONS } from "@/lib/commissions";
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

  // Monatliche Gruppierung
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

  // Kanal-Aufschlüsselung
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
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-zinc-400" />
            Statistiken
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">Ertrag und Belegung im Überblick</p>
        </div>
        <div className="flex gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-zinc-200 rounded-xl bg-white text-zinc-700 font-medium focus:outline-none focus:border-zinc-400"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={selectedAptId}
            onChange={(e) => setSelectedAptId(e.target.value)}
            className="px-3 py-2 text-sm border border-zinc-200 rounded-xl bg-white text-zinc-700 font-medium focus:outline-none focus:border-zinc-400"
          >
            <option value="all">Alle Wohnungen</option>
            {apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {/* Hinweis wenn Sync noch keine Preise hat */}
      {!hasAnyPrice && filtered.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Noch keine Preis-Daten vorhanden — bitte einmal Sync starten um die Preise aus Smoobu zu laden.</span>
        </div>
      )}

      {/* Jahres-Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Umsatz brutto"
          value={hasAnyPrice ? `€ ${fmt(yearTotals.gross)}` : "–"}
          sub="inkl. Portalgebühren"
          color="text-zinc-800"
        />
        <SummaryCard
          label="Auszahlung netto"
          value={hasAnyPrice ? `€ ${fmt(yearTotals.payout)}` : "–"}
          sub="nach Provision"
          color="text-green-700"
        />
        <SummaryCard
          label="Buchungen"
          value={String(yearTotals.bookings)}
          sub={`${yearTotals.noPriceCount > 0 ? `${yearTotals.noPriceCount} ohne Preis` : "alle mit Preis"}`}
          color="text-zinc-800"
        />
        <SummaryCard
          label="Nächte"
          value={String(yearTotals.nights)}
          sub="Belegungsnächte"
          color="text-zinc-800"
        />
      </div>

      {/* Monatsübersicht */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-800">Monatliche Übersicht {selectedYear}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-5 py-2.5 font-medium text-zinc-400 w-16">Monat</th>
                <th className="text-right px-4 py-2.5 font-medium text-zinc-400">Buchungen</th>
                <th className="text-right px-4 py-2.5 font-medium text-zinc-400">Nächte</th>
                <th className="text-right px-4 py-2.5 font-medium text-zinc-400">Umsatz brutto</th>
                <th className="text-right px-4 py-2.5 font-medium text-zinc-400">Provision</th>
                <th className="text-right px-5 py-2.5 font-medium text-zinc-800">Auszahlung</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m) => {
                const hasData = m.bookings.length > 0;
                return (
                  <tr key={m.monthIdx} className={`border-b border-zinc-50 ${hasData ? "hover:bg-zinc-50/60" : ""}`}>
                    <td className={`px-5 py-3 font-semibold ${hasData ? "text-zinc-800" : "text-zinc-300"}`}>
                      {m.label}
                    </td>
                    <td className={`px-4 py-3 text-right ${hasData ? "text-zinc-600" : "text-zinc-300"}`}>
                      {hasData ? m.bookings.length : "–"}
                    </td>
                    <td className={`px-4 py-3 text-right ${hasData ? "text-zinc-600" : "text-zinc-300"}`}>
                      {hasData ? m.nightsTotal : "–"}
                    </td>
                    <td className={`px-4 py-3 text-right ${hasData && m.grossTotal > 0 ? "text-zinc-700" : "text-zinc-300"}`}>
                      {hasData && m.grossTotal > 0 ? `€ ${fmt(m.grossTotal)}` : hasData ? "–" : "–"}
                    </td>
                    <td className={`px-4 py-3 text-right ${hasData && m.commissionTotal > 0 ? "text-red-400" : "text-zinc-300"}`}>
                      {hasData && m.commissionTotal > 0 ? `– € ${fmt(m.commissionTotal)}` : "–"}
                    </td>
                    <td className={`px-5 py-3 text-right font-semibold ${hasData && m.payoutTotal > 0 ? "text-green-700" : "text-zinc-300"}`}>
                      {hasData && m.payoutTotal > 0 ? `€ ${fmt(m.payoutTotal)}` : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {hasAnyPrice && (
              <tfoot>
                <tr className="border-t-2 border-zinc-200 bg-zinc-50/60">
                  <td className="px-5 py-3 font-bold text-zinc-800">Gesamt</td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-700">{yearTotals.bookings}</td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-700">{yearTotals.nights}</td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-700">€ {fmt(yearTotals.gross)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-400">– € {fmt(yearTotals.gross - yearTotals.payout)}</td>
                  <td className="px-5 py-3 text-right font-bold text-green-700">€ {fmt(yearTotals.payout)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Kanal-Aufschlüsselung */}
      {channelBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
            <Home className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold text-zinc-800">Buchungskanäle {selectedYear}</span>
          </div>
          <div className="divide-y divide-zinc-50">
            {channelBreakdown.map((ch) => (
              <div key={ch.channel} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium text-zinc-800 truncate">{ch.channel}</span>
                  {ch.commission > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-full font-medium">
                      {ch.commission}% Provision
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-6 flex-shrink-0 text-sm">
                  <span className="text-zinc-500">{ch.count} Buchung{ch.count !== 1 ? "en" : ""}</span>
                  {ch.gross > 0 && (
                    <>
                      <span className="text-zinc-600">€ {fmt(ch.gross)}</span>
                      <span className="font-semibold text-green-700 w-28 text-right">→ € {fmt(ch.payout)}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/60">
            <p className="text-xs text-zinc-400">
              Provisionen basieren auf Standardwerten ({Object.entries(DEFAULT_COMMISSIONS).map(([k, v]) => `${k} ${v}%`).join(", ")}). Direktbuchungen = 0%.
            </p>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-zinc-400 text-sm">
          Keine Buchungen für {selectedYear}{selectedAptId !== "all" ? " / diese Wohnung" : ""} gefunden.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-4">
      <p className="text-xs font-medium text-zinc-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>
    </div>
  );
}
