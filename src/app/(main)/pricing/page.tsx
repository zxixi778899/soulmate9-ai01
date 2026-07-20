'use client';

import { authedFetch } from '@/lib/supabase';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Check, Crown, Star, Heart, Loader2, Sparkles, ArrowLeft, Copy, CheckCheck, Wallet, AlertCircle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useMembership } from '@/hooks/useMembership';
import { useAuth } from '@/components/AuthProvider';

type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: '$0',
    priceQuarterly: '$0',
    priceYearly: '$0',
    periodMonthly: 'forever',
    periodQuarterly: 'forever',
    periodYearly: 'forever',
    color: 'text-muted-foreground',
    border: 'border-border/40',
    features: [
      '40 messages per day',
      '3 image generations/day',
      '3 voice messages/day',
      'Intimacy up to Level 3',
      'Up to 3 companions',
      'Basic chat',
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    priceMonthly: '$9.99',
    priceQuarterly: '$25.47',
    priceYearly: '$83.92',
    periodMonthly: '/month',
    periodQuarterly: '/quarter',
    periodYearly: '/year',
    quarterlyNote: 'Save 15% · $8.49/mo',
    yearlyNote: 'Save 30% · $6.99/mo',
    color: 'text-sky-400',
    border: 'border-sky-500/30',
    features: [
      '150 messages per day',
      '5 image generations/day',
      '15 voice messages/day',
      'Intimacy up to Level 5',
      'Up to 8 companions',
      'Standard memory depth',
      'Standard outfit access',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: '$19.99',
    priceQuarterly: '$50.97',
    priceYearly: '$167.92',
    periodMonthly: '/month',
    periodQuarterly: '/quarter',
    periodYearly: '/year',
    quarterlyNote: 'Save 15% · $16.99/mo',
    yearlyNote: 'Save 30% · $13.99/mo',
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    popular: true,
    features: [
      '300 messages per day',
      'All intimacy levels (Soulmate)',
      'Unlimited companions',
      'NSFW content',
      'Voice messages',
      '10 image generations/day',
      '40 voice messages/day',
      'Priority support',
    ],
  },
  {
    id: 'unlimited',
    name: 'Unlimited',
    priceMonthly: '$29.99',
    priceQuarterly: '$76.47',
    priceYearly: '$251.92',
    periodMonthly: '/month',
    periodQuarterly: '/quarter',
    periodYearly: '/year',
    quarterlyNote: 'Save 15% · $25.49/mo',
    yearlyNote: 'Save 30% · $20.99/mo',
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    features: [
      'Everything in Pro',
      'Unlimited messages',
      '50 image generations/day',
      '200 voice messages/day',
      'Video generation',
      'Infinite memory depth',
      'Early access to new features',
    ],
  },
];

const CRYPTO_CURRENCIES = [
  { id: 'USDT', name: 'USDT', network: 'TRC-20', icon: '', placeholder: 'TRC-20 tx hash...' },
  { id: 'BTC', name: 'Bitcoin', network: 'Bitcoin', icon: '', placeholder: 'BTC tx hash...' },
  { id: 'ETH', name: 'Ethereum', network: 'ERC-20', icon: '', placeholder: 'ETH tx hash...' },
];

function getPlanPrice(planId: string): string {
  const prices: Record<string, string> = { basic: '$9.99', pro: '$19.99', unlimited: '$29.99' };
  return prices[planId] || '$9.99';
}

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canceled = searchParams.get('canceled') === 'true';
  const [loading, setLoading] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingCycle>('quarterly');

  // Crypto payment state
  const [cryptoPlan, setCryptoPlan] = useState<string | null>(null);
  const [cryptoCurrency, setCryptoCurrency] = useState('USDT');
  const [cryptoPaymentId, setCryptoPaymentId] = useState<string | null>(null);
  const [cryptoWallet, setCryptoWallet] = useState('');
  const [cryptoNetwork, setCryptoNetwork] = useState('');
  const [txHash, setTxHash] = useState('');
  const [cryptoStep, setCryptoStep] = useState<'select' | 'initiating' | 'pay' | 'submitting' | 'done'>('select');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  useEffect(() => {
    if (canceled) {
      toast.info('Payment was canceled. No charges were made.');
    }
  }, [canceled]);

  const { tier } = useMembership();
  const { user } = useAuth();
  const TIER_ORDER: Record<string, number> = { free: 0, basic: 1, pro: 2, unlimited: 3, admin: 4 };
  const currentRank = TIER_ORDER[tier] ?? 0;

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free') return;
    if (!user) {
      router.push('/register?next=/pricing');
      return;
    }
    setLoading(planId);

    try {
      const res = await authedFetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, billing }),
      });

      const data = await res.json();

      if (!res.ok) {
        // NOTE: do NOT add a fallback here that calls /api/membership POST to
        // grant the plan directly — that endpoint must never upgrade a user
        // without a verified Stripe payment. See src/app/api/membership/route.ts.
        toast.error(data.error || 'Upgrade failed. Please try again.');
        setLoading(null);
        return;
      }

      window.location.href = data.url;
    } catch {
      toast.error('Network error. Please try again.');
    }
    setLoading(null);
  };

  const handleCryptoInitiate = async (planId: string, currencyId: string) => {
    setCryptoStep('initiating');
    try {
      const res = await authedFetch('/api/crypto/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, currencyId }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to initiate crypto payment');
        setCryptoStep('select');
        return;
      }

      setCryptoPaymentId(data.paymentId);
      setCryptoWallet(data.walletAddress);
      setCryptoNetwork(data.network);
      setCryptoStep('pay');
    } catch {
      toast.error('Network error. Please try again.');
      setCryptoStep('select');
    }
  };

  const handleCryptoSubmit = async () => {
    if (!txHash.trim() || txHash.trim().length < 10) {
      toast.error('Please enter a valid transaction hash');
      return;
    }
    setCryptoStep('submitting');
    try {
      const res = await authedFetch('/api/crypto/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: cryptoPaymentId, txHash: txHash.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCryptoStep('done');
        toast.success('Payment submitted for verification!', {
          description: 'Our team will verify your payment within 24 hours.',
        });
      } else {
        toast.error(data.error || 'Failed to submit payment');
        setCryptoStep('pay');
      }
    } catch {
      toast.error('Network error. Please try again.');
      setCryptoStep('pay');
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 sm:px-6 py-8">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Crown className="h-6 w-6 text-amber-400" />
            <h1 className="text-3xl font-bold">Unlock Full Experience</h1>
          </div>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Upgrade anytime — cancel anytime. Secure checkout via Stripe or crypto.
          </p>

          {/* Billing toggle */}
          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                billing === 'monthly' ? 'bg-white text-black font-semibold' : 'text-muted-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('quarterly')}
              className={`px-4 py-1.5 rounded-full text-sm transition-all flex items-center gap-1.5 ${
                billing === 'quarterly' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-semibold' : 'text-muted-foreground'
              }`}
            >
              Quarterly
              <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px] px-1.5">Save 15%</Badge>
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`px-4 py-1.5 rounded-full text-sm transition-all flex items-center gap-1.5 ${
                billing === 'yearly' ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white font-semibold' : 'text-muted-foreground'
              }`}
            >
              Yearly
              <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px] px-1.5">Save 30%</Badge>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`relative border ${
                plan.popular
                  ? `${plan.border} ring-1 ring-purple-500/20 scale-[1.02] md:scale-105`
                  : plan.border
              } bg-card/50 backdrop-blur-xl transition-all hover:border-opacity-60`}
            >
              {plan.id === tier ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 px-4 py-0.5 text-[10px] font-semibold">
                    <Check className="h-3 w-3 mr-1" /> Current Plan
                  </Badge>
                </div>
              ) : plan.popular ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white border-0 px-4 py-0.5 text-[10px] font-semibold">
                    <Sparkles className="h-3 w-3 mr-1" /> Most Popular
                  </Badge>
                </div>
              ) : null}

              <CardHeader className="pb-4">
                <CardTitle className={`text-lg font-semibold ${plan.color}`}>
                  <div className="flex items-center gap-2">
                    {plan.id === 'free' && <Heart className="h-4 w-4" />}
                    {plan.id === 'basic' && <Zap className="h-4 w-4" />}
                    {plan.id === 'pro' && <Crown className="h-4 w-4" />}
                    {plan.id === 'unlimited' && <Star className="h-4 w-4" />}
                    {plan.name}
                  </div>
                </CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">
                    {billing === 'yearly' ? plan.priceYearly : billing === 'quarterly' ? plan.priceQuarterly : plan.priceMonthly}
                  </span>
                  <span className="text-sm text-muted-foreground ml-1">
                    {billing === 'yearly' ? plan.periodYearly : billing === 'quarterly' ? plan.periodQuarterly : plan.periodMonthly}
                  </span>
                </div>
                {billing === 'yearly' && plan.yearlyNote && (
                  <p className="text-[11px] text-emerald-400 mt-1">{plan.yearlyNote}</p>
                )}
                {billing === 'quarterly' && plan.quarterlyNote && (
                  <p className="text-[11px] text-emerald-400 mt-1">{plan.quarterlyNote}</p>
                )}
                <CardDescription className="text-xs text-muted-foreground/60">
                  {plan.id === 'free' && 'Get started free'}
                  {plan.id === 'basic' && 'Great value to start'}
                  {plan.id === 'pro' && 'For serious connections'}
                  {plan.id === 'unlimited' && 'The ultimate experience'}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <Check className={`h-4 w-4 shrink-0 mt-0.5 ${
                      plan.id === 'basic' ? 'text-sky-400' :
                      plan.id === 'pro' ? 'text-purple-400' :
                      plan.id === 'unlimited' ? 'text-amber-400' :
                      'text-muted-foreground'
                    }`} />
                    <span className="text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </CardContent>

              <CardFooter className="flex-col gap-2">
                <Button
                  onClick={() => handleUpgrade(plan.id)}
                  className={`w-full h-11 text-sm font-medium ${
                    plan.id === 'basic'
                      ? 'bg-gradient-to-r from-sky-500 to-cyan-600 text-white hover:opacity-90'
                      : plan.id === 'pro'
                      ? 'bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white hover:opacity-90'
                      : plan.id === 'unlimited'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:opacity-90'
                      : ''
                  }`}
                  variant={plan.id === 'free' || plan.id === tier || (TIER_ORDER[plan.id] ?? 0) <= currentRank ? 'outline' : 'default'}
                  disabled={loading === plan.id || plan.id === tier || plan.id === 'free' || (TIER_ORDER[plan.id] ?? 0) <= currentRank}
                >
                  {loading === plan.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {plan.id === tier
                    ? 'Current Plan'
                    : plan.id === 'free'
                    ? 'Free Forever'
                    : (TIER_ORDER[plan.id] ?? 0) <= currentRank
                    ? 'Included in Your Plan'
                    : !user
                    ? 'Sign Up to Subscribe'
                    : ' Pay with Card'}
                </Button>
                {plan.id !== 'free' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-9 text-xs gap-1.5"
                    onClick={() => {
                      setCryptoPlan(plan.id);
                      setCryptoCurrency('USDT');
                      setTxHash('');
                      setCryptoStep('select');
                      setCryptoPaymentId(null);
                    }}
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    Pay with Crypto
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">💳 Card · Stripe</span>
            <span className="flex items-center gap-1">₿ Crypto · NOWPayments</span>
            <span className="flex items-center gap-1">🔒 Secure checkout</span>
            <span className="flex items-center gap-1">✕ Cancel anytime</span>
          </div>
          <p className="text-[11px] text-muted-foreground/50 max-w-lg mx-auto">
            Subscriptions auto-renew until canceled; manage or cancel anytime in Profile. Refunds are handled per our{' '}
            <a href="/terms" className="underline underline-offset-2 hover:text-foreground">Terms of Service</a>. Prices exclude applicable taxes; tax is calculated at checkout.
          </p>
        </div>
      </div>

      {/* Crypto Payment Dialog */}
      <Dialog
        open={!!cryptoPlan}
        onOpenChange={(open) => {
          if (!open) {
            setCryptoPlan(null);
            setCryptoStep('select');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {cryptoStep === 'select' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Pay with Cryptocurrency
                </DialogTitle>
                <DialogDescription>
                  Choose your cryptocurrency to pay for{' '}
                  <strong className="text-foreground capitalize">{cryptoPlan}</strong>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                {CRYPTO_CURRENCIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCryptoCurrency(c.id);
                      handleCryptoInitiate(cryptoPlan!, c.id);
                    }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all hover:border-primary/40 hover:bg-muted/20 ${
                      cryptoCurrency === c.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/40 bg-card/30'
                    }`}
                  >
                    <span className="text-2xl">{c.icon}</span>
                    <div className="text-left flex-1">
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.network} Network</div>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {getPlanPrice(cryptoPlan!)}
                    </span>
                  </button>
                ))}
              </div>

              <DialogFooter className="text-xs text-muted-foreground">
                <p>By proceeding, you agree to our payment terms.</p>
              </DialogFooter>
            </>
          )}

          {cryptoStep === 'initiating' && (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Generating payment address...</p>
            </div>
          )}

          {cryptoStep === 'pay' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Send {cryptoCurrency}
                </DialogTitle>
                <DialogDescription>
                  Send exactly <strong className="text-foreground">
                    {getPlanPrice(cryptoPlan!)} worth of {cryptoCurrency}
                  </strong> to the address below on the {cryptoNetwork} network.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Wallet Address */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Deposit Address ({cryptoNetwork})</label>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/40">
                    <code className="flex-1 text-xs break-all font-mono">{cryptoWallet}</code>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 h-8 w-8"
                      onClick={() => handleCopy(cryptoWallet, 'wallet')}
                    >
                      {copiedIndex === 'wallet' ? (
                        <CheckCheck className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Only send {cryptoCurrency} on the {cryptoNetwork} network. Other networks will be lost.
                  </p>
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/40" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-card px-2 text-xs text-muted-foreground">
                      After sending, enter your TX hash
                    </span>
                  </div>
                </div>

                {/* TX Hash Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Transaction Hash</label>
                  <Input
                    placeholder={CRYPTO_CURRENCIES.find(c => c.id === cryptoCurrency)?.placeholder || 'Transaction hash...'}
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Paste the transaction hash from your wallet after sending the payment.
                  </p>
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCryptoStep('select');
                    setCryptoPlan(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCryptoSubmit}
                  disabled={txHash.trim().length < 10}
                >
                  Submit Payment
                </Button>
              </DialogFooter>
            </>
          )}

          {cryptoStep === 'submitting' && (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Submitting your payment for verification...</p>
            </div>
          )}

          {cryptoStep === 'done' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-400">
                  <CheckCheck className="h-5 w-5" />
                  Payment Submitted!
                </DialogTitle>
                <DialogDescription>
                  Your crypto payment has been recorded. Our team will verify your transaction within 24 hours.
                  You will receive a notification once your membership is activated.
                </DialogDescription>
              </DialogHeader>

              <div className="py-6 space-y-3">
                <div className="p-4 rounded-xl bg-muted/20 border border-border/40 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-semibold capitalize">{cryptoPlan}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-semibold">{getPlanPrice(cryptoPlan!)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Currency</span>
                    <span>{cryptoCurrency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="text-yellow-400">Pending Verification</span>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button className="w-full" onClick={() => {
                  setCryptoPlan(null);
                  setCryptoStep('select');
                  router.refresh();
                }}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}
