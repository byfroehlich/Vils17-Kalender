"use client";

export function Topbar({ userName, role }: { userName: string; role: string }) {
  return (
    <header
      className="flex items-end justify-between lg:hidden"
      style={{
        background: "rgba(10,50,45,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.16)",
        position: "sticky",
        top: 0,
        zIndex: 20,
        // Höhe: Safe-Area-Inset oben + 52px Content
        paddingTop: "max(env(safe-area-inset-top), 14px)",
        paddingBottom: 12,
        paddingLeft: 20,
        paddingRight: 20,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #0D9488, #0F766E)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18L9 6l4 8 3-5 5 9H3z"/>
          </svg>
        </div>
        <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 15 }}>Vils17</span>
      </div>

      {/* Name + Rolle */}
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{userName}</span>
        {role === "ADMIN" && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.15)" }}>
            Admin
          </span>
        )}
        {role === "MANAGER" && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "rgba(14,116,144,0.3)", color: "#67e8f9", border: "1px solid rgba(14,116,144,0.4)" }}>
            Verwaltung
          </span>
        )}
        {role === "CLEANER" && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "rgba(16,185,129,0.2)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.3)" }}>
            Reinigung
          </span>
        )}
      </div>
    </header>
  );
}
