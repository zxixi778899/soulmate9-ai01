'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

const SUPABASE_AUTH_KEY = 'sb-ywktqpaycmuoxnzxxlbr-auth-token';

function AuthConfirmContent() {
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const confirm = async () => {
      const code = searchParams.get('code');
      const next = searchParams.get('next') ?? '/';

      if (!code) {
        setError('No authorization code provided');
        return;
      }

      try {
        const res = await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Authentication failed');
          return;
        }

        // Manually store session in localStorage
        localStorage.setItem(
          SUPABASE_AUTH_KEY,
          JSON.stringify({
            access_token: data.access_token,
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: data.expires_at,
            refresh_token: data.refresh_token,
            user: data.user,
          })
        );

        window.location.href = next;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    confirm();
  }, [searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Card className="w-96 bg-neutral-900 border-neutral-800">
          <CardContent className="pt-6 text-center">
            <p className="text-red-400 mb-4">Authentication failed: {error}</p>
            <a href="/login" className="text-pink-400 hover:text-pink-300 underline">
              Back to login
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <Card className="w-96 bg-neutral-900 border-neutral-800">
        <CardContent className="pt-6 text-center">
          <Spinner className="mx-auto mb-4" />
          <p className="text-neutral-400">Completing sign in...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthConfirm() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Card className="w-96 bg-neutral-900 border-neutral-800">
          <CardContent className="pt-6 text-center">
            <Spinner className="mx-auto mb-4" />
            <p className="text-neutral-400">Completing sign in...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <AuthConfirmContent />
    </Suspense>
  );
}
