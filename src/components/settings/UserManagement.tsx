"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, KeyRound, ChevronDown, Star } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  language: string;
  active: boolean;
  role: string;
  isPrimary: boolean;
  _count: { assignments: number };
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Verwaltung",
  CLEANER: "Reinigung",
};

const ROLE_BADGE: Record<string, React.CSSProperties> = {
  ADMIN:   { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)" },
  MANAGER: { background: "rgba(6,182,212,0.2)",    color: "#67e8f9" },
  CLEANER: { background: "rgba(16,185,129,0.2)",   color: "#6ee7b7" },
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
  const [primaryLoading, setPrimaryLoading] = useState<string | null>(null);
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

  async function togglePrimary(user: User) {
    if (primaryLoading) return;
    const newVal = !user.isPrimary;
    if (newVal && !confirm(`"${user.name}" als Hauptreiniger festlegen? Alle offenen zukünftigen Reinigungsaufträge werden automatisch zugewiesen.`)) return;
    if (!newVal && !confirm(`Hauptreiniger-Status von "${user.name}" entfernen?`)) return;

    setPrimaryLoading(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: newVal }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg(newVal ? `${user.name} ist jetzt Hauptreiniger` : "Hauptreiniger-Status entfernt");
        router.refresh();
      } else {
        showMsg(data.error ?? "Fehler", true);
      }
    } finally {
      setPrimaryLoading(null);
    }
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
      if (res.ok) {
        showMsg("Passwort geändert");
        setShowPwForm(false);
        setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        showMsg(data.error ?? "Fehler", true);
      }
    } finally {
      setSaving(false);
    }
  }

  const glassForm: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 20,
  };

  const iconBtn: React.CSSProperties = {
    padding: 6,
    borderRadius: 8,
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    cursor: "pointer",
  };

  return (
    <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 20 }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 15 }}>Benutzer</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Login-Zugänge verwalten</p>
        </div>
        {!showForm && !showPwForm && (
          <button onClick={startNew} className="btn-primary py-2 px-3 text-sm">
            <Plus className="w-3.5 h-3.5" />
            Neuer Benutzer
          </button>
        )}
      </div>

      <div style={{ padding: "16px 24px" }} className="space-y-4">
        {message && (
          <div style={{
            padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            background: message.error ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
            border: `1px solid ${message.error ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`,
            color: message.error ? "#fca5a5" : "#6ee7b7",
          }}>
            {message.text}
          </div>
        )}

        {/* Formular */}
        {showForm && (
          <div style={glassForm}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>
              {editingId ? "Benutzer bearbeiten" : "Neuer Benutzer"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Name *">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="form-input" placeholder="Max Mustermann" />
              </FormField>
              <FormField label={editingId ? "E-Mail (nicht änderbar)" : "E-Mail *"}>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" disabled={!!editingId} className="form-input" placeholder="max@beispiel.de" style={editingId ? { opacity: 0.5 } : {}} />
              </FormField>
              <FormField label={editingId ? "Neues Passwort (leer = unverändert)" : "Passwort *"}>
                <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} type="password" className="form-input" placeholder={editingId ? "Nur ausfüllen zum Ändern" : "Mindestens 8 Zeichen"} />
              </FormField>
              <FormField label="Rolle">
                <div style={{ position: "relative" }}>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="form-input" style={{ appearance: "none", paddingRight: 32 }}>
                    <option value="ADMIN">Admin — voller Zugriff</option>
                    <option value="MANAGER">Verwaltung — kein Settings</option>
                    <option value="CLEANER">Reinigung — nur Aufträge</option>
                  </select>
                  <ChevronDown style={{ width: 14, height: 14, position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
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
              <button onClick={handleSave} disabled={saving} className="btn-primary py-2 px-4 text-sm flex-1">
                {saving ? "Wird gespeichert..." : "Speichern"}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary py-2 px-4 text-sm">
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* Passwort ändern */}
        {showPwForm && (
          <div style={glassForm}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>Eigenes Passwort ändern</p>
            <div className="space-y-3" style={{ maxWidth: 360 }}>
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
              <button onClick={handlePwChange} disabled={saving} className="btn-primary py-2 px-4 text-sm">
                {saving ? "Wird gespeichert..." : "Passwort ändern"}
              </button>
              <button onClick={() => setShowPwForm(false)} className="btn-secondary py-2 px-4 text-sm">
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* Benutzerliste */}
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              style={{
                background: user.isPrimary ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.05)",
                border: user.isPrimary ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(255,255,255,0.09)",
                borderRadius: 12,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                opacity: user.active ? 1 : 0.45,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>{user.name}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                    ...(ROLE_BADGE[user.role] ?? { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }),
                  }}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                  {user.isPrimary && (
                    <span style={{
                      display: "flex", alignItems: "center", gap: 3,
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                      background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.35)", color: "#fcd34d",
                    }}>
                      <Star style={{ width: 10, height: 10 }} fill="currentColor" />
                      Hauptreiniger
                    </span>
                  )}
                  {!user.active && (
                    <span style={{ fontSize: 11, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)", padding: "2px 8px", borderRadius: 20 }}>Inaktiv</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                  {user.email}{user.phone ? ` · ${user.phone}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                {/* Hauptreiniger-Toggle (nur für CLEANER) */}
                {user.role === "CLEANER" && (
                  <button
                    onClick={() => togglePrimary(user)}
                    disabled={primaryLoading === user.id}
                    style={{
                      ...iconBtn,
                      color: user.isPrimary ? "#fcd34d" : "rgba(255,255,255,0.3)",
                    }}
                    title={user.isPrimary ? "Hauptreiniger entfernen" : "Als Hauptreiniger festlegen"}
                  >
                    <Star style={{ width: 15, height: 15 }} fill={user.isPrimary ? "currentColor" : "none"} />
                  </button>
                )}
                {user.id === currentUserId && (
                  <button
                    onClick={() => { setShowPwForm(true); setShowForm(false); }}
                    style={iconBtn}
                    title="Passwort ändern"
                  >
                    <KeyRound style={{ width: 15, height: 15 }} />
                  </button>
                )}
                <button onClick={() => startEdit(user)} style={iconBtn} title="Bearbeiten">
                  <Pencil style={{ width: 15, height: 15 }} />
                </button>
                {user.id !== currentUserId && (
                  <button onClick={() => handleDelete(user.id, user.name)} style={iconBtn} title="Löschen">
                    <Trash2 style={{ width: 15, height: 15 }} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
