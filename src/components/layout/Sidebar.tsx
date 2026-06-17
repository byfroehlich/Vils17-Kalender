"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, BookOpen, Users, LogOut, Settings, TrendingUp, List, Banknote } from "lucide-react";
import { signOut } from "next-auth/react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  noClean?: boolean;
  cleanerOnly?: boolean;
  adminOnly?: boolean;
  adminMobileHide?: boolean;
  mobileOrder: number;
  exact?: boolean;
};

const adminManagerItems: NavItem[] = [
  { href: "/dashboard",  label: "Übersicht",    icon: LayoutDashboard, noClean: true, mobileOrder: 1 },
  { href: "/bookings",   label: "Buchungen",     icon: BookOpen,        noClean: true, mobileOrder: 2 },
  { href: "/cleaners",   label: "Reinigung",     icon: Users,           noClean: true, mobileOrder: 3 },
  { href: "/calendar",   label: "Kalender",      icon: Calendar,        noClean: true, mobileOrder: 4 },
  { href: "/statistics", label: "Statistiken",   icon: TrendingUp,      noClean: true, mobileOrder: 5 },
  { href: "/billing",    label: "Abrechnung",    icon: Banknote,        noClean: true, mobileOrder: 5 },
  { href: "/settings",   label: "Einstellungen", icon: Settings,        adminOnly: true, mobileOrder: 5, adminMobileHide: true },
];

const cleanerItems: NavItem[] = [
  { href: "/my-jobs",          label: "Dashboard",  icon: LayoutDashboard, cleanerOnly: true, mobileOrder: 1, exact: true },
  { href: "/my-jobs/list",     label: "Liste",       icon: List,            cleanerOnly: true, mobileOrder: 2 },
  { href: "/my-jobs/calendar", label: "Kalender",    icon: Calendar,        cleanerOnly: true, mobileOrder: 3 },
  { href: "/billing",          label: "Abrechnung",  icon: Banknote,        cleanerOnly: true, mobileOrder: 4 },
];

const navItems = [...adminManagerItems, ...cleanerItems];

const sidebarGlass = {
  background: "rgba(10,50,45,0.75)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  borderRight: "1px solid rgba(255,255,255,0.14)",
} as React.CSSProperties;

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const isAdmin   = role === "ADMIN";
  const isCleaner = role === "CLEANER";

  const visibleItems = navItems.filter((item) => {
    if (item.adminOnly   && !isAdmin)   return false;
    if (item.cleanerOnly && !isCleaner) return false;
    if (item.noClean     && isCleaner)  return false;
    return true;
  });

  const mobileItems = visibleItems
    .filter((item) => {
      if (item.adminMobileHide && isAdmin) return false;
      return true;
    })
    .sort((a, b) => a.mobileOrder - b.mobileOrder);

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-60 z-30" style={sidebarGlass}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16" style={{ borderBottom: "1px solid rgba(255,255,255,0.14)" }}>
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
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: active ? "rgba(13,148,136,0.2)" : "transparent",
                  color: active ? "#14B8A6" : "rgba(255,255,255,0.70)",
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
        <div className="px-2 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.14)" }}>
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
          background: "rgba(10,50,45,0.88)",
          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",
          borderTop: "1px solid rgba(255,255,255,0.16)",
          paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
        }}
      >
        {mobileItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-0 transition-colors"
              style={{ color: active ? "#0D9488" : "rgba(255,255,255,0.60)" }}
            >
              <item.icon className="w-[22px] h-[22px] flex-shrink-0" />
              <span className="text-[10px] font-medium leading-tight truncate w-full text-center px-0.5">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
