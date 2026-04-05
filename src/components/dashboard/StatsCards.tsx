interface Props {
  upcomingCheckouts: number;
  upcomingCheckins: number;
  openCleanings: number;
  openLaundry: number;
}

export function StatsCards({ upcomingCheckouts, upcomingCheckins, openCleanings, openLaundry }: Props) {
  const cards = [
    {
      label: "Abreisen diese Woche",
      value: upcomingCheckouts,
      urgent: false,
    },
    {
      label: "Ankünfte diese Woche",
      value: upcomingCheckins,
      urgent: false,
    },
    {
      label: "Offene Reinigungen",
      value: openCleanings,
      urgent: openCleanings > 0,
    },
    {
      label: "Wäsche offen",
      value: openLaundry,
      urgent: openLaundry > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`bg-white rounded-2xl border p-5 ${
            card.urgent
              ? "border-red-100 bg-red-50"
              : "border-zinc-100"
          }`}
        >
          <p className={`text-4xl font-bold tracking-tight mb-1 ${card.urgent ? "text-red-600" : "text-zinc-900"}`}>
            {card.value}
          </p>
          <p className={`text-sm ${card.urgent ? "text-red-500" : "text-zinc-400"}`}>
            {card.label}
          </p>
        </div>
      ))}
    </div>
  );
}
