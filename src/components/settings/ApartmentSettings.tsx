"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil, Check, X } from "lucide-react";

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
  _count: { bookings: number };
}

export function ApartmentSettings({ apartments }: { apartments: Apartment[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function startEdit(apt: Apartment) {
    setEditingId(apt.id);
    setEditName(apt.name);
    setEditColor(apt.color ?? "#3b82f6");
  }

  async function saveEdit(id: string) {
    setSaving(true);
    await fetch(`/api/apartments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, color: editColor }),
    });
    setSaving(false);
    setEditingId(null);
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
    <div className="bg-white rounded-2xl border border-zinc-200">
      <div className="px-6 py-4 border-b border-zinc-100">
        <h2 className="font-semibold text-zinc-900">Unterkünfte</h2>
        <p className="text-sm text-zinc-500 mt-0.5">Name und Farbe im Kalender anpassen</p>
      </div>

      <div className="divide-y divide-zinc-100">
        {apartments.map((apt) => (
          <div key={apt.id} className="px-6 py-4">
            {editingId === apt.id ? (
              /* Bearbeitungs-Modus */
              <div className="space-y-3">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="form-input"
                  placeholder="Name der Unterkunft"
                />
                <div>
                  <p className="text-sm font-medium text-zinc-600 mb-2">Kalenderfarbe</p>
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
                    <p className={`font-medium ${apt.active ? "text-zinc-900" : "text-zinc-400 line-through"}`}>
                      {apt.name}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {apt.smoobuId ? `Smoobu ID: ${apt.smoobuId}` : "Manuell angelegt"} · {apt._count.bookings} Buchungen
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => startEdit(apt)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteApartment(apt.id, apt._count.bookings)}
                    disabled={deleting === apt.id}
                    className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
