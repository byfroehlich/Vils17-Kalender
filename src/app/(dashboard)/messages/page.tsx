import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findUnansweredChats } from "@/lib/guest-chat-overview";
import { petFee, PET_FEE_LABEL } from "@/lib/pets";
import { todayVienna, addDays } from "@/lib/mcp/format";
import { formatDate } from "@/lib/utils";
import { listNoteSuggestions } from "@/lib/note-suggestions";
import { NoteSuggestionsBox } from "@/components/messages/NoteSuggestionsBox";
import { ChatDoneButton } from "@/components/messages/ChatDoneButton";
import { formatMessageTime } from "@/lib/message-seen";

export const dynamic = "force-dynamic";

const glass = { background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20 } as const;
const h2 = { fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 12 } as const;
const row = { display: "block", padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", textDecoration: "none", color: "rgba(255,255,255,0.85)" } as const;

export default async function MessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");
  const organizationId = session.user.organizationId;

  const today = todayVienna();
  const [chats, dogBookings, suggestions] = await Promise.all([
    findUnansweredChats({ organizationId, days: 30 }),
    prisma.booking.findMany({
      where: { organizationId, status: "confirmed", petCount: { gt: 0 }, checkOut: { gte: today }, checkIn: { lt: addDays(today, 366) } },
      orderBy: { checkIn: "asc" },
      select: { id: true, guestName: true, checkIn: true, checkOut: true, channelName: true, petCount: true, petFeeStatus: true, petFeeAmount: true, apartment: { select: { name: true } } },
    }),
    listNoteSuggestions(organizationId),
  ]);
  const fees = dogBookings.map((b) => ({ b, fee: petFee(b) })).filter((x) => x.fee.state === "OFFEN" || x.fee.state === "ANGEFORDERT");

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", gap: 8 }}>
        <MessageCircle style={{ width: 20, height: 20, color: "#14B8A6" }} /> Gäste
      </h1>

      {suggestions.length > 0 && (
        <div id="hinweise" style={{ ...glass, padding: "20px 24px" }}>
          <h2 style={h2}>⭐ Hinweise für die Reinigung bestätigen ({suggestions.length})</h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>Aus den Gästechats erkannt. „Übernehmen“ schreibt den Hinweis in den Reinigungsauftrag und benachrichtigt die Reinigungskraft.</p>
          <NoteSuggestionsBox
            items={suggestions.map((s) => ({
              id: s.id, proposedText: s.proposedText, excerpt: s.excerpt, extraBeds: s.extraBeds,
              bookingId: s.booking.id, guestName: s.booking.guestName, apartmentName: s.booking.apartment.name,
              checkInLabel: formatDate(s.booking.checkIn),
              currentNotes: s.booking.cleaningAssignment?.notes?.trim() || null,
              currentExtraBeds: s.booking.cleaningAssignment?.extraBeds ?? 0,
              cleanerName: s.booking.cleaningAssignment?.cleaner?.name ?? null,
            }))}
          />
        </div>
      )}

      <div id="chats" style={{ ...glass, padding: "20px 24px" }}>
        <h2 style={h2}>Wartet auf Antwort ({chats.open.length})</h2>
        {chats.open.length === 0 && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>Keine offenen Gästenachrichten (Anreisen der nächsten 30 Tage und laufende Aufenthalte).</p>}
        <div className="space-y-2">
          {chats.open.map(({ booking: b, last }) => (
            <div key={b.id} style={row}>
              <Link href={`/bookings/${b.id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{b.apartment.name} · {b.channelName ?? "Direkt"} · {formatDate(b.checkIn)}–{formatDate(b.checkOut)}</div>
                <div style={{ fontWeight: 700, margin: "2px 0" }}>{b.guestName}</div>
                <div style={{ fontSize: 12, color: last.time?.at ? "#fcd34d" : "rgba(255,255,255,0.45)", marginBottom: 2 }}>🕒 {formatMessageTime(last.time)}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{last.text}</div>
              </Link>
              <div style={{ marginTop: 8 }}><ChatDoneButton bookingId={b.id} messageId={last.id} /></div>
            </div>
          ))}
        </div>
        {chats.truncated && <p style={{ fontSize: 12, color: "#fcd34d", marginTop: 8 }}>Nur die ersten 25 Buchungen geprüft.</p>}
        {chats.errors.length > 0 && <p style={{ fontSize: 12, color: "#fca5a5", marginTop: 8 }}>{chats.errors.length} Chat(s) konnten nicht geladen werden.</p>}
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginTop: 10 }}>Antworten direkt in der Airbnb- oder Booking-App sieht Smoobu nicht — solche Chats stehen trotzdem hier. Braucht ein Chat keine Antwort, auf „Erledigt“ tippen — schreibt der Gast erneut, erscheint er wieder.</p>
      </div>

      <div style={{ ...glass, padding: "20px 24px" }}>
        <h2 style={h2}>Hundegebühren offen ({fees.length})</h2>
        {fees.length === 0 && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>Keine offenen Hundegebühren.</p>}
        <div className="space-y-2">
          {fees.map(({ b, fee }) => (
            <Link key={b.id} href={`/bookings/${b.id}`} style={row}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{b.apartment.name} · {b.channelName ?? "Direkt"} · {formatDate(b.checkIn)}–{formatDate(b.checkOut)}</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{b.guestName}</strong>
                <span>{fee.amount} € · {PET_FEE_LABEL[fee.state]}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
