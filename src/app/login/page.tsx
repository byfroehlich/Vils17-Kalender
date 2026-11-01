"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("E-Mail oder Passwort falsch.");
      return;
    }

    // Zurück zur aufrufenden Seite (z.B. OAuth-Zustimmung) — nur Pfade
    // innerhalb der App, damit der Login keine offene Weiterleitung wird
    const target = new URLSearchParams(window.location.search).get("callbackUrl");
    const safe = target && target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\") ? target : "/";
    router.push(safe);
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, position: "relative" }}>
      {/* Petrol gradient background */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        background: [
          "radial-gradient(65% 40% at 12% 6%, rgba(13,148,136,0.55) 0%, transparent 70%)",
          "radial-gradient(55% 35% at 100% 22%, rgba(20,184,166,0.28) 0%, transparent 70%)",
          "radial-gradient(70% 40% at 50% 108%, rgba(15,118,110,0.40) 0%, transparent 70%)",
          "#04100F",
        ].join(", "),
      }} />

      <div style={{ width: "100%", maxWidth: 380, position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 52, height: 52, borderRadius: 16, marginBottom: 16,
            background: "linear-gradient(135deg, #0D9488 0%, #0891b2 100%)",
            boxShadow: "0 8px 24px rgba(13,148,136,0.35)",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18L9 6l4 8 3-5 5 9H3z"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.03em" }}>Vils17</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", marginTop: 4 }}>Ferienwohnungen</p>
        </div>

        {/* Glasskarte */}
        <div style={{
          background: "rgba(255,255,255,0.16)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.28)",
          borderRadius: 24,
          padding: 28,
          boxShadow: "0 24px 48px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.20)",
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 22 }}>Anmelden</h2>

          {error && (
            <div style={{
              marginBottom: 16, padding: "10px 14px",
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 12, color: "#fca5a5", fontSize: 13, fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" style={{ display: "block", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.72)", marginBottom: 6 }}>
                E-Mail
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="form-input"
                placeholder="name@beispiel.de"
              />
            </div>

            <div>
              <label htmlFor="password" style={{ display: "block", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.72)", marginBottom: 6 }}>
                Passwort
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="form-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 mt-2 text-base"
            >
              {loading ? "Wird angemeldet…" : "Anmelden"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
