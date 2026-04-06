// Standard-Provisionen pro Buchungskanal (in %)
// Kann später in den Einstellungen pro Organization konfiguriert werden.

// Airbnb: "Host-only Fee" Modell → ~15% + 20% MwSt (Österreich) = ~18%
// Booking.com: Standard-Provision inkl. MwSt ~17–20%
// FeWo-direkt / HomeAway: ~11–12%
// Diese Werte sind Schätzungen – echte Auszahlung immer aus Airbnb/Portal-Abrechnung prüfen
export const DEFAULT_COMMISSIONS: Record<string, number> = {
  "Airbnb": 18,
  "Booking.com": 18,
  "FeWo-direkt / HomeAway": 11,
  "HomeAway": 11,
  "FeWo-direkt": 11,
  "Vrbo": 8,
  "Expedia": 15,
};

export const DEFAULT_COMMISSION_FALLBACK = 0; // Direktbuchung / unbekannt

export function getCommission(channelName: string | null | undefined): number {
  if (!channelName) return DEFAULT_COMMISSION_FALLBACK;
  // Exakter Match
  if (DEFAULT_COMMISSIONS[channelName] !== undefined) {
    return DEFAULT_COMMISSIONS[channelName];
  }
  // Teilstring-Match (z.B. "Airbnb (extern)" → 3%)
  for (const [key, rate] of Object.entries(DEFAULT_COMMISSIONS)) {
    if (channelName.toLowerCase().includes(key.toLowerCase())) {
      return rate;
    }
  }
  return DEFAULT_COMMISSION_FALLBACK;
}

export function calcPayout(price: number, channelName: string | null | undefined): number {
  const commission = getCommission(channelName);
  return price * (1 - commission / 100);
}
