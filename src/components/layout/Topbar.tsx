"use client";

export function Topbar({ userName, role }: { userName: string; role: string }) {
  return (
    <header className="bg-white border-b border-zinc-100 px-6 h-16 flex items-center justify-between">
      {/* Mobile: Logo */}
      <div className="lg:hidden flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18L9 6l4 8 3-5 5 9H3z"/>
          </svg>
        </div>
        <span className="font-semibold text-zinc-900 text-sm">Vils17</span>
      </div>

      <div className="hidden lg:block" />

      {/* User */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500">{userName}</span>
        {role === "ADMIN" && (
          <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-medium">
            Admin
          </span>
        )}
      </div>
    </header>
  );
}
