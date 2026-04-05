"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Power, Trash2, Phone, Mail } from "lucide-react";

interface Cleaner {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  language: string;
  active: boolean;
  _count: { assignments: number };
}

export function CleanerList({ cleaners }: { cleaners: Cleaner[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", password: "", phone: "", notes: "", language: "de",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function startEdit(cleaner: Cleaner) {
    setEditingId(cleaner.id);
    setForm({
      name: cleaner.name,
      email: cleaner.email,
      password: "",
      phone: cleaner.phone ?? "",
      notes: cleaner.notes ?? "",
      language: cleaner.language,
    });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm({ name: "", email: "", password: "", phone: "", notes: "", language: "de" });
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingId ? `/api/users/${editingId}` : "/api/users";
      const method = editingId ? "PATCH" : "POST";
      const body = editingId
        ? { name: form.name, phone: form.phone, notes: form.notes, language: form.language, ...(form.password ? { password: form.password } : {}) }
        : form;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage("✓ Gespeichert");
        setShowForm(false);
        router.refresh();
      } else {
        const data = await res.json();
        setMessage(data.error ?? "Fehler beim Speichern");
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 font-semibold">
          {message}
        </div>
      )}

      {/* Neue Reinigungskraft anlegen */}
      {!showForm && (
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Neue Reinigungskraft
        </button>
      )}

      {/* Formular */}
      {showForm && (
        <div className="bg-white rounded-2xl border-2 border-blue-200 p-6">
          <h3 className="text-xl font-bold mb-5">
            {editingId ? "Reinigungskraft bearbeiten" : "Neue Reinigungskraft"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Name *">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="form-input"
                placeholder="Max Mustermann"
              />
            </FormField>
            <FormField label={editingId ? "E-Mail (nicht änderbar)" : "E-Mail *"}>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                type="email"
                disabled={!!editingId}
                className="form-input disabled:bg-gray-50"
                placeholder="max@beispiel.de"
              />
            </FormField>
            <FormField label={editingId ? "Neues Passwort (leer = unverändert)" : "Passwort *"}>
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                type="password"
                className="form-input"
                placeholder={editingId ? "Nur ausfüllen zum Ändern" : "Mindestens 8 Zeichen"}
              />
            </FormField>
            <FormField label="Telefon / WhatsApp">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="form-input"
                placeholder="+43 660 1234567"
              />
            </FormField>
            <FormField label="Sprache">
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="form-input"
              >
                <option value="de">Deutsch</option>
                <option value="en">Englisch</option>
              </select>
            </FormField>
            <FormField label="Bemerkungen">
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="form-input"
                placeholder="z.B. Firmenname, Zahlungsinfos"
              />
            </FormField>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-xl text-lg"
            >
              {saving ? "Wird gespeichert..." : "Speichern"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-6 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl text-lg hover:border-gray-400"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      {cleaners.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400 text-xl">
          Noch keine Reinigungskräfte angelegt.
        </div>
      ) : (
        <div className="space-y-3">
          {cleaners.map((cleaner) => (
            <div
              key={cleaner.id}
              className={`bg-white rounded-2xl border border-gray-200 p-5 ${!cleaner.active ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-gray-900">{cleaner.name}</h3>
                    {!cleaner.active && (
                      <span className="text-sm bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        Inaktiv
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-4 h-4" />
                      {cleaner.email}
                    </span>
                    {cleaner.phone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-4 h-4" />
                        {cleaner.phone}
                      </span>
                    )}
                  </div>
                  {cleaner.notes && (
                    <p className="text-gray-400 text-sm mt-1">{cleaner.notes}</p>
                  )}
                  <p className="text-gray-400 text-sm mt-1">
                    {cleaner._count.assignments} Aufträge insgesamt
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(cleaner)}
                    className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                    title="Bearbeiten"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => toggleActive(cleaner.id, cleaner.active)}
                    className="p-2.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-colors"
                    title={cleaner.active ? "Deaktivieren" : "Aktivieren"}
                  >
                    <Power className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(cleaner.id, cleaner.name)}
                    className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                    title="Löschen"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-base font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
