"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  const t = useTranslations("login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t("error"));
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Titel */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <span className="text-white text-3xl">🏔️</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{t("subtitle")}</h1>
        </div>

        {/* Login-Formular */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">{t("title")}</h2>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-lg font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-lg font-medium text-gray-700 mb-2"
              >
                {t("email")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="name@beispiel.de"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-lg font-medium text-gray-700 mb-2"
              >
                {t("password")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xl font-semibold rounded-xl transition-colors mt-2"
            >
              {loading ? t("loading") : t("submit")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
