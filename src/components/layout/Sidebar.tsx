"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, BookOpen, Users, Briefcase, LogOut, Settings, TrendingUp } from "lucide-react";
import { signOut } from "next-auth/react";

// adminMobileHide: sichtbar im Desktop-Menü für ADMIN, aber nicht im Mobile-Nav
const navItems = [
  { href: "/dashboard",   label: "Übersicht",     icon: LayoutDashboard, noClean: true,  mobileOrder: 1 },
  { href: "/bookings",    label: "Buchungen",      icon: BookOpen,        noClean: true,  mobileOrder: 2 },
  { href: "/cleaners",    label: "Reinigung",      icon: Users,           noClean: true,  mobileOrder: 3 },
  { href: "/calendar",    label: "Kalender",       icon: Calendar,        noClean: true,  mobileOrder: 4 },
  { href: "/my-jobs",     label: "Aufträge",       icon: Briefcase,       cleanerOnly: true, mobileOrder: 1 },
  { href: "/statistics",  label: "Statistiken",    icon: TrendingUp,      noClean: true,  mobileOrder: 5, adminMobileHide: true },
  { href: "/settings",    label: "Einstellungen",  icon: Settings,        adminOnly: true, mobileOrder: 5 },
];

const sidebarGlass = {
  background: "rgba(2,15,14,0.75)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  borderRight: "1px solid rgba(255,255,255,0.08)",
} as React.CSSProperties;

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const isAdmin   = role === "ADMIN";
  const isCleaner = role === "CLEANER";

  const visibleItems = navItems.filter((item) => {
    if ((item as any).adminOnly   && !isAdmin)   return false;
    if ((item as any).cleanerOnly && !isCleaner) return false;
    if ((item as any).noClean     && isCleaner)  return false;
    return true;
  });

  const mobileItems = visibleItems
    .filter((item) => {
      if (item.mobileOrder === null) return false;
      if ((item as any).adminMobileHide && isAdmin) return false;
      return true;
    })
    .sort((a, b) => (a.mobileOrder ?? 99) - (b.mobileOrder ?? 99));

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-60 z-30" style={sidebarGlass}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #0D9488, #0F766E)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18L9 6l4 8 3-5 5 9H3z"/>
            </svg>
          </div>
          <div>
            <p style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: 14, letterSpacing: "-0.01em" }}>Vils17</p>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Ferienwohnungen</p>
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
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: active ? "rgba(13,148,136,0.2)" : "transparent",
                  color: active ? "#14B8A6" : "rgba(255,255,255,0.5)",
                  border: active ? "1px solid rgba(13,148,136,0.3)" : "1px solid transparent",
                }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-2 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.3)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
          >
            <LogOut className="w-4 h-4" />
            <span>Abmelden</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ─────────────────────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex"
        style={{
          background: "rgba(2,15,14,0.85)",
          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
        }}
      >
        {mobileItems.map((item) => {
          const active = pathname.startsWith(item.href);
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
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-0 transition-colors"
              style={{ color: active ? "#0D9488" : "rgba(255,255,255,0.35)" }}
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
