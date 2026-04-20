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
  petCount?: number | null;
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

const glass = {
  background: "rgba(255,255,255,0.15)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.26)",
  borderRadius: 20,
} as React.CSSProperties;

const glassAmber = {
  background: "rgba(245,158,11,0.1)",
  border: "1px solid rgba(245,158,11,0.3)",
  borderRadius: 16,
  padding: "16px",
} as React.CSSProperties;

function calcLaundry(guestCount: number, apt: Apartment) {
  return {
    beds: Math.ceil(guestCount / (apt.laundryBedsDivisor ?? 2)),
    towels: guestCount * (apt.laundryTowelsPerGuest ?? 1),
    kitchen: apt.laundryKitchenCount ?? 1,
  };
}

export function BookingDetail({ booking, cleaners }: { booking: Booking; cleaners: Cleaner[] }) {
  const router = useRouter();
  const assignment = booking.cleaningAssignment;

  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showLaundryDialog, setShowLaundryDialog] = useState(false);
  const [selectedCleaner, setSelectedCleaner] = useState(assignment?.cleaner?.id ?? "");
  const [isSelfClean, setIsSelfClean] = useState(assignment?.isSelfClean ?? false);
  const [cleaningNotes, setCleaningNotes] = useState(assignment?.notes ?? "");
  const [laundryNotes, setLaundryNotes] = useState(assignment?.laundryNotes ?? "");
  const [petCount, setPetCount] = useState<number | null>(booking.petCount ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const qty = calcLaundry(booking.guestCount, booking.apartment);
  const cleaningStatus = assignment?.status ?? "UNASSIGNED";
  const laundryStatus  = assignment?.laundryStatus ?? "OPEN";
  const cleanerName    = assignment?.cleaner?.name;

  const cleaningStatusLabel: Record<string, string> = {
    UNASSIGNED: "Offen",
    SELF_CLEAN: "Selbstreinigung",
    ASSIGNED:   cleanerName ? `Zugewiesen · ${cleanerName}` : "Zugewiesen",
    COMPLETED:  cleanerName ? `Erledigt · ${cleanerName}` : "Erledigt",
  };
  const laundryStatusLabel: Record<string, string> = {
    OPEN: "Offen", ORDERED: "Bestellt", AVAILABLE: "Vorhanden",
  };

  async function assignCleaner() {
    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleanerId: isSelfClean ? null : selectedCleaner || null, isSelfClean, notes: cleaningNotes }),
      });
      if (res.ok) { setMessage("✓ Reiniger zugewiesen"); setShowAssignDialog(false); router.refresh(); }
      else setMessage("Fehler beim Speichern");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  }

  async function updateLaundryStatus(status: string) {
    await fetch(`/api/bookings/${booking.id}/laundry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status, notes: laundryNotes }),
    });
    setMessage("✓ Wäschestatus aktualisiert");
    router.refresh();
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
      } else setMessage(data.message ?? "Bestellung fehlgeschlagen");
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
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} />
        Alle Buchungen
      </Link>

      {/* Feedback */}
      {message && (
        <div style={{ padding: "10px 16px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 12, color: "#86efac", fontSize: 14, fontWeight: 600 }}>
          {message}
        </div>
      )}

      {/* Buchungsdaten */}
      <div style={{ ...glass, overflow: "hidden" }}>
        <div style={{ height: 4, backgroundColor: booking.apartment.color ?? "#0D9488" }} />
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.60)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {booking.apartment.name}
            </span>
            {booking.channelName && (
              <>
                <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{booking.channelName}</span>
              </>
            )}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: 20, letterSpacing: "-0.02em" }}>
            {booking.guestName}
          </h1>

          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <InfoRow icon={<Calendar style={{ width: 14, height: 14 }} />} label="Anreise">
              <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{formatDateLong(booking.checkIn)}</span>
              {booking.arrivalTime && <span style={{ color: "rgba(255,255,255,0.60)", fontSize: 13, marginLeft: 4 }}>ab {booking.arrivalTime} Uhr</span>}
            </InfoRow>
            <InfoRow icon={<Calendar style={{ width: 14, height: 14 }} />} label="Abreise">
              <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{formatDateLong(booking.checkOut)}</span>
              {booking.departureTime && <span style={{ color: "rgba(255,255,255,0.60)", fontSize: 13, marginLeft: 4 }}>bis {booking.departureTime} Uhr</span>}
            </InfoRow>
            <InfoRow icon={<Users style={{ width: 14, height: 14 }} />} label="Gäste">
              <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
                {booking.guestCount} {booking.guestCount === 1 ? "Person" : "Personen"}
              </span>
            </InfoRow>
            <InfoRow icon={<span style={{ fontSize: 13 }}>🐕</span>} label="Haustiere">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  min={0}
                  max={9}
                  value={petCount ?? ""}
                  placeholder="0"
                  onChange={(e) => setPetCount(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                  onBlur={async () => {
                    const res = await fetch(`/api/bookings/${booking.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ petCount: petCount ?? null }),
                    });
                    if (res.ok) { setMessage("✓ Haustiere gespeichert"); setTimeout(() => setMessage(""), 2000); }
                  }}
                  style={{
                    width: 56, padding: "4px 8px", borderRadius: 8,
                    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 600,
                    textAlign: "center",
                  }}
                />
                {petCount != null && petCount > 0 && (
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                    {petCount === 1 ? "Hund" : "Hunde"}
                  </span>
                )}
              </div>
            </InfoRow>
            {booking.guestPhone && (
              <InfoRow icon={<Phone style={{ width: 14, height: 14 }} />} label="Telefon">
                <a href={`tel:${booking.guestPhone}`} style={{ fontWeight: 600, color: "#14B8A6" }}>{booking.guestPhone}</a>
              </InfoRow>
            )}
            {booking.guestEmail && (
              <InfoRow icon={<Mail style={{ width: 14, height: 14 }} />} label="E-Mail">
                <a href={`mailto:${booking.guestEmail}`} style={{ fontWeight: 600, color: "#14B8A6", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: 180 }}>
                  {booking.guestEmail}
                </a>
              </InfoRow>
            )}
            {booking.channelName && (
              <InfoRow icon={<Globe style={{ width: 14, height: 14 }} />} label="Kanal">
                <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{booking.channelName}</span>
              </InfoRow>
            )}
          </div>
        </div>
      </div>

      {/* Reinigung */}
      <div style={{ ...glass, padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles style={{ width: 16, height: 16, color: "#14B8A6" }} />
            Reinigung
          </h2>
          <StatusBadge type="cleaning" status={cleaningStatus} label={cleaningStatusLabel[cleaningStatus] ?? cleaningStatus} />
        </div>

        {assignment?.cleaner && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(255,255,255,0.06)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(13,148,136,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#14B8A6", flexShrink: 0 }}>
              {assignment.cleaner.name.charAt(0)}
            </div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>{assignment.cleaner.name}</p>
          </div>
        )}

        {assignment?.notes && (
          <div style={{ marginBottom: 14, padding: "10px 14px", background: "rgba(255,255,255,0.05)", borderRadius: 10, fontSize: 13, color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {assignment.notes}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
          <button onClick={() => setShowAssignDialog(true)} className="btn-primary text-sm" style={{ padding: "8px 16px", fontSize: 13 }}>
            <Sparkles style={{ width: 14, height: 14 }} />
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
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 12, color: "#4ade80", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              <CheckCircle style={{ width: 14, height: 14 }} />
              Erledigt
            </button>
          )}
        </div>
      </div>

      {/* Wäsche */}
      <div style={{ ...glass, padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", gap: 8 }}>
            <WashingMachine style={{ width: 16, height: 16, color: "#14B8A6" }} />
            Wäsche
          </h2>
          <StatusBadge type="laundry" status={laundryStatus} label={laundryStatusLabel[laundryStatus] ?? laundryStatus} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 16 }}>
          <QuantityChip emoji="🛏" value={qty.beds} label="Bettsets" />
          <QuantityChip emoji="🛁" value={qty.towels} label="Handtücher" />
          <QuantityChip emoji="🍽" value={qty.kitchen} label="Küchenhandtücher" />
        </div>

        {/* Status-Toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {(["OPEN", "ORDERED", "AVAILABLE"] as const).map((s) => {
            const labels = { OPEN: "Offen", ORDERED: "Bestellt", AVAILABLE: "Vorhanden" };
            const active = laundryStatus === s;
            return (
              <button
                key={s}
                onClick={() => updateLaundryStatus(s)}
                style={{
                  padding: "6px 14px", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer",
                  background: active ? "rgba(13,148,136,0.3)" : "rgba(255,255,255,0.06)",
                  border: active ? "1px solid rgba(13,148,136,0.5)" : "1px solid rgba(255,255,255,0.12)",
                  color: active ? "#14B8A6" : "rgba(255,255,255,0.5)",
                }}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>

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
          className="form-input"
          style={{ resize: "none", marginBottom: 12 }}
        />

        {laundryStatus !== "ORDERED" && (
          <button
            onClick={() => setShowLaundryDialog(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 12, color: "#fcd34d", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            <WashingMachine style={{ width: 14, height: 14 }} />
            Wäsche bestellen
          </button>
        )}

        {assignment?.laundryOrderId && (
          <p style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 4 }}>
            <Clock style={{ width: 12, height: 12 }} />
            Bestell-Nr.: {assignment.laundryOrderId}
            {assignment.laundryOrderedAt && <span> · {formatDate(new Date(assignment.laundryOrderedAt))}</span>}
          </p>
        )}
      </div>

      {/* Dialog: Reiniger zuweisen */}
      {showAssignDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, padding: "16px 16px max(calc(env(safe-area-inset-bottom) + 72px), 80px) 16px" }}>
          <div style={{ background: "#041f1c", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 24, width: "100%", maxWidth: 480, padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: 16 }}>Reiniger zuweisen</h3>

            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "2px solid rgba(255,255,255,0.12)", borderRadius: 14, cursor: "pointer" }}>
                <input type="radio" name="cleaner" checked={isSelfClean} onChange={() => { setIsSelfClean(true); setSelectedCleaner(""); }} style={{ accentColor: "#14B8A6" }} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>Selbst reinigen</p>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Keine Benachrichtigung</p>
                </div>
              </label>
              {cleaners.map((cleaner) => (
                <label key={cleaner.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "2px solid rgba(255,255,255,0.12)", borderRadius: 14, cursor: "pointer" }}>
                  <input type="radio" name="cleaner" checked={!isSelfClean && selectedCleaner === cleaner.id} onChange={() => { setIsSelfClean(false); setSelectedCleaner(cleaner.id); }} style={{ accentColor: "#14B8A6" }} />
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{cleaner.name}</p>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{cleaner.email}{cleaner.phone ? ` · ${cleaner.phone}` : ""}</p>
                  </div>
                </label>
              ))}
              {cleaners.length === 0 && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "0 14px" }}>Noch keine Reinigungskräfte angelegt.</p>
              )}
            </div>

            <textarea
              value={cleaningNotes}
              onChange={(e) => setCleaningNotes(e.target.value)}
              placeholder="Hinweise für den Reiniger…"
              rows={2}
              className="form-input"
              style={{ resize: "none", marginBottom: 14 }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={assignCleaner} disabled={saving || (!isSelfClean && !selectedCleaner)} className="btn-primary" style={{ flex: 1, padding: "10px 0" }}>
                {saving ? "Wird gespeichert…" : "Zuweisen"}
              </button>
              <button onClick={() => setShowAssignDialog(false)} className="btn-secondary" style={{ padding: "10px 18px" }}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Wäsche bestellen */}
      {showLaundryDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, padding: "16px 16px max(calc(env(safe-area-inset-bottom) + 72px), 80px) 16px" }}>
          <div style={{ background: "#041f1c", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 24, width: "100%", maxWidth: 400, padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: 4 }}>Wäsche bestellen</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", marginBottom: 16 }}>Folgende Mengen werden bestellt:</p>
            <div style={{ ...glassAmber, display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 20 }}>
              <QuantityChip emoji="🛏" value={qty.beds} label="Bettsets" />
              <QuantityChip emoji="🛁" value={qty.towels} label="Handtücher" />
              <QuantityChip emoji="🍽" value={qty.kitchen} label="Küchenhandtücher" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={orderLaundry}
                disabled={saving}
                style={{ flex: 1, padding: "10px 0", background: "rgba(245,158,11,0.25)", border: "1px solid rgba(245,158,11,0.5)", borderRadius: 12, color: "#fcd34d", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}
              >
                {saving ? "Wird bestellt…" : "Jetzt bestellen"}
              </button>
              <button onClick={() => setShowLaundryDialog(false)} className="btn-secondary" style={{ padding: "10px 18px" }}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 500, marginBottom: 3 }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  );
}

function QuantityChip({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>
      {emoji} <strong style={{ color: "rgba(255,255,255,0.95)" }}>{value}</strong> {label}
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
