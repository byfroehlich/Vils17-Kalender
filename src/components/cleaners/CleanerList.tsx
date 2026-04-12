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

  const iconBtn: React.CSSProperties = {
    padding: 7,
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
          <h2 style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 15 }}>Reinigungskräfte</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Logins und Kontaktdaten verwalten</p>
        </div>
        {!showForm && (
          <button onClick={startNew} className="btn-primary py-2 px-3 text-sm">
            <Plus className="w-3.5 h-3.5" />
            Neue Reinigungskraft
          </button>
        )}
      </div>

      <div style={{ padding: "16px 24px" }} className="space-y-4">
        {message && (
          <div style={{
            padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#6ee7b7",
          }}>
            {message}
          </div>
        )}

        {/* Formular */}
        {showForm && (
          <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>
              {editingId ? "Reinigungskraft bearbeiten" : "Neue Reinigungskraft"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Name *">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="form-input" placeholder="Max Mustermann" />
              </FormField>
              <FormField label={editingId ? "E-Mail (nicht änderbar)" : "E-Mail *"}>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" disabled={!!editingId} className="form-input" style={editingId ? { opacity: 0.5 } : {}} placeholder="max@beispiel.de" />
              </FormField>
              <FormField label={editingId ? "Neues Passwort (leer = unverändert)" : "Passwort *"}>
                <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" className="form-input" placeholder={editingId ? "Nur ausfüllen zum Ändern" : "Mindestens 8 Zeichen"} />
              </FormField>
              <FormField label="Telefon / WhatsApp">
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="form-input" placeholder="+43 660 1234567" />
              </FormField>
              <FormField label="Sprache">
                <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className="form-input">
                  <option value="de">Deutsch</option>
                  <option value="en">Englisch</option>
                </select>
              </FormField>
              <FormField label="Bemerkungen">
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="form-input" placeholder="z.B. Firmenname, Zahlungsinfos" />
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

        {/* Liste */}
        {cleaners.length === 0 ? (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "32px 24px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
            Noch keine Reinigungskräfte angelegt.
          </div>
        ) : (
          <div className="space-y-2">
            {cleaners.map((cleaner) => (
              <div
                key={cleaner.id}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  opacity: cleaner.active ? 1 : 0.45,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{cleaner.name}</h3>
                      {!cleaner.active && (
                        <span style={{ fontSize: 11, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)", padding: "2px 8px", borderRadius: 20 }}>
                          Inaktiv
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "4px 16px" }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 5 }}>
                        <Mail style={{ width: 12, height: 12 }} />
                        {cleaner.email}
                      </span>
                      {cleaner.phone && (
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 5 }}>
                          <Phone style={{ width: 12, height: 12 }} />
                          {cleaner.phone}
                        </span>
                      )}
                    </div>
                    {cleaner.notes && (
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{cleaner.notes}</p>
                    )}
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
                      {cleaner._count.assignments} Aufträge insgesamt
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 2 }}>
                    <button onClick={() => startEdit(cleaner)} style={iconBtn} title="Bearbeiten">
                      <Pencil style={{ width: 15, height: 15 }} />
                    </button>
                    <button onClick={() => toggleActive(cleaner.id, cleaner.active)} style={iconBtn} title={cleaner.active ? "Deaktivieren" : "Aktivieren"}>
                      <Power style={{ width: 15, height: 15 }} />
                    </button>
                    <button onClick={() => handleDelete(cleaner.id, cleaner.name)} style={iconBtn} title="Löschen">
                      <Trash2 style={{ width: 15, height: 15 }} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
