"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateLong, formatDate, getCleaningStatusColor, getLaundryStatusColor } from "@/lib/utils";
import { Users, Calendar, Globe, Phone, Mail, ArrowLeft, Sparkles, WashingMachine, CheckCircle, Clock } from "lucide-react";
import Link from "next/link";

interface Cleaner {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}

interface Apartment {
  name: string;
  color?: string | null;
  laundryBedsDivisor?: number | null;
  laundryTowelsPerGuest?: number | null;
  laundryKitchenCount?: number | null;
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
  apartment: Apartment;
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

function calcLaundry(guestCount: number, apt: Apartment) {
  const divisor = apt.laundryBedsDivisor ?? 2;
  const towelsPerGuest = apt.laundryTowelsPerGuest ?? 1;
  const kitchenCount = apt.laundryKitchenCount ?? 1;
  return {
    beds: Math.ceil(guestCount / divisor),
    towels: guestCount * towelsPerGuest,
    kitchen: kitchenCount,
  };
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

  const qty = calcLaundry(booking.guestCount, booking.apartment);
  const cleaningStatus = assignment?.status ?? "UNASSIGNED";
  const laundryStatus = assignment?.laundryStatus ?? "OPEN";

  const cleanerName = assignment?.cleaner?.name;
  const cleaningStatusLabel: Record<string, string> = {
    UNASSIGNED: "Offen",
    SELF_CLEAN: "Selbstreinigung",
    ASSIGNED: cleanerName ? `Zugewiesen · ${cleanerName}` : "Zugewiesen",
    COMPLETED: cleanerName ? `Erledigt · ${cleanerName}` : "Erledigt",
  };

  const laundryStatusLabel: Record<string, string> = {
    OPEN: "Offen",
    ORDERED: "Bestellt",
    AVAILABLE: "Vorhanden",
  };

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

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Zurück */}
      <Link
        href="/bookings"
        className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-800 font-medium text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Alle Buchungen
      </Link>

      {/* Rückmeldung */}
      {message && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-800 font-medium text-sm">
          {message}
        </div>
      )}

      {/* Buchungsdaten */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {/* Farbstreifen oben */}
        <div className="h-1.5" style={{ backgroundColor: booking.apartment.color ?? "#3b82f6" }} />
        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {booking.apartment.name}
            </span>
            {booking.channelName && (
              <>
                <span className="text-zinc-300">·</span>
                <span className="text-xs text-zinc-400">{booking.channelName}</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-5">{booking.guestName}</h1>

          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <InfoRow icon={<Calendar className="w-4 h-4" />} label="Anreise">
              <span className="font-semibold text-zinc-800">{formatDateLong(booking.checkIn)}</span>
              {booking.arrivalTime && (
                <span className="text-zinc-400 text-sm ml-1">ab {booking.arrivalTime} Uhr</span>
              )}
            </InfoRow>

            <InfoRow icon={<Calendar className="w-4 h-4" />} label="Abreise">
              <span className="font-semibold text-zinc-800">{formatDateLong(booking.checkOut)}</span>
              {booking.departureTime && (
                <span className="text-zinc-400 text-sm ml-1">bis {booking.departureTime} Uhr</span>
              )}
            </InfoRow>

            <InfoRow icon={<Users className="w-4 h-4" />} label="Gäste">
              <span className="font-semibold text-zinc-800">
                {booking.guestCount} {booking.guestCount === 1 ? "Person" : "Personen"}
              </span>
            </InfoRow>

            {booking.guestPhone && (
              <InfoRow icon={<Phone className="w-4 h-4" />} label="Telefon">
                <a href={`tel:${booking.guestPhone}`} className="font-semibold text-blue-600 hover:underline">
                  {booking.guestPhone}
                </a>
              </InfoRow>
            )}

            {booking.guestEmail && (
              <InfoRow icon={<Mail className="w-4 h-4" />} label="E-Mail">
                <a href={`mailto:${booking.guestEmail}`} className="font-semibold text-blue-600 hover:underline truncate block max-w-[180px]">
                  {booking.guestEmail}
                </a>
              </InfoRow>
            )}

            {booking.channelName && (
              <InfoRow icon={<Globe className="w-4 h-4" />} label="Kanal">
                <span className="font-semibold text-zinc-800">{booking.channelName}</span>
              </InfoRow>
            )}
          </div>
        </div>
      </div>

      {/* Reinigung */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-zinc-400" />
            Reinigung
          </h2>
          <StatusBadge type="cleaning" status={cleaningStatus} label={cleaningStatusLabel[cleaningStatus] ?? cleaningStatus} />
        </div>

        {/* Reiniger-Kontakt */}
        {assignment?.cleaner && (
          <div className="mb-3 flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
            <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-600 flex-shrink-0">
              {assignment.cleaner.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900">{assignment.cleaner.name}</p>
            </div>
          </div>
        )}

        {assignment?.notes && (
          <div className="mb-4 p-3 bg-zinc-50 rounded-xl text-sm text-zinc-600 border border-zinc-100">
            {assignment.notes}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAssignDialog(true)}
            className="btn-primary text-sm py-2 px-4"
          >
            <Sparkles className="w-4 h-4" />
            {cleaningStatus === "UNASSIGNED" ? "Reiniger zuweisen" : "Zuweisung ändern"}
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
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              <CheckCircle className="w-4 h-4" />
              Erledigt
            </button>
          )}
        </div>
      </div>

      {/* Wäsche */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <WashingMachine className="w-4 h-4 text-zinc-400" />
            Wäsche
          </h2>
          <StatusBadge type="laundry" status={laundryStatus} label={laundryStatusLabel[laundryStatus] ?? laundryStatus} />
        </div>

        {/* Mengen-Chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          <QuantityChip emoji="🛏" value={qty.beds} label="Bettsets" />
          <QuantityChip emoji="🛁" value={qty.towels} label="Handtücher" />
          <QuantityChip emoji="🍽" value={qty.kitchen} label="Küchenhandtücher" />
        </div>

        {/* Status-Toggle */}
        <div className="flex gap-2 mb-4">
          {(["OPEN", "ORDERED", "AVAILABLE"] as const).map((s) => {
            const labels = { OPEN: "Offen", ORDERED: "Bestellt", AVAILABLE: "Vorhanden" };
            const active = laundryStatus === s;
            return (
              <button
                key={s}
                onClick={() => updateLaundryStatus(s)}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm border transition-colors ${
                  active
                    ? "border-zinc-800 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400"
                }`}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>

        {/* Bemerkungen */}
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
          placeholder="Bemerkungen zur Wäsche…"
          rows={2}
          className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:border-zinc-400 focus:outline-none resize-none text-zinc-700 placeholder-zinc-300 mb-3"
        />

        {laundryStatus !== "ORDERED" && (
          <button
            onClick={() => setShowLaundryDialog(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            <WashingMachine className="w-4 h-4" />
            Wäsche bestellen
          </button>
        )}

        {assignment?.laundryOrderId && (
          <p className="mt-3 text-xs text-zinc-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Bestell-Nr.: {assignment.laundryOrderId}
            {assignment.laundryOrderedAt && (
              <span> · {formatDate(new Date(assignment.laundryOrderedAt))}</span>
            )}
          </p>
        )}
      </div>

      {/* Dialog: Reiniger zuweisen */}
      {showAssignDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Reiniger zuweisen</h3>

            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer hover:border-zinc-400 transition-colors">
                <input
                  type="radio"
                  name="cleaner"
                  checked={isSelfClean}
                  onChange={() => { setIsSelfClean(true); setSelectedCleaner(""); }}
                  className="w-4 h-4 accent-zinc-800"
                />
                <div>
                  <p className="font-semibold text-sm text-zinc-800">Selbst reinigen</p>
                  <p className="text-xs text-zinc-400">Keine Benachrichtigung</p>
                </div>
              </label>

              {cleaners.map((cleaner) => (
                <label
                  key={cleaner.id}
                  className="flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer hover:border-zinc-400 transition-colors"
                >
                  <input
                    type="radio"
                    name="cleaner"
                    checked={!isSelfClean && selectedCleaner === cleaner.id}
                    onChange={() => { setIsSelfClean(false); setSelectedCleaner(cleaner.id); }}
                    className="w-4 h-4 accent-zinc-800"
                  />
                  <div>
                    <p className="font-semibold text-sm text-zinc-800">{cleaner.name}</p>
                    <p className="text-xs text-zinc-400">{cleaner.email}{cleaner.phone ? ` · ${cleaner.phone}` : ""}</p>
                  </div>
                </label>
              ))}

              {cleaners.length === 0 && (
                <p className="text-sm text-zinc-400 px-3">Noch keine Reinigungskräfte angelegt.</p>
              )}
            </div>

            <textarea
              value={cleaningNotes}
              onChange={(e) => setCleaningNotes(e.target.value)}
              placeholder="Hinweise für den Reiniger…"
              rows={2}
              className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:border-zinc-400 focus:outline-none resize-none mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={assignCleaner}
                disabled={saving || (!isSelfClean && !selectedCleaner)}
                className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-700 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                {saving ? "Wird gespeichert…" : "Zuweisen"}
              </button>
              <button
                onClick={() => setShowAssignDialog(false)}
                className="px-4 py-2.5 border border-zinc-200 text-zinc-600 font-semibold rounded-xl text-sm hover:border-zinc-400 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Wäsche bestellen */}
      {showLaundryDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-1">Wäsche bestellen</h3>
            <p className="text-sm text-zinc-400 mb-4">Folgende Mengen werden bestellt:</p>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-5 space-y-1.5">
              <QuantityChip emoji="🛏" value={qty.beds} label="Bettsets" />
              <QuantityChip emoji="🛁" value={qty.towels} label="Handtücher" />
              <QuantityChip emoji="🍽" value={qty.kitchen} label="Küchenhandtücher" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={orderLaundry}
                disabled={saving}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-200 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                {saving ? "Wird bestellt…" : "Jetzt bestellen"}
              </button>
              <button
                onClick={() => setShowLaundryDialog(false)}
                className="px-4 py-2.5 border border-zinc-200 text-zinc-600 font-semibold rounded-xl text-sm hover:border-zinc-400 transition-colors"
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
    <div>
      <div className="flex items-center gap-1 text-xs text-zinc-400 font-medium mb-0.5">
        {icon}
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function QuantityChip({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 rounded-lg text-sm font-medium text-zinc-700">
      {emoji} <span className="font-bold">{value}</span> {label}
    </span>
  );
}

function StatusBadge({ type, status, label }: { type: "cleaning" | "laundry"; status: string; label: string }) {
  const color = type === "cleaning" ? getCleaningStatusColor(status) : getLaundryStatusColor(status);
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${color}`}>
      {label}
    </span>
  );
}
