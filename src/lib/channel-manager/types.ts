// ─── Gemeinsames Interface für alle Channel Manager ──────────────────────────
// Jeder Adapter (Smoobu, Booking.com, Airbnb...) gibt dieses Format zurück.
// sync.ts arbeitet nur mit diesem Format – nie mit rohen API-Antworten.

export interface NormalizedApartment {
  externalId: number;
  name: string;
}

export interface NormalizedReservation {
  externalId: number;
  apartmentExternalId: number;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  guestCount: number;
  checkIn: Date;
  checkOut: Date;
  arrivalTime: string | null;
  departureTime: string | null;
  channelName: string | null;
  price: number | null;
  currency: string | null;
  /** Freitext-Notiz des Portals (Gastnachricht, Sonderwünsche, Haustiere …) */
  notice: string | null;
  status: "confirmed" | "cancelled";
}

export interface ChannelManagerAdapter {
  /** Identifikator für Logs / UI */
  readonly name: string;

  fetchApartments(): Promise<NormalizedApartment[]>;

  fetchReservations(params: {
    from: string; // YYYY-MM-DD
    to: string;   // YYYY-MM-DD
  }): Promise<NormalizedReservation[]>;
}
