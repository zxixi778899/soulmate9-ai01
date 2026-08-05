'use client';

/**
 * Telegram Login Widget button.
 *
 * Renders nothing unless NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is configured.
 * On successful Telegram auth the widget calls window.onTelegramAuth(user);
 * we verify the signature server-side (/api/auth/telegram) and exchange the
 * returned magic-link token_hash for a Supabase session.
 */

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createBrowserClient } from '@/lib/supabase';

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramUser) => void;
  }
}

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || '';

export function TelegramAuthButton() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleAuth = useCallback(async (user: TelegramUser) => {
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      const data = (await res.json().catch(() => ({}))) as { token_hash?: string; error?: string };
      if (!res.ok || !data.token_hash) {
        toast.error(data.error || 'Telegram sign-in failed');
        return;
      }
      const supabase = createBrowserClient();
      if (!supabase) {
        toast.error('Auth client unavailable');
        return;
      }
      const { error } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'magiclink',
      });
      if (error) {
        toast.error(error.message || 'Telegram sign-in failed');
        return;
      }
      window.location.href = '/';
    } catch {
      toast.error('Telegram sign-in failed');
    }
  }, []);

  useEffect(() => {
    if (!BOT_USERNAME) return;
    window.onTelegramAuth = (user: TelegramUser) => {
      void handleAuth(user);
    };
    const el = containerRef.current;
    if (!el || el.querySelector('script')) return;
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-onauth', 'onTelegramAuth');
    script.setAttribute('data-request-access', 'write');
    el.appendChild(script);
  }, [handleAuth]);

  if (!BOT_USERNAME) return null;

  return <div ref={containerRef} className="flex justify-center min-h-[46px]" />;
}
