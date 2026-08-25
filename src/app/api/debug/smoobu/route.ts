import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { format, subDays, addDays } from "date-fns";

// Debug-Endpunkt – gibt die ROHE Smoobu-Antwort zurück, nur für ADMIN.
//
// Aufrufe:
//   /api/debug/smoobu                  → Apartments + erste 3 Buchungen
//   /api/debug/smoobu?guest=Spengler   → Rohdaten aller Buchungen mit diesem Gastnamen
//   /api/debug/smoobu?id=12345         → Rohdaten der Buchung mit dieser Smoobu-ID
//
// Bei ?guest= / ?id= wird zusätzlich gezeigt, welche Gästezahl die App aus den
// Rohdaten berechnet — damit sichtbar ist, ob eine Abweichung von Smoobu kommt
// oder aus unserer Umrechnung.

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

  const guestQuery = req.nextUrl.searchParams.get("guest");
  const idQuery = req.nextUrl.searchParams.get("id");

  // ─── Suche nach einer konkreten Buchung ────────────────────────────────────
  if (guestQuery || idQuery) {
    const from = format(subDays(new Date(), 365), "yyyy-MM-dd");
    const to = format(addDays(new Date(), 365), "yyyy-MM-dd");
    const needle = guestQuery?.toLowerCase() ?? "";

    const matches: Record<string, unknown>[] = [];
    let page = 1;
    let scanned = 0;

    while (page <= 30) {
      const url = `https://login.smoobu.com/api/reservations?from=${from}&to=${to}&pageSize=100&page=${page}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        return NextResponse.json({ error: `Smoobu API ${res.status}`, page }, { status: 502 });
      }
      const raw = await res.json();
      const bookings: Record<string, unknown>[] = Array.isArray(raw?.bookings) ? raw.bookings : [];
      scanned += bookings.length;

      for (const b of bookings) {
        const name = String(b["guest-name"] ?? b.firstname ?? "").toLowerCase();
        const hit = idQuery ? String(b.id) === idQuery : name.includes(needle);
        if (hit) matches.push(b);
      }

      const totalPages: number = raw?.page_count ?? raw?.totalPages ?? 1;
      if (page >= totalPages || bookings.length < 100) break;
      page++;
    }

    return NextResponse.json({
      gesucht: idQuery ? { id: idQuery } : { guest: guestQuery },
      durchsucht: scanned,
      treffer: matches.length,
      buchungen: matches.map((b) => ({
        // Was die App daraus macht — exakt die Formel aus smoobu.ts
        appBerechnet: {
          guestCount:
            ((b.adults as number | null | undefined) ?? 1) +
            ((b.children as number | null | undefined) ?? 0),
          hinweis:
            b.adults === undefined || b.adults === null
              ? "adults fehlt in Smoobu → Notwert 1 verwendet"
              : "adults kam von Smoobu",
        },
        gaesteFelder: {
          adults: b.adults ?? null,
          children: b.children ?? null,
        },
        // Alle Feldnamen, damit ein abweichend benanntes Gästefeld auffällt
        alleFeldnamen: Object.keys(b),
        roh: b,
      })),
    });
  }

  // ─── Standard: Überblick ───────────────────────────────────────────────────
  const aptRes = await fetch("https://login.smoobu.com/api/apartments", { headers });
  const aptRaw = await aptRes.json();

  const from = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const to = format(addDays(new Date(), 30), "yyyy-MM-dd");
  const url = `https://login.smoobu.com/api/reservations?from=${from}&to=${to}&pageSize=3&page=1`;
  const resRes = await fetch(url, { headers });
  const resRaw = await resRes.json();

  return NextResponse.json({
    apartments: aptRaw,
    reservations: resRaw,
    firstReservationKeys: resRaw?.bookings?.[0] ? Object.keys(resRaw.bookings[0]) : [],
    firstReservation: resRaw?.bookings?.[0] ?? null,
  });
}
