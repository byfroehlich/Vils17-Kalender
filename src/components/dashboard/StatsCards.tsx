import { LogOut, LogIn, Brush, WashingMachine } from "lucide-react";

interface Props {
  upcomingCheckouts: number;
  upcomingCheckins: number;
  openCleanings: number;
  openLaundry: number;
}

export function StatsCards({
  upcomingCheckouts,
  upcomingCheckins,
  openCleanings,
  openLaundry,
}: Props) {
  const cards = [
    {
      label: "Abreisen diese Woche",
      value: upcomingCheckouts,
      icon: LogOut,
      color: "bg-blue-50 text-blue-700",
      iconColor: "text-blue-500",
    },
    {
      label: "Ankünfte diese Woche",
      value: upcomingCheckins,
      icon: LogIn,
      color: "bg-green-50 text-green-700",
      iconColor: "text-green-500",
    },
    {
      label: "Offene Reinigungen",
      value: openCleanings,
      icon: Brush,
      color: openCleanings > 0 ? "bg-orange-50 text-orange-700" : "bg-gray-50 text-gray-600",
      iconColor: openCleanings > 0 ? "text-orange-500" : "text-gray-400",
    },
    {
      label: "Wäsche nicht bestellt",
      value: openLaundry,
      icon: WashingMachine,
      color: openLaundry > 0 ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600",
      iconColor: openLaundry > 0 ? "text-red-500" : "text-gray-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-2xl p-5 ${card.color} border border-current border-opacity-20`}
        >
          <div className="flex items-start justify-between mb-3">
            <card.icon className={`w-8 h-8 ${card.iconColor}`} />
          </div>
          <p className="text-4xl font-bold mb-1">{card.value}</p>
          <p className="text-sm font-medium opacity-80">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
