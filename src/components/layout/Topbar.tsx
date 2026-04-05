"use client";

import { User } from "lucide-react";

export function Topbar({ userName, role }: { userName: string; role: string }) {
  return (
    <header className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4 flex items-center justify-between">
      <div className="lg:hidden flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
          🏔️
        </div>
        <span className="font-bold text-gray-900">Vils17</span>
      </div>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2">
          <User className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-700">{userName}</span>
          {role === "ADMIN" && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              Admin
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
