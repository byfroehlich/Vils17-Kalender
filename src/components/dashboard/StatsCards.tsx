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
      bg: "bg-blue-50",
      text: "text-blue-700",
      num: "text-blue-900",
    },
    {
      label: "Ankünfte diese Woche",
      value: upcomingCheckins,
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      num: "text-emerald-900",
    },
    {
      label: "Offene Reinigungen",
      value: openCleanings,
      bg: openCleanings > 0 ? "bg-orange-50" : "bg-zinc-50",
      text: openCleanings > 0 ? "text-orange-600" : "text-zinc-400",
      num: openCleanings > 0 ? "text-orange-700" : "text-zinc-500",
    },
    {
      label: "Wäsche offen",
      value: openLaundry,
      bg: openLaundry > 0 ? "bg-red-50" : "bg-zinc-50",
      text: openLaundry > 0 ? "text-red-600" : "text-zinc-400",
      num: openLaundry > 0 ? "text-red-700" : "text-zinc-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className={`${card.bg} rounded-2xl p-5`}>
          <p className={`text-5xl font-bold tracking-tight mb-2 ${card.num}`}>
            {card.value}
          </p>
          <p className={`text-sm font-medium ${card.text}`}>{card.label}</p>
        </div>
      ))}
    </div>
  );
}
