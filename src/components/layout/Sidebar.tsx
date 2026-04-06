"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Calendar, BookOpen, Users, Briefcase, LogOut, Settings, TrendingUp } from "lucide-react";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/dashboard",   label: "Übersicht",     icon: LayoutDashboard, adminOnly: true,  mobileOrder: 1 },
  { href: "/calendar",    label: "Kalender",       icon: Calendar,        adminOnly: true,  mobileOrder: 2 },
  { href: "/bookings",    label: "Buchungen",      icon: BookOpen,        adminOnly: true,  mobileOrder: 3 },
  { href: "/cleaners",    label: "Reinigung",      icon: Users,           adminOnly: true,  mobileOrder: null }, // nur Desktop
  { href: "/my-jobs",     label: "Meine Aufträge", icon: Briefcase,                         mobileOrder: 1 },
  { href: "/statistics",  label: "Statistiken",    icon: TrendingUp,      adminOnly: true,  mobileOrder: 4 },
  { href: "/settings",    label: "Einstellungen",  icon: Settings,        adminOnly: true,  mobileOrder: 5 },
];

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const isAdmin = role === "ADMIN";
  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const mobileItems = visibleItems
    .filter((item) => item.mobileOrder !== null)
    .sort((a, b) => (a.mobileOrder ?? 99) - (b.mobileOrder ?? 99));

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-60 bg-white border-r border-zinc-100 z-30">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-zinc-100">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18L9 6l4 8 3-5 5 9H3z"/>
            </svg>
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm tracking-tight">Vils17</p>
            <p className="text-zinc-400 text-xs">Ferienwohnungen</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {visibleItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  active ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-2 py-4 border-t border-zinc-100">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Abmelden</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav (max 5 Items) ─────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-100 z-30 flex safe-bottom">
        {mobileItems.map((item) => {
          const active = pathname.startsWith(item.href);
          // Kurzlabel für enge Plätze
          const shortLabel: Record<string, string> = {
            "Übersicht": "Übersicht",
            "Kalender": "Kalender",
            "Buchungen": "Buchungen",
            "Statistiken": "Statistiken",
            "Einstellungen": "Einstell.",
            "Meine Aufträge": "Aufträge",
          };
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-0 transition-colors",
                active ? "text-zinc-900" : "text-zinc-400"
              )}
            >
              <item.icon className="w-[22px] h-[22px] flex-shrink-0" />
              <span className="text-[10px] font-medium leading-tight truncate w-full text-center px-0.5">
                {shortLabel[item.label] ?? item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
