export interface LaundryQuantity {
  beds: number;
  towels: number;
  kitchen: number;
}

export interface LaundryOrderParams {
  bookingId: string;
  apartmentName: string;
  checkOut: Date;
  quantity: LaundryQuantity;
}

export interface LaundryOrderResult {
  success: boolean;
  orderId?: string;
  message?: string;
}

// Mengenberechnung basierend auf Gästeanzahl
export function calculateLaundryQuantity(
  guestCount: number
): LaundryQuantity {
  return {
    beds: guestCount,
    towels: guestCount * 2,
    kitchen: 1,
  };
}

// Phase 1: Mock-Adapter (nur Status setzen, kein echter API-Aufruf)
// Phase 2: Echter API-Adapter (LAUNDRY_API_ENABLED=true)
export async function orderLaundry(
  params: LaundryOrderParams
): Promise<LaundryOrderResult> {
  if (process.env.LAUNDRY_API_ENABLED !== "true") {
    // Mock: immer erfolgreich, keine externe Kommunikation
    console.log("[Laundry Mock] Order:", params);
    return {
      success: true,
      orderId: `MOCK-${Date.now()}`,
      message: "Bestellung intern vermerkt (API noch nicht verbunden)",
    };
  }

  // Phase 2: Echte API-Integration
  // Hier den API-Call zum Lieferanten implementieren:
  //
  // const res = await fetch(`${process.env.LAUNDRY_API_URL}/orders`, {
  //   method: "POST",
  //   headers: {
  //     "Authorization": `Bearer ${process.env.LAUNDRY_API_KEY}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     date: params.checkOut.toISOString().split("T")[0],
  //     apartment: params.apartmentName,
  //     beds: params.quantity.beds,
  //     towels: params.quantity.towels,
  //     kitchen: params.quantity.kitchen,
  //     reference: params.bookingId,
  //   }),
  // });
  //
  // if (!res.ok) {
  //   return { success: false, message: `API Fehler: ${res.status}` };
  // }
  //
  // const data = await res.json();
  // return { success: true, orderId: data.orderId };

  return { success: false, message: "API nicht implementiert" };
}
