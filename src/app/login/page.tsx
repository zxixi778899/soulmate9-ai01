"use client";
import { useState } from "react";
import { createBrowserClient, SOULMATE_BUILD_ID } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(ev: React.FormEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!SOULMATE_BUILD_ID) return;
    setError(null);
    setLoading(true);

    try {
      const supabase = createBrowserClient();
      if (!supabase) {
        setError(t('common.error'));
        setLoading(false);
        return;
      }
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/explore";
    } catch {
      setError(t('common.error'));
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 bg-[#07070F]">
      <div className="fixed top-4 right-4 z-50 glass rounded-full px-1.5 py-1">
        <LanguageSwitcher variant="compact" />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold gradient-text mb-1">{t('hero.signIn')}</h1>
          <p className="text-sm text-white/40">{t('auth.loginSubtitle')}</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
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
              placeholder="••••••••"
              required
              className="w-full p-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#FF2D78]/40 focus:border-[#FF2D78]/40 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full p-3 rounded-lg bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white font-heading font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}...</> : t('auth.login')}
          </button>
        </form>

        <div className="flex flex-col items-center gap-3 text-sm">
          <Link href="/forgot-password" className="text-[#FF6BA6] hover:text-[#FF2D78] transition-colors">
            {t('auth.forgotPassword')}
          </Link>
          <p className="text-white/30">
            {t('auth.noAccount')}{" "}
            <Link href="/register" className="text-[#FF6BA6] hover:text-[#FF2D78] transition-colors">
              {t('auth.signUp')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
