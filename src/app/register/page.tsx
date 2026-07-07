"use client";
import { useState } from "react";
import { createBrowserClient, SOULMATE_BUILD_ID } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n/context";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function RegisterPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister(ev: React.FormEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!SOULMATE_BUILD_ID) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('auth.registerFailed'));
        setLoading(false);
        return;
      }

      if (data.access_token) {
        const supabase = createBrowserClient();
        if (supabase) {
          await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
        }
      }
      window.location.href = "/gallery";
    } catch {
      setError(t('common.error'));
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 bg-[#07070F]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold gradient-text mb-1">{t('auth.register')}</h1>
          <p className="text-sm text-white/40">{t('auth.registerSubtitle')}</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-heading">{t('auth.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(ev) => setUsername(ev.target.value)}
              placeholder={t('auth.username')}
              required
              className="w-full p-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#FF2D78]/40 focus:border-[#FF2D78]/40 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-heading">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="you@example.com"
              required
              className="w-full p-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#FF2D78]/40 focus:border-[#FF2D78]/40 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-heading">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              placeholder={t('auth.passwordTooShort')}
              minLength={6}
              required
              className="w-full p-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#FF2D78]/40 focus:border-[#FF2D78]/40 transition-all"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agree}
              onChange={(ev) => setAgree(ev.target.checked)}
              className="rounded border-white/20 bg-white/[0.06] accent-[#FF2D78]"
            />
            <span className="text-xs text-white/40">
              {t('auth.agreeToTerms')} <Link href="/terms" className="text-[#FF6BA6]">{t('auth.agreeTerms')}</Link>
            </span>
          </label>
          <button
            type="submit"
            disabled={!agree || loading}
            className="w-full p-3 rounded-lg bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white font-heading font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}...</> : t('auth.register')}
          </button>
        </form>

        <p className="text-center text-sm text-white/30">
          {t('auth.hasAccount')}{" "}
          <Link href="/login" className="text-[#FF6BA6] hover:text-[#FF2D78] transition-colors">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </main>
  );
}
