'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_NAME } from '@/lib/constants';
import { Loader2, Heart, Mail, Lock, User } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/context';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreeToS, setAgreeToS] = useState(false);
  const { supabase } = useAuth();
  const { t } = useTranslation();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('auth.registerFailed'));
        setLoading(false);
        return;
      }

      if (data.auto_signin_error) {
        setError(data.auto_signin_error);
        setLoading(false);
        return;
      }

      // Set session on the Supabase client so it persists properly
      if (!supabase) {
        setError('Service temporarily unavailable. Please refresh.');
        setLoading(false);
        return;
      }
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      window.location.href = '/gallery';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    if (!supabase) {
      setError('Service temporarily unavailable. Please refresh.');
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 pb-24 md:pb-4">
      {/* 50% semi-transparent overlay — lets homepage starry background show through */}
      <div className="fixed inset-0 bg-[#07070F]/[50] backdrop-blur-md pointer-events-none -z-10" />
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-[#FF2D78]/[6] blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-[#8b5cf6]/[5] blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center gap-2 mb-2">
            <Heart className="h-8 w-8 text-[#FF2D78]" fill="currentColor" />
            <span className="font-display text-3xl font-bold tracking-tight italic gradient-text">{APP_NAME}</span>
          </div>
          <p className="text-sm text-[#FF6BA6] italic font-display">Begin your love story</p>
        </div>

        <Card className="h5-reveal border-white/[0.08]">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">{t('auth.signUp')}</CardTitle>
            <CardDescription>Join {APP_NAME} and create your AI companion</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full h-11 gap-2"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/[0.08]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#0E0E1A] px-2 text-[#8B8BA3]">{t('auth.orContinueWith')}</span>
              </div>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-[#8B8BA3]">{t('auth.username')}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8BA3]" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Your display name"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#8B8BA3]">{t('auth.email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8BA3]" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#8B8BA3]">{t('auth.password')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8BA3]" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    minLength={6}
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex items-start gap-2">
                <Checkbox
                  id="agree-tos"
                  checked={agreeToS}
                  onCheckedChange={(c) => setAgreeToS(c === true)}
                  className="mt-0.5 border-[#8B8BA3]/[40] data-[state=checked]:border-[#FF2D78] data-[state=checked]:bg-[#FF2D78]"
                />
                <label htmlFor="agree-tos" className="text-xs text-[#8B8BA3] leading-relaxed cursor-pointer">
                  I agree to the{' '}
                  <Link href="/terms" className="text-[#FF2D78] hover:text-[#FF6BA6] hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link href="/privacy" className="text-[#FF2D78] hover:text-[#FF6BA6] hover:underline">Privacy Policy</Link>
                </label>
              </div>

              <Button
                type="submit"
                variant="glow"
                className="w-full h-11 text-sm font-medium"
                disabled={loading || !agreeToS}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('auth.register')}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm text-[#8B8BA3]">
              {t('auth.haveAccount')}{' '}
              <Link href="/login" className="font-medium text-[#FF2D78] hover:text-[#FF6BA6] hover:underline">
                {t('auth.signIn')}
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  </div>
);
}
