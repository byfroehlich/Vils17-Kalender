"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  Users,
  Briefcase,
  LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Übersicht", icon: LayoutDashboard, adminOnly: true },
  { href: "/calendar", label: "Kalender", icon: Calendar, adminOnly: true },
  { href: "/bookings", label: "Buchungen", icon: BookOpen, adminOnly: true },
  { href: "/cleaners", label: "Reinigungskräfte", icon: Users, adminOnly: true },
  { href: "/my-jobs", label: "Meine Aufträge", icon: Briefcase },
];

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const isAdmin = role === "ADMIN";

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 z-30">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-gray-200">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xl">
            🏔️
          </div>
          <div>
            <p className="font-bold text-gray-900 text-lg leading-tight">Vils17</p>
            <p className="text-gray-500 text-sm">Ferienwohnungen</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-lg font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                {active && (
                  <div className="absolute left-0 w-1 h-8 bg-blue-600 rounded-r-full" />
                )}
                <item.icon className="w-6 h-6 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Abmelden */}
        <div className="px-3 py-4 border-t border-gray-200">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-lg font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-6 h-6" />
            <span>Abmelden</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 flex">
        {visibleItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 text-sm font-medium transition-colors",
                active ? "text-blue-600" : "text-gray-500"
              )}
            >
              <item.icon className="w-6 h-6" />
              <span className="text-xs">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex-1 flex flex-col items-center gap-1 py-3 text-sm font-medium text-gray-500"
        >
          <LogOut className="w-6 h-6" />
          <span className="text-xs">Abmelden</span>
        </button>
      </nav>
    </>
  );
}
