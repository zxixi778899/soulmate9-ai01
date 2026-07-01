'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle2, Loader2, Heart } from 'lucide-react';

function PaymentSuccessContent() {
  const router = useRouter();
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVerifying(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-green-500/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-green-500/5 blur-3xl" />
      </div>

      <Card className="w-full max-w-md bg-card/50 backdrop-blur-xl border-border/40 relative">
        <CardHeader className="text-center pb-2">
          {verifying ? (
            <div className="flex justify-center mb-4">
              <Loader2 className="h-12 w-12 text-green-500 animate-spin" />
            </div>
          ) : (
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </div>
          )}
          <CardTitle className="text-2xl font-bold">
            {verifying ? 'Processing...' : 'Payment Successful!'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {verifying
              ? 'Please wait while we confirm your payment...'
              : 'Your membership has been upgraded. Enjoy all the features!'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {!verifying && (
            <>
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 text-sm text-center">
                <Heart className="h-5 w-5 text-green-500 mx-auto mb-2" fill="currentColor" />
                <p className="text-green-500 font-medium">Welcome to the club!</p>
                <p className="text-muted-foreground text-xs mt-1">
                  You now have access to all premium features.
                </p>
              </div>
              <Button
                onClick={() => router.push('/')}
                className="w-full h-11 bg-gradient-to-r from-green-500 to-emerald-600 text-white"
              >
                Start Chatting
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-green-500" />
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}