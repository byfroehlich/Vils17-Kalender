"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, KeyRound, ChevronDown } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  language: string;
  active: boolean;
  role: string;
  _count: { assignments: number };
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Verwaltung",
  CLEANER: "Reinigung",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-zinc-900 text-white",
  MANAGER: "bg-sky-100 text-sky-700",
  CLEANER: "bg-emerald-100 text-emerald-700",
};

export function UserManagement({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPwForm, setShowPwForm] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", password: "", phone: "", notes: "",
    language: "de", role: "CLEANER",
  });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  function showMsg(text: string, error = false) {
    setMessage({ text, error });
    setTimeout(() => setMessage(null), 3500);
  }

  function startNew() {
    setEditingId(null);
    setForm({ name: "", email: "", password: "", phone: "", notes: "", language: "de", role: "CLEANER" });
    setShowForm(true);
    setShowPwForm(false);
  }

  function startEdit(user: User) {
    setEditingId(user.id);
    setForm({
      name: user.name, email: user.email, password: "",
      phone: user.phone ?? "", notes: user.notes ?? "",
      language: user.language, role: user.role,
    });
    setShowForm(true);
    setShowPwForm(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingId ? `/api/users/${editingId}` : "/api/users";
      const method = editingId ? "PATCH" : "POST";
      const body = editingId
        ? { name: form.name, phone: form.phone, notes: form.notes, language: form.language, role: form.role, ...(form.password ? { password: form.password } : {}) }
        : form;

      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg("Gespeichert");
        setShowForm(false);
        router.refresh();
      } else {
        showMsg(data.error ?? "Fehler", true);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) { showMsg("Gelöscht"); router.refresh(); }
    else showMsg(data.error ?? "Fehler", true);
  }

  async function handlePwChange() {
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      showMsg("Passwörter stimmen nicht überein", true); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${currentUserId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      const data = await res.json();
      if (res.ok) { showMsg("Passwort geändert"); setShowPwForm(false); setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); }
      else showMsg(data.error ?? "Fehler", true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-xl text-sm font-medium ${message.error ? "bg-red-50 border border-red-200 text-red-700" : "bg-emerald-50 border border-emerald-200 text-emerald-800"}`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Benutzer</h2>
        {!showForm && !showPwForm && (
          <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Neuer Benutzer
          </button>
        )}
      </div>

      {/* Formular: Neuer/Bearbeiten User */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-4">
            {editingId ? "Benutzer bearbeiten" : "Neuer Benutzer"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Name *">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="form-input" placeholder="Max Mustermann" />
            </FormField>
            <FormField label={editingId ? "E-Mail (nicht änderbar)" : "E-Mail *"}>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" disabled={!!editingId} className="form-input disabled:bg-zinc-50" placeholder="max@beispiel.de" />
            </FormField>
            <FormField label={editingId ? "Neues Passwort (leer = unverändert)" : "Passwort *"}>
              <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} type="password" className="form-input" placeholder={editingId ? "Nur ausfüllen zum Ändern" : "Mindestens 8 Zeichen"} />
            </FormField>
            <FormField label="Rolle">
              <div className="relative">
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="form-input appearance-none pr-8">
                  <option value="ADMIN">Admin — voller Zugriff</option>
                  <option value="MANAGER">Verwaltung — kein Settings</option>
                  <option value="CLEANER">Reinigung — nur Aufträge</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </FormField>
            <FormField label="Telefon / WhatsApp">
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="form-input" placeholder="+43 660 1234567" />
            </FormField>
            <FormField label="Bemerkungen">
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="form-input" placeholder="z.B. Firmenname" />
            </FormField>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-700 disabled:bg-zinc-300 text-white font-medium rounded-xl text-sm">
              {saving ? "Wird gespeichert..." : "Speichern"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-zinc-200 text-zinc-600 font-medium rounded-xl text-sm hover:bg-zinc-50">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Passwort ändern */}
      {showPwForm && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-4">Eigenes Passwort ändern</h3>
          <div className="space-y-3 max-w-sm">
            <FormField label="Aktuelles Passwort">
              <input value={pwForm.currentPassword} onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} type="password" className="form-input" />
            </FormField>
            <FormField label="Neues Passwort">
              <input value={pwForm.newPassword} onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} type="password" className="form-input" placeholder="Mindestens 8 Zeichen" />
            </FormField>
            <FormField label="Passwort wiederholen">
              <input value={pwForm.confirmPassword} onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })} type="password" className="form-input" />
            </FormField>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handlePwChange} disabled={saving} className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-700 disabled:bg-zinc-300 text-white font-medium rounded-xl text-sm">
              {saving ? "Wird gespeichert..." : "Passwort ändern"}
            </button>
            <button onClick={() => setShowPwForm(false)} className="px-5 py-2.5 border border-zinc-200 text-zinc-600 font-medium rounded-xl text-sm hover:bg-zinc-50">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Benutzerliste */}
      <div className="space-y-2">
        {users.map((user) => (
          <div key={user.id} className={`bg-white rounded-xl border border-zinc-200 px-4 py-3 flex items-center gap-3 ${!user.active ? "opacity-50" : ""}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-zinc-900">{user.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] ?? "bg-zinc-100 text-zinc-600"}`}>
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
                {!user.active && <span className="text-xs bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded-full">Inaktiv</span>}
              </div>
              <p className="text-xs text-zinc-400 truncate mt-0.5">{user.email}{user.phone ? ` · ${user.phone}` : ""}</p>
            </div>
            <div className="flex items-center gap-1">
              {user.id === currentUserId && (
                <button onClick={() => { setShowPwForm(true); setShowForm(false); }} className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors" title="Passwort ändern">
                  <KeyRound className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => startEdit(user)} className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors" title="Bearbeiten">
                <Pencil className="w-4 h-4" />
              </button>
              {user.id !== currentUserId && (
                <button onClick={() => handleDelete(user.id, user.name)} className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Löschen">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
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
