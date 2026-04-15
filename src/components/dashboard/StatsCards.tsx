const glass = {
  background: "rgba(255,255,255,0.12)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.22)",
  borderRadius: 20,
  boxShadow: "0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.18)",
  padding: "16px 18px",
} as React.CSSProperties;

interface Props {
  activeNow: number;
  checkoutsToday: number;
  checkinsToday: number;
}

export function StatsCards({ activeNow, checkoutsToday, checkinsToday }: Props) {
  const cards = [
    { label: "Aktiv",     value: activeNow,      dot: "#22c55e" },
    { label: "Abreisen",  value: checkoutsToday, dot: "#F59E0B" },
    { label: "Anreisen",  value: checkinsToday,  dot: "#3b82f6" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => (
        <div key={card.label} style={glass}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: card.dot, marginBottom: 10 }} />
          <p style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1, marginBottom: 6 }}>
            {card.value}
          </p>
          <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.72)", letterSpacing: "0.5px", textTransform: "uppercase", lineHeight: 1.3 }}>
            {card.label}
          </p>
        </div>
      ))}
    </div>
  );
}
