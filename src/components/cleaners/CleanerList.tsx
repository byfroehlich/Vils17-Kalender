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
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-medium">
          {message}
        </div>
      )}

      {/* Neue Reinigungskraft */}
      {!showForm && (
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-700 text-white font-medium rounded-xl text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Neue Reinigungskraft
        </button>
      )}

      {/* Formular */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-5">
          <h3 className="text-base font-semibold text-zinc-900 mb-4">
            {editingId ? "Reinigungskraft bearbeiten" : "Neue Reinigungskraft"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                className="form-input disabled:bg-zinc-50"
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
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-700 disabled:bg-zinc-300 text-white font-medium rounded-xl text-sm transition-colors"
            >
              {saving ? "Wird gespeichert..." : "Speichern"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-5 py-2.5 border border-zinc-200 text-zinc-600 font-medium rounded-xl text-sm hover:bg-zinc-50 transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      {cleaners.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center text-zinc-400 text-sm">
          Noch keine Reinigungskräfte angelegt.
        </div>
      ) : (
        <div className="space-y-2.5">
          {cleaners.map((cleaner) => (
            <div
              key={cleaner.id}
              className={`bg-white rounded-2xl border border-zinc-200 p-4 ${!cleaner.active ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-zinc-900">{cleaner.name}</h3>
                    {!cleaner.active && (
                      <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">
                        Inaktiv
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" />
                      {cleaner.email}
                    </span>
                    {cleaner.phone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        {cleaner.phone}
                      </span>
                    )}
                  </div>
                  {cleaner.notes && (
                    <p className="text-xs text-zinc-400 mt-1">{cleaner.notes}</p>
                  )}
                  <p className="text-xs text-zinc-400 mt-1">
                    {cleaner._count.assignments} Aufträge insgesamt
                  </p>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => startEdit(cleaner)}
                    className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
                    title="Bearbeiten"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleActive(cleaner.id, cleaner.active)}
                    className="p-2 text-zinc-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                    title={cleaner.active ? "Deaktivieren" : "Aktivieren"}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cleaner.id, cleaner.name)}
                    className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Löschen"
                  >
                    <Trash2 className="w-4 h-4" />
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
      <label className="block text-xs font-medium text-zinc-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
