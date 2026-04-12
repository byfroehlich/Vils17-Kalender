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
  upcomingCheckouts: number;
  upcomingCheckins: number;
  openCleanings: number;
  openLaundry: number;
}

export function StatsCards({ upcomingCheckouts, upcomingCheckins, openCleanings, openLaundry }: Props) {
  const cards = [
    { label: "Ankünfte diese Woche",  value: upcomingCheckins,  dot: "#14B8A6" },
    { label: "Abreisen diese Woche",  value: upcomingCheckouts, dot: "#F59E0B" },
    { label: "Offene Reinigungen",    value: openCleanings,     dot: openCleanings > 0 ? "#EF4444" : "#0D9488" },
    { label: "Wäsche offen",          value: openLaundry,       dot: openLaundry  > 0 ? "#EF4444" : "#0F766E" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <div key={card.label} style={glass}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: card.dot, marginBottom: 10 }} />
          <p style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1, marginBottom: 6 }}>
            {card.value}
          </p>
          <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.5px", textTransform: "uppercase", lineHeight: 1.3 }}>
            {card.label}
          </p>
        </div>
      ))}
    </div>
  );
}
