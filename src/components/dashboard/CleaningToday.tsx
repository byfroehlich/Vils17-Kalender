import Link from "next/link";

interface CleaningItem {
  id: string;
  status: string;
  isSelfClean: boolean;
  cleaner?: { name: string } | null;
  booking: {
    guestName: string;
    departureTime?: string | null;
    apartment: { name: string; color?: string | null };
  };
}

export function CleaningToday({ assignments }: { assignments: CleaningItem[] }) {
  const open = assignments.filter(
    (a) => a.status === "UNASSIGNED" && !a.isSelfClean
  ).length;

  return (
    <div>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(255,255,255,0.35)" }}>
          Reinigung
        </p>
        <Link href="/cleaners" style={{ fontSize: 12, fontWeight: 600, color: "#14B8A6", textDecoration: "none" }}>
          Planen →
        </Link>
      </div>

      <div style={{
        background: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 20,
        overflow: "hidden",
      }}>
        {/* Card header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: assignments.length > 0 ? "1px solid rgba(255,255,255,0.07)" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
            Heute & morgen fällig
          </span>
          {open > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: "rgba(249,115,22,0.2)", color: "#fb923c",
              padding: "2px 10px", borderRadius: 20,
            }}>
              {open} offen
            </span>
          )}
          {open === 0 && assignments.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: "rgba(16,185,129,0.2)", color: "#6ee7b7",
              padding: "2px 10px", borderRadius: 20,
            }}>
              Alle zugewiesen
            </span>
          )}
        </div>

        {assignments.length === 0 ? (
          <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
            Keine Reinigungen fällig
          </div>
        ) : (
          <div>
            {assignments.map((a, i) => {
              const isDone = a.status === "COMPLETED";
              const isAssigned = a.status === "ASSIGNED" || a.isSelfClean;
              const aptColor = a.booking.apartment.color ?? "#14B8A6";
              return (
                <div
                  key={a.id}
                  style={{
                    padding: "11px 16px",
                    borderBottom: i < assignments.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {/* Status circle */}
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isDone ? "rgba(16,185,129,0.3)" : isAssigned ? "rgba(13,148,136,0.25)" : "rgba(255,255,255,0.08)",
                    border: isDone || isAssigned ? "none" : "1.5px solid rgba(255,255,255,0.2)",
                  }}>
                    {(isDone || isAssigned) && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke={isDone ? "#6ee7b7" : "#5EEAD4"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>

                  {/* Apartment color dot */}
                  <div style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: aptColor, flexShrink: 0 }} />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
                      {a.booking.apartment.name}
                    </p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      Nach {a.booking.guestName.split(" ")[0]}
                      {a.booking.departureTime && ` · bis ${a.booking.departureTime} Uhr`}
                    </p>
                  </div>

                  {/* Cleaner / action */}
                  {a.isSelfClean ? (
                    <span style={{ fontSize: 12, color: "#5EEAD4", fontWeight: 500, flexShrink: 0 }}>Selbst</span>
                  ) : a.cleaner ? (
                    <span style={{ fontSize: 12, color: "#5EEAD4", fontWeight: 600, flexShrink: 0 }}>
                      {a.cleaner.name.split(" ")[0]}
                    </span>
                  ) : (
                    <Link href="/cleaners" style={{ fontSize: 12, color: "#fb923c", fontWeight: 600, textDecoration: "none", flexShrink: 0 }}>
                      Zuweisen
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
