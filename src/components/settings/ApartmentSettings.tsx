"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil, Check, X, Bot } from "lucide-react";

const COLOR_OPTIONS = [
  "#3b82f6", // Blau
  "#8b5cf6", // Violett
  "#10b981", // Grün
  "#f59e0b", // Amber
  "#ef4444", // Rot
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#14b8a6", // Teal
];

interface Apartment {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
  smoobuId: number | null;
  laundryBedsDivisor: number;
  laundryTowelsPerGuest: number;
  laundryKitchenCount: number;
  dreameEnabled: boolean;
  _count: { bookings: number };
}

export function ApartmentSettings({ apartments }: { apartments: Apartment[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editBedsDivisor, setEditBedsDivisor] = useState(2);
  const [editTowelsPerGuest, setEditTowelsPerGuest] = useState(1);
  const [editKitchenCount, setEditKitchenCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [togglingDreame, setTogglingDreame] = useState<string | null>(null);

  function startEdit(apt: Apartment) {
    setEditingId(apt.id);
    setEditName(apt.name);
    setEditColor(apt.color ?? "#3b82f6");
    setEditBedsDivisor(apt.laundryBedsDivisor ?? 2);
    setEditTowelsPerGuest(apt.laundryTowelsPerGuest ?? 1);
    setEditKitchenCount(apt.laundryKitchenCount ?? 1);
    setSaveError(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/apartments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        color: editColor,
        laundryBedsDivisor: editBedsDivisor,
        laundryTowelsPerGuest: editTowelsPerGuest,
        laundryKitchenCount: editKitchenCount,
      }),
    });
    setSaving(false);
    if (!res.ok) { setSaveError("Speichern fehlgeschlagen"); return; }
    setEditingId(null);
    router.refresh();
  }

  async function toggleDreame(apt: Apartment) {
    setTogglingDreame(apt.id);
    const res = await fetch(`/api/apartments/${apt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dreameEnabled: !apt.dreameEnabled }),
    });
    setTogglingDreame(null);
    if (!res.ok) { alert("Fehler beim Speichern"); return; }
    router.refresh();
  }

  async function deleteApartment(id: string, bookingCount: number) {
    const msg = bookingCount > 0
      ? `Diese Unterkunft hat ${bookingCount} Buchungen und wird deaktiviert (nicht gelöscht). Fortfahren?`
      : "Unterkunft wirklich löschen?";
    if (!confirm(msg)) return;

    setDeleting(id);
    await fetch(`/api/apartments/${id}`, { method: "DELETE" });
    setDeleting(null);
    router.refresh();
  }

  return (
    <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 20 }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <h2 style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 15 }}>Unterkünfte</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Name, Farbe und Wäsche-Mengen anpassen</p>
      </div>

      <div className="divide-y divide-white/5">
        {apartments.map((apt) => (
          <div key={apt.id} style={{ padding: "16px 24px" }}>
            {editingId === apt.id ? (
              /* Bearbeitungs-Modus */
              <div className="space-y-5">
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.55)", marginBottom: 6, display: "block" }}>Name</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="form-input"
                    placeholder="Name der Unterkunft"
                  />
                </div>

                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.55)", marginBottom: 8, display: "block" }}>Kalenderfarbe</p>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c)}
                        className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: c,
                          borderColor: editColor === c ? "#18181b" : "transparent",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Wäsche-Konfiguration */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 12, display: "block" }}>Wäsche-Mengen</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.4)", marginBottom: 6, display: "block" }}>
                        Bettsets: 1 pro … Gäste
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={editBedsDivisor}
                          onChange={(e) => setEditBedsDivisor(Number(e.target.value))}
                          className="form-input w-20 text-center"
                        />
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Gäste/Set</span>
                      </div>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, display: "block" }}>
                        z.B. 2 = 1 Set pro Doppelzimmer
                      </p>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.4)", marginBottom: 6, display: "block" }}>
                        Handtücher pro Gast
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={editTowelsPerGuest}
                          onChange={(e) => setEditTowelsPerGuest(Number(e.target.value))}
                          className="form-input w-20 text-center"
                        />
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Stück/Gast</span>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.4)", marginBottom: 6, display: "block" }}>
                        Küchenhandtücher pro Buchung
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={editKitchenCount}
                          onChange={(e) => setEditKitchenCount(Number(e.target.value))}
                          className="form-input w-20 text-center"
                        />
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Stück/Buchung</span>
                      </div>
                    </div>
                  </div>
                </div>

                {saveError && (
                  <p style={{ fontSize: 13, color: "#fca5a5" }}>{saveError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(apt.id)}
                    disabled={saving}
                    className="btn-primary py-2 px-4 text-sm"
                  >
                    <Check className="w-4 h-4" />
                    Speichern
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="btn-secondary py-2 px-4 text-sm"
                  >
                    <X className="w-4 h-4" />
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              /* Anzeige-Modus */
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: apt.color ?? "#3b82f6" }}
                  />
                  <div className="min-w-0">
                    <p style={{ fontWeight: 500, color: apt.active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)", textDecoration: apt.active ? "none" : "line-through" }}>
                      {apt.name}
                    </p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "block" }}>
                      {apt.smoobuId ? `Smoobu ID: ${apt.smoobuId}` : "Manuell angelegt"} · {apt._count.bookings} Buchungen
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      🛏 1 Set/{apt.laundryBedsDivisor ?? 2} Gäste · 🛁 {apt.laundryTowelsPerGuest ?? 1}/Gast · 🍽 {apt.laundryKitchenCount ?? 1}/Buchung
                    </p>
                    {apt.dreameEnabled && (
                      <p style={{ fontSize: 11, color: "#10b981", marginTop: 2 }}>
                        Roboter aktiv · ID: <span style={{ fontFamily: "monospace" }}>{apt.id}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleDreame(apt)}
                    disabled={togglingDreame === apt.id}
                    title={apt.dreameEnabled ? "Saugroboter aktiv — klicken zum Deaktivieren" : "Saugroboter inaktiv — klicken zum Aktivieren"}
                    style={{
                      padding: 8, borderRadius: 8, cursor: "pointer", border: "none",
                      background: apt.dreameEnabled ? "rgba(16,185,129,0.15)" : "transparent",
                      color: apt.dreameEnabled ? "#10b981" : "rgba(255,255,255,0.25)",
                      transition: "all 0.2s",
                    }}
                  >
                    <Bot className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => startEdit(apt)}
                    style={{ padding: 8, borderRadius: 8, color: "rgba(255,255,255,0.4)", cursor: "pointer", background: "transparent", border: "none" }}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteApartment(apt.id, apt._count.bookings)}
                    disabled={deleting === apt.id}
                    style={{ padding: 8, borderRadius: 8, color: "rgba(255,255,255,0.4)", cursor: "pointer", background: "transparent", border: "none" }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
