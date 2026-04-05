import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isToday, isTomorrow, addDays, isWithinInterval } from "date-fns";
import { de, enGB } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date, locale = "de"): string {
  return format(date, "dd.MM.yyyy", {
    locale: locale === "de" ? de : enGB,
  });
}

export function formatDateLong(date: Date, locale = "de"): string {
  return format(date, "EEEE, dd. MMMM yyyy", {
    locale: locale === "de" ? de : enGB,
  });
}

export function formatDateShort(date: Date): string {
  return format(date, "dd.MM.");
}

export function getRelativeDay(date: Date, locale = "de"): string {
  if (isToday(date)) return locale === "de" ? "Heute" : "Today";
  if (isTomorrow(date)) return locale === "de" ? "Morgen" : "Tomorrow";
  return formatDateLong(date, locale);
}

export function isBookingUpcoming(checkOut: Date, days = 7): boolean {
  return isWithinInterval(checkOut, {
    start: new Date(),
    end: addDays(new Date(), days),
  });
}

export function getCleaningStatusColor(status: string): string {
  switch (status) {
    case "UNASSIGNED":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "SELF_CLEAN":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "ASSIGNED":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "COMPLETED":
      return "bg-green-100 text-green-800 border-green-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

export function getLaundryStatusColor(status: string): string {
  switch (status) {
    case "OPEN":
      return "bg-red-100 text-red-800 border-red-200";
    case "ORDERED":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "AVAILABLE":
      return "bg-green-100 text-green-800 border-green-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}
