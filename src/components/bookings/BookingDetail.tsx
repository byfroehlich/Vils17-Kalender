"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateLong, formatDate, getCleaningStatusColor, getLaundryStatusColor } from "@/lib/utils";
import { Users, Calendar, Home, Globe, ArrowLeft, Brush, WashingMachine, CheckCircle } from "lucide-react";
import Link from "next/link";

// Re-export helper from utils for component use
function calculateLaundry(count: number) {
  return { beds: count, towels: count * 2, kitchen: 1 };
}

interface Cleaner {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}

interface Booking {
  id: string;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestCount: number;
  checkIn: Date;
  checkOut: Date;
  arrivalTime?: string | null;
  departureTime?: string | null;
  channelName?: string | null;
  apartment: { name: string; color?: string | null };
  cleaningAssignment?: {
    id: string;
    status: string;
    isSelfClean: boolean;
    notes?: string | null;
    laundryStatus: string;
    laundryNotes?: string | null;
    laundryOrderId?: string | null;
    laundryOrderedAt?: Date | null;
    cleaner?: { id: string; name: string } | null;
  } | null;
}

export function BookingDetail({
  booking,
  cleaners,
}: {
  booking: Booking;
  cleaners: Cleaner[];
}) {
  const router = useRouter();
  const assignment = booking.cleaningAssignment;

  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showLaundryDialog, setShowLaundryDialog] = useState(false);
  const [selectedCleaner, setSelectedCleaner] = useState(assignment?.cleaner?.id ?? "");
  const [isSelfClean, setIsSelfClean] = useState(assignment?.isSelfClean ?? false);
  const [cleaningNotes, setCleaningNotes] = useState(assignment?.notes ?? "");
  const [laundryNotes, setLaundryNotes] = useState(assignment?.laundryNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const qty = calculateLaundry(booking.guestCount);

  async function assignCleaner() {
    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cleanerId: isSelfClean ? null : selectedCleaner || null,
          isSelfClean,
          notes: cleaningNotes,
        }),
      });
      if (res.ok) {
        setMessage("✓ Reiniger zugewiesen");
        setShowAssignDialog(false);
        router.refresh();
      } else {
        setMessage("Fehler beim Speichern");
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  }

  async function updateLaundryStatus(status: string) {
    const res = await fetch(`/api/bookings/${booking.id}/laundry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status, notes: laundryNotes }),
    });
    if (res.ok) {
      setMessage("✓ Wäschestatus aktualisiert");
      router.refresh();
    }
    setTimeout(() => setMessage(""), 3000);
  }

  async function orderLaundry() {
    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/laundry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "order", notes: laundryNotes }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✓ Wäsche bestellt${data.orderId ? ` (Nr. ${data.orderId})` : ""}`);
        setShowLaundryDialog(false);
        router.refresh();
      } else {
        setMessage(data.message ?? "Bestellung fehlgeschlagen");
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 5000);
    }
  }

  const cleaningStatus = assignment?.status ?? "UNASSIGNED";
  const laundryStatus = assignment?.laundryStatus ?? "OPEN";

  const cleaningStatusLabel: Record<string, string> = {
    UNASSIGNED: "Offen",
    SELF_CLEAN: "Selbstreinigung",
    ASSIGNED: `Zugewiesen an ${assignment?.cleaner?.name ?? "–"}`,
    COMPLETED: "Erledigt",
  };

  const laundryStatusLabel: Record<string, string> = {
    OPEN: "Offen",
    ORDERED: "Bestellt",
    AVAILABLE: "Vorhanden",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Zurück */}
      <Link
        href="/bookings"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-800 font-medium text-lg"
      >
        <ArrowLeft className="w-5 h-5" />
        Alle Buchungen
      </Link>

      {/* Erfolgs-/Fehlermeldung */}
      {message && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 font-semibold text-lg">
          {message}
        </div>
      )}

      {/* Buchungsdaten */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: booking.apartment.color ?? "#3b82f6" }}
          />
          <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {booking.apartment.name}
          </span>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-6">{booking.guestName}</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <InfoRow icon={<Users className="w-6 h-6 text-gray-400" />} label="Gäste">
            <span className="text-2xl font-bold">
              {booking.guestCount}{" "}
              {booking.guestCount === 1 ? "Person" : "Personen"}
            </span>
          </InfoRow>

          <InfoRow icon={<Calendar className="w-6 h-6 text-gray-400" />} label="Anreise">
            <span className="font-semibold">{formatDateLong(booking.checkIn)}</span>
            {booking.arrivalTime && (
              <span className="text-gray-500"> ab {booking.arrivalTime} Uhr</span>
            )}
          </InfoRow>

          <InfoRow icon={<Calendar className="w-6 h-6 text-gray-400" />} label="Abreise">
            <span className="font-semibold">{formatDateLong(booking.checkOut)}</span>
            {booking.departureTime && (
              <span className="text-gray-500"> bis {booking.departureTime} Uhr</span>
            )}
          </InfoRow>

          {booking.channelName && (
            <InfoRow icon={<Globe className="w-6 h-6 text-gray-400" />} label="Buchungskanal">
              <span className="font-semibold">{booking.channelName}</span>
            </InfoRow>
          )}

          {booking.guestEmail && (
            <InfoRow icon={<Home className="w-6 h-6 text-gray-400" />} label="E-Mail Gast">
              <a href={`mailto:${booking.guestEmail}`} className="text-blue-600 underline">
                {booking.guestEmail}
              </a>
            </InfoRow>
          )}

          {booking.guestPhone && (
            <InfoRow icon={<Home className="w-6 h-6 text-gray-400" />} label="Tel. Gast">
              <a href={`tel:${booking.guestPhone}`} className="text-blue-600 underline">
                {booking.guestPhone}
              </a>
            </InfoRow>
          )}
        </div>
      </div>

      {/* Reinigung */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brush className="w-7 h-7 text-gray-500" />
            Reinigung
          </h2>
          <span
            className={`px-4 py-1.5 rounded-full text-base font-semibold border ${getCleaningStatusColor(cleaningStatus)}`}
          >
            {cleaningStatusLabel[cleaningStatus]}
          </span>
        </div>

        {assignment?.notes && (
          <div className="mb-4 p-4 bg-gray-50 rounded-xl text-gray-700">
            <p className="font-medium text-gray-500 text-sm mb-1">Hinweise:</p>
            <p>{assignment.notes}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowAssignDialog(true)}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-lg"
          >
            <Brush className="w-5 h-5" />
            Reiniger zuweisen
          </button>

          {cleaningStatus === "ASSIGNED" && (
            <button
              onClick={async () => {
                await fetch(`/api/bookings/${booking.id}/cleaning-status`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "COMPLETED" }),
                });
                router.refresh();
              }}
              className="flex items-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors text-lg"
            >
              <CheckCircle className="w-5 h-5" />
              Als erledigt markieren
            </button>
          )}
        </div>
      </div>

      {/* Wäsche */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <WashingMachine className="w-7 h-7 text-gray-500" />
            Wäsche
          </h2>
          <span
            className={`px-4 py-1.5 rounded-full text-base font-semibold border ${getLaundryStatusColor(laundryStatus)}`}
          >
            {laundryStatusLabel[laundryStatus]}
          </span>
        </div>

        {/* Menge */}
        <div className="mb-5 p-4 bg-gray-50 rounded-xl">
          <p className="text-gray-500 text-sm font-medium mb-2">Benötigte Menge:</p>
          <div className="flex gap-6 text-lg font-semibold text-gray-800">
            <span>🛏️ {qty.beds} Bettsets</span>
            <span>🛁 {qty.towels} Handtücher</span>
            <span>🍽️ {qty.kitchen} Küchentuch</span>
          </div>
        </div>

        {/* Wäsche-Notizen */}
        <div className="mb-5">
          <label className="block text-gray-600 font-medium mb-2">Bemerkungen zur Wäsche</label>
          <textarea
            value={laundryNotes}
            onChange={(e) => setLaundryNotes(e.target.value)}
            onBlur={async () => {
              if (laundryNotes !== assignment?.laundryNotes) {
                await fetch(`/api/bookings/${booking.id}/laundry`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "status", status: laundryStatus, notes: laundryNotes }),
                });
              }
            }}
            placeholder="z.B. bei Müller bestellt, Bestellnummer 1234..."
            rows={2}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg focus:border-blue-400 focus:outline-none resize-none"
          />
        </div>

        {/* Status-Buttons */}
        <div className="flex flex-wrap gap-3 mb-4">
          {(["OPEN", "ORDERED", "AVAILABLE"] as const).map((s) => {
            const label = { OPEN: "🔴 Offen", ORDERED: "🟡 Bestellt", AVAILABLE: "🟢 Vorhanden" };
            return (
              <button
                key={s}
                onClick={() => updateLaundryStatus(s)}
                className={`px-5 py-3 rounded-xl font-semibold text-lg border-2 transition-colors ${
                  laundryStatus === s
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                {label[s]}
              </button>
            );
          })}
        </div>

        {/* Bestellen-Button */}
        {laundryStatus !== "ORDERED" && (
          <button
            onClick={() => setShowLaundryDialog(true)}
            className="flex items-center gap-2 px-5 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-xl transition-colors text-lg"
          >
            <WashingMachine className="w-5 h-5" />
            Wäsche bestellen
          </button>
        )}

        {assignment?.laundryOrderId && (
          <p className="mt-3 text-gray-500 text-sm">
            Bestell-Nr.: {assignment.laundryOrderId}
            {assignment.laundryOrderedAt && (
              <span> · Bestellt am {formatDate(new Date(assignment.laundryOrderedAt))}</span>
            )}
          </p>
        )}
      </div>

      {/* Dialog: Reiniger zuweisen */}
      {showAssignDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-2xl font-bold mb-6">Reiniger zuweisen</h3>

            <div className="space-y-3 mb-5">
              {/* Selbst reinigen */}
              <label className="flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer hover:border-blue-400 transition-colors">
                <input
                  type="radio"
                  name="cleaner"
                  checked={isSelfClean}
                  onChange={() => { setIsSelfClean(true); setSelectedCleaner(""); }}
                  className="w-5 h-5"
                />
                <div>
                  <p className="font-semibold text-lg">Selbst reinigen</p>
                  <p className="text-gray-500">Keine Benachrichtigung wird gesendet</p>
                </div>
              </label>

              {/* Reinigungskräfte */}
              {cleaners.map((cleaner) => (
                <label
                  key={cleaner.id}
                  className="flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer hover:border-blue-400 transition-colors"
                >
                  <input
                    type="radio"
                    name="cleaner"
                    checked={!isSelfClean && selectedCleaner === cleaner.id}
                    onChange={() => { setIsSelfClean(false); setSelectedCleaner(cleaner.id); }}
                    className="w-5 h-5"
                  />
                  <div>
                    <p className="font-semibold text-lg">{cleaner.name}</p>
                    <p className="text-gray-500">{cleaner.email}</p>
                    {cleaner.phone && <p className="text-gray-400 text-sm">{cleaner.phone}</p>}
                  </div>
                </label>
              ))}
            </div>

            <div className="mb-5">
              <label className="block font-medium text-gray-700 mb-2">Hinweise für Reiniger</label>
              <textarea
                value={cleaningNotes}
                onChange={(e) => setCleaningNotes(e.target.value)}
                placeholder="Was soll besonders beachtet werden?"
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg focus:border-blue-400 focus:outline-none resize-none"
              />
              {!isSelfClean && selectedCleaner && (
                <p className="text-sm text-blue-600 mt-1">
                  ℹ️ Der Reiniger wird per E-Mail und WhatsApp benachrichtigt.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={assignCleaner}
                disabled={saving || (!isSelfClean && !selectedCleaner)}
                className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-xl text-lg transition-colors"
              >
                {saving ? "Wird gespeichert..." : "Zuweisen"}
              </button>
              <button
                onClick={() => setShowAssignDialog(false)}
                className="px-6 py-4 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl text-lg hover:border-gray-400 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Wäsche bestellen */}
      {showLaundryDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-2xl font-bold mb-4">Wäsche bestellen?</h3>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
              <p className="text-lg text-yellow-800">
                Es werden bestellt:
              </p>
              <ul className="mt-2 space-y-1 text-yellow-900 font-semibold">
                <li>🛏️ {qty.beds} Bettsets</li>
                <li>🛁 {qty.towels} Handtücher</li>
                <li>🍽️ {qty.kitchen} Küchenhandtuch</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                onClick={orderLaundry}
                disabled={saving}
                className="flex-1 py-4 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-white font-semibold rounded-xl text-lg transition-colors"
              >
                {saving ? "Wird bestellt..." : "Jetzt bestellen"}
              </button>
              <button
                onClick={() => setShowLaundryDialog(false)}
                className="px-6 py-4 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl text-lg hover:border-gray-400 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div>
        <p className="text-sm text-gray-500 font-medium mb-0.5">{label}</p>
        <div className="text-gray-900 text-lg">{children}</div>
      </div>
    </div>
  );
}
