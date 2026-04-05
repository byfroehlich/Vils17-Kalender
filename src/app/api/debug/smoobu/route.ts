import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { format, subDays, addDays } from "date-fns";

// Temporärer Debug-Endpunkt – gibt rohe Smoobu-Antwort zurück
// Nur für ADMIN zugänglich

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const apiKey = process.env.SMOOBU_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "SMOOBU_API_KEY nicht gesetzt" });
  }

  const headers = {
    "Api-Key": apiKey,
    "Content-Type": "application/json",
  };

  // Apartments
  const aptRes = await fetch("https://login.smoobu.com/api/apartments", { headers });
  const aptRaw = await aptRes.json();

  // Reservierungen
  const from = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const to = format(addDays(new Date(), 30), "yyyy-MM-dd");
  const url = `https://login.smoobu.com/api/reservations?from=${from}&to=${to}&pageSize=3&page=1`;
  const resRes = await fetch(url, { headers });
  const resRaw = await resRes.json();

  return NextResponse.json({
    apartments: aptRaw,
    reservations: resRaw,
    // Ersten Eintrag mit allen Feldnamen zeigen
    firstReservationKeys: resRaw?.bookings?.[0] ? Object.keys(resRaw.bookings[0]) : [],
    firstReservation: resRaw?.bookings?.[0] ?? null,
  });
}
