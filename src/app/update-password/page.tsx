'use client';
import { useTranslation } from '@/lib/i18n/context';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_NAME } from '@/lib/constants';
import { Loader2, Heart, Lock, CheckCircle2 } from 'lucide-react';

function UpdatePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const accessToken = searchParams.get('access_token') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          new_password: password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update password');
        setLoading(false);
        return;
      }

      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center gap-2 mb-2">
            <Heart className="h-8 w-8 text-primary" fill="currentColor" />
            <span className="text-2xl font-bold tracking-tight">{APP_NAME}</span>
          </div>
          <p className="text-sm text-muted-foreground">Choose a new password</p>
        </div>

        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              {done ? 'Password Updated!' : 'Set New Password'}
            </CardTitle>
            <CardDescription>
              {done
                ? 'Redirecting you to sign in...'
                : 'Enter your new password below.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your password has been successfully updated.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {!accessToken && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-500">
                      No reset token found. Please use the link from your password reset email.
                      If you don&apos;t have one,{' '}
                      <a href="/forgot-password" className="underline font-medium">
                        request a new reset link
                      </a>
                      .
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 bg-background/50 border-border/40"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirm" className="text-sm font-medium">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm"
                      type="password"
                      placeholder="••••••••"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="pl-10 bg-background/50 border-border/40"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                {password && confirm && password !== confirm && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-medium"
                  disabled={loading || !accessToken}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Updating...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    }>
      <UpdatePasswordForm />
    </Suspense>
  );
}