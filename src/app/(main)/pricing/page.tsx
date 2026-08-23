'use client';

import { authedFetch } from '@/lib/supabase';
import { Fragment, Suspense, useState, useEffect } from 'react';
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
import { Check, Crown, Star, Heart, Loader2, Sparkles, ArrowLeft, Copy, CheckCheck, Wallet, AlertCircle, Diamond } from 'lucide-react';
import { QRCode } from '@/components/QRCode';
import { toast } from 'sonner';
import { useMembership } from '@/hooks/useMembership';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/types';

type BillingCycle = 'monthly' | 'yearly';

/**
 * Membership is purchased with USDT (TRC-20) only.
 * Prices must stay in sync with src/lib/constants.ts + src/lib/crypto-config.ts
 * (crypto-config is the source of truth for what /api/crypto/initiate charges).
 * Copy lives in translations.ts under the `pricing.*` namespace.
 */
interface PricingPlan {
  id: string;
  nameKey: TranslationKey;
  priceMonthly: string;
  priceYearly: string;
  originalMonthly?: string; // pre-beta anchor — beta sale is −50%
  originalYearly?: string;
  periodMonthlyKey: TranslationKey;
  periodYearlyKey: TranslationKey;
  yearlyNoteKey?: TranslationKey;
  descKey: TranslationKey;
  color: string;
  border: string;
  popular?: boolean;
  features: TranslationKey[];
}

const PLANS: PricingPlan[] = [
  {
    id: 'free',
    nameKey: 'pricing.free',
    priceMonthly: '$0',
    priceYearly: '$0',
    periodMonthlyKey: 'pricing.freeForeverPeriod',
    periodYearlyKey: 'pricing.freeForeverPeriod',
    descKey: 'pricing.descFree',
    color: 'text-muted-foreground',
    border: 'border-border/40',
    features: [
      'pricing.feature.msg20',
      'pricing.feature.chatOfficial',
      'pricing.feature.companions3',
      'pricing.feature.freeCredits',
      'pricing.feature.context8k',
      'pricing.feature.shallowMemory',
      'pricing.feature.intimacyLv3',
      'pricing.feature.goodNight',
    ],
  },
  {
    id: 'pro',
    nameKey: 'pricing.pro',
    priceMonthly: '$9.99',
    originalMonthly: '$19.99', // pre-beta anchor — beta sale is −50%
    priceYearly: '$99.99',
    originalYearly: '$199.98',
    periodMonthlyKey: 'pricing.month',
    periodYearlyKey: 'pricing.periodYear',
    yearlyNoteKey: 'pricing.billedYearlyNotePro',
    descKey: 'pricing.descPro',
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    popular: true,
    features: [
      'pricing.feature.msg100',
      'pricing.feature.credits1000',
      'pricing.feature.creations3',
      'pricing.feature.companions10',
      'pricing.feature.context16k',
      'pricing.feature.deepMemory',
      'pricing.feature.5intimacy',
      'pricing.feature.imageVoice',
      'pricing.feature.premiumOutfits',
      'pricing.feature.prioritySupport',
    ],
  },
  {
    id: 'premium',
    nameKey: 'pricing.planPremium',
    priceMonthly: '$19.99',
    originalMonthly: '$39.98', // pre-beta anchor — beta sale is −50%
    priceYearly: '$199.99',
    originalYearly: '$399.98',
    periodMonthlyKey: 'pricing.month',
    periodYearlyKey: 'pricing.periodYear',
    yearlyNoteKey: 'pricing.billedYearlyNotePremium',
    descKey: 'pricing.descPremium',
    color: 'text-fuchsia-400',
    border: 'border-fuchsia-500/30',
    features: [
      'pricing.feature.msg200',
      'pricing.feature.credits2000',
      'pricing.feature.creations6',
      'pricing.feature.companions20',
      'pricing.feature.unlimitedVideo',
      'pricing.feature.context24k',
      'pricing.feature.deepMemory',
      'pricing.feature.5intimacy',
      'pricing.feature.allOutfits',
      'pricing.feature.prioritySupport',
    ],
  },
  {
    id: 'unlimited',
    nameKey: 'pricing.unlimited',
    priceMonthly: '$34.99',
    originalMonthly: '$69.98', // pre-beta anchor — beta sale is −50%
    priceYearly: '$299.99',
    originalYearly: '$599.98',
    periodMonthlyKey: 'pricing.month',
    periodYearlyKey: 'pricing.periodYear',
    yearlyNoteKey: 'pricing.billedYearlyNoteUnlimited',
    descKey: 'pricing.descUnlimited',
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    features: [
      'pricing.feature.msgUnlimited',
      'pricing.feature.credits3500',
      'pricing.feature.creations10',
      'pricing.feature.companionsUnlimited',
      'pricing.feature.unlimitedVideo',
      'pricing.feature.context32k',
      'pricing.feature.infiniteMemory',
      'pricing.feature.aiProactive',
      'pricing.feature.allOutfitsUnlocked',
      'pricing.feature.studioEarly',
      'pricing.feature.prioritySupport',
    ],
  },
];

/** Sentinel used to splice an inline link into translated copy. */
const LINK_SLOT = '\u0000';

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canceled = searchParams.get('canceled') === 'true';
  const { t, locale } = useTranslation();
  const [billing, setBilling] = useState<BillingCycle>('monthly');

  // USDT payment state
  const [cryptoPlan, setCryptoPlan] = useState<string | null>(null);
  const [cryptoBilling, setCryptoBilling] = useState<BillingCycle>('monthly');
  const [cryptoPaymentId, setCryptoPaymentId] = useState<string | null>(null);
  const [cryptoWallet, setCryptoWallet] = useState('');
  const [cryptoNetwork, setCryptoNetwork] = useState('TRC-20');
  const [cryptoAmount, setCryptoAmount] = useState<number | null>(null);
  const [txHash, setTxHash] = useState('');
  const [cryptoStep, setCryptoStep] = useState<'initiating' | 'pay' | 'submitting' | 'done'>('initiating');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  useEffect(() => {
    if (canceled) {
      toast.info(t('pricing.toastCanceled'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canceled]);

  const { tier, subscriptionEnd } = useMembership();
  const { user } = useAuth();
  const TIER_ORDER: Record<string, number> = { free: 0, pro: 1, premium: 2, unlimited: 3, admin: 4 };
  const currentRank = TIER_ORDER[tier] ?? 0;

  const planNameKey = (planId: string | null): TranslationKey | null =>
    PLANS.find((p) => p.id === planId)?.nameKey ?? null;
  const cryptoPlanName = planNameKey(cryptoPlan);

  const resetCrypto = () => {
    setCryptoPlan(null);
    setCryptoPaymentId(null);
    setCryptoWallet('');
    setCryptoAmount(null);
    setTxHash('');
    setCryptoStep('initiating');
  };

  const handleCryptoInitiate = async (planId: string) => {
    if (!user) {
      router.push('/register?next=/pricing');
      return;
    }
    setCryptoPlan(planId);
    setCryptoBilling(billing);
    setCryptoPaymentId(null);
    setCryptoWallet('');
    setCryptoAmount(null);
    setTxHash('');
    setCryptoStep('initiating');
    try {
      const res = await authedFetch('/api/crypto/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, currencyId: 'usdt-trc20', billing }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || t('pricing.toastInitiateFailed'));
        resetCrypto();
        return;
      }

      if (!data.walletAddress) {
        toast.error(t('pricing.toastNoWallet'));
        resetCrypto();
        return;
      }

      setCryptoPaymentId(data.paymentId);
      setCryptoWallet(data.walletAddress);
      setCryptoNetwork(data.network || 'TRC-20');
      setCryptoAmount(Number(data.amountUsd) || null);
      setCryptoStep('pay');
    } catch {
      toast.error(t('pricing.toastNetworkError'));
      resetCrypto();
    }
  };

  const handleCryptoSubmit = async () => {
    if (!txHash.trim() || txHash.trim().length < 10) {
      toast.error(t('pricing.toastTxInvalid'));
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
        toast.success(t('pricing.toastSubmitted'), {
          description: t('pricing.toastSubmittedDesc'),
        });
      } else {
        toast.error(data.error || t('pricing.toastSubmitFailed'));
        setCryptoStep('pay');
      }
    } catch {
      toast.error(t('pricing.toastNetworkError'));
      setCryptoStep('pay');
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const formatUsd = (n: number) => `$${n.toFixed(2)}`;

  // Footer copy carries an inline Terms link — splice it into the translation.
  const footerNoteParts = t('pricing.footerNote', { terms: LINK_SLOT }).split(LINK_SLOT);

  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 sm:px-6 py-8">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative max-w-none mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> {t('pricing.back')}
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Crown className="h-6 w-6 text-amber-400" />
            <h1 className="text-3xl font-bold">{t('pricing.unlockTitle')}</h1>
          </div>
          <p className="text-muted-foreground max-w-xl mx-auto">
            {t('pricing.subtitle')}
          </p>

          {/* Billing toggle */}
          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                billing === 'monthly' ? 'bg-white text-black font-semibold' : 'text-muted-foreground'
              }`}
            >
              {t('pricing.toggleMonthly')}
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`px-4 py-1.5 rounded-full text-sm transition-all flex items-center gap-1.5 ${
                billing === 'yearly' ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white font-semibold' : 'text-muted-foreground'
              }`}
            >
              {t('pricing.toggleYearly')}
              <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px] px-1.5">{t('pricing.yearlyBadge')}</Badge>
            </button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground/80">
            {t('pricing.cryptoNote')}{' '}
            {t('pricing.refundPolicyLead')}{' '}
            <a href="/refund-policy" className="text-[#FF6BA6] underline underline-offset-2">{t('pricing.refundPolicy')}</a>.
          </p>
        </div>

        {/* Beta celebration sale banner */}
        <div className="mb-6 rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-300/12 via-white/[0.04] to-[#FF2D78]/10 px-4 py-3 text-center">
          <p className="text-sm font-bold text-amber-200">{t('pricing.bannerBeta')}</p>
          <p className="mt-0.5 text-xs text-white/70">
            {t('pricing.bannerDesc')}
          </p>
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
                    <Check className="h-3 w-3 mr-1" /> {t('pricing.currentPlan')}
                  </Badge>
                </div>
              ) : plan.popular ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white border-0 px-4 py-0.5 text-[10px] font-semibold">
                    <Sparkles className="h-3 w-3 mr-1" /> {t('pricing.mostPopular')}
                  </Badge>
                </div>
              ) : null}

              <CardHeader className="pb-4">
                <CardTitle className={`text-lg font-semibold ${plan.color}`}>
                  <div className="flex items-center gap-2">
                    {plan.id === 'free' && <Heart className="h-4 w-4" />}
                    {plan.id === 'pro' && <Crown className="h-4 w-4" />}
                    {plan.id === 'premium' && <Diamond className="h-4 w-4" />}
                    {plan.id === 'unlimited' && <Star className="h-4 w-4" />}
                    {t(plan.nameKey)}
                  </div>
                </CardTitle>
                <div className="mt-2">
                  {plan.originalMonthly && (
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-sm text-muted-foreground/70 line-through">
                        {billing === 'yearly' ? plan.originalYearly : plan.originalMonthly}
                      </span>
                      <Badge className="bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white border-0 px-1.5 py-0 text-[9px] font-black">
                        {t('pricing.betaBadge')}
                      </Badge>
                    </div>
                  )}
                  <span className="text-3xl font-bold">
                    {billing === 'yearly' ? plan.priceYearly : plan.priceMonthly}
                  </span>
                  <span className="text-sm text-muted-foreground ml-1">
                    {t(billing === 'yearly' ? plan.periodYearlyKey : plan.periodMonthlyKey)}
                  </span>
                </div>
                {billing === 'yearly' && plan.yearlyNoteKey && (
                  <p className="text-[11px] text-emerald-400 mt-1">{t(plan.yearlyNoteKey)}</p>
                )}
                <CardDescription className="text-xs text-muted-foreground/60">
                  {t(plan.descKey)}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {plan.features.map((featureKey) => (
                  <div key={featureKey} className="flex items-start gap-2 text-sm">
                    <Check className={`h-4 w-4 shrink-0 mt-0.5 ${
                      plan.id === 'pro' ? 'text-purple-400' :
                      plan.id === 'premium' ? 'text-fuchsia-400' :
                      plan.id === 'unlimited' ? 'text-amber-400' :
                      'text-muted-foreground'
                    }`} />
                    <span className="text-muted-foreground">{t(featureKey)}</span>
                  </div>
                ))}
              </CardContent>

              <CardFooter className="flex-col gap-2">
                {plan.id === 'free' ? (
                  <Button
                    className="w-full h-11 text-sm font-medium"
                    variant="outline"
                    disabled
                  >
                    {tier === 'free' ? t('pricing.currentPlan') : t('pricing.freeForever')}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleCryptoInitiate(plan.id)}
                    className={`w-full h-11 text-sm font-medium gap-1.5 ${
                      plan.id === 'pro'
                        ? 'bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white hover:opacity-90'
                        : plan.id === 'premium'
                        ? 'bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white hover:opacity-90'
                        : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:opacity-90'
                    }`}
                    variant={plan.id === tier || (TIER_ORDER[plan.id] ?? 0) <= currentRank ? 'outline' : 'default'}
                    disabled={plan.id === tier || (TIER_ORDER[plan.id] ?? 0) <= currentRank}
                  >
                    <Wallet className="h-4 w-4" />
                    {plan.id === tier
                      ? t('pricing.currentPlan')
                      : (TIER_ORDER[plan.id] ?? 0) <= currentRank
                      ? t('pricing.includedInPlan')
                      : !user
                      ? t('pricing.signUpToSubscribe')
                      : t('pricing.paidViaUsdt')}
                  </Button>
                )}
                {plan.id === tier && subscriptionEnd && (
                  <p className="text-[11px] text-emerald-400/80 text-center">
                    {new Date(subscriptionEnd) < new Date()
                      ? t('pricing.expired', { date: new Date(subscriptionEnd).toLocaleDateString(locale) })
                      : t('pricing.expires', { date: new Date(subscriptionEnd).toLocaleDateString(locale) })}
                  </p>
                )}
                {plan.id !== 'free' && (TIER_ORDER[plan.id] ?? 0) > currentRank && (
                  <p className="text-[10px] text-muted-foreground/60 text-center">
                    {billing === 'yearly'
                      ? t('pricing.billedYearly', { amount: plan.priceYearly })
                      : t('pricing.billedMonthly', { amount: plan.priceMonthly })}
                  </p>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">{t('pricing.usdtTrc20')}</span>
            <span className="flex items-center gap-1">{t('pricing.secureCheckout')}</span>
            <span className="flex items-center gap-1">{t('pricing.cancelAnytime')}</span>
          </div>
          <p className="text-[11px] text-muted-foreground/50 max-w-lg mx-auto">
            {footerNoteParts.map((part, i) => (
              <Fragment key={i}>
                {part}
                {i < footerNoteParts.length - 1 && (
                  <a href="/terms" className="underline underline-offset-2 hover:text-foreground">{t('pricing.termsLink')}</a>
                )}
              </Fragment>
            ))}
          </p>
        </div>
      </div>

      {/* USDT Payment Dialog */}
      <Dialog
        open={!!cryptoPlan}
        onOpenChange={(open) => {
          if (!open) resetCrypto();
        }}
      >
        <DialogContent className="sm:max-w-md">
          {cryptoStep === 'initiating' && (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">{t('pricing.dialogPreparing')}</p>
            </div>
          )}

          {cryptoStep === 'pay' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  {t('pricing.dialogSendTitle')}
                </DialogTitle>
                <DialogDescription>
                  {t('pricing.dialogDesc', {
                    plan: cryptoPlanName ? t(cryptoPlanName) : String(cryptoPlan),
                    billing: cryptoBilling === 'yearly' ? t('pricing.toggleYearly') : t('pricing.toggleMonthly'),
                    amount: cryptoAmount != null ? `${formatUsd(cryptoAmount)} USDT` : 'USDT',
                    network: cryptoNetwork,
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-xl">
                    <QRCode value={cryptoWallet} size={160} />
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('pricing.dialogDepositLabel', { network: cryptoNetwork })}</label>
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
                    {t('pricing.dialogNetworkWarn', { network: cryptoNetwork })}
                  </p>
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/40" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-card px-2 text-xs text-muted-foreground">
                      {t('pricing.dialogAfterSend')}
                    </span>
                  </div>
                </div>

                {/* TX Hash Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('pricing.dialogTxLabel')}</label>
                  <Input
                    placeholder={t('pricing.dialogTxPlaceholder')}
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {t('pricing.dialogTxHint')}
                  </p>
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={resetCrypto}
                >
                  {t('pricing.dialogCancel')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCryptoSubmit}
                  disabled={txHash.trim().length < 10}
                >
                  {t('pricing.dialogSubmit')}
                </Button>
              </DialogFooter>
            </>
          )}

          {cryptoStep === 'submitting' && (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">{t('pricing.dialogSubmitting')}</p>
            </div>
          )}

          {cryptoStep === 'done' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-400">
                  <CheckCheck className="h-5 w-5" />
                  {t('pricing.dialogDoneTitle')}
                </DialogTitle>
                <DialogDescription>
                  {t('pricing.dialogDoneDesc')}
                </DialogDescription>
              </DialogHeader>

              <div className="py-6 space-y-3">
                <div className="p-4 rounded-xl bg-muted/20 border border-border/40 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('pricing.dialogPlan')}</span>
                    <span className="font-semibold">{cryptoPlanName ? t(cryptoPlanName) : cryptoPlan}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('pricing.billing')}</span>
                    <span className="font-semibold">
                      {cryptoBilling === 'yearly' ? t('pricing.toggleYearly') : t('pricing.toggleMonthly')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('pricing.dialogAmount')}</span>
                    <span className="font-semibold">
                      {cryptoAmount != null ? `${formatUsd(cryptoAmount)} USDT` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('pricing.dialogNetwork')}</span>
                    <span>{cryptoNetwork}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('pricing.dialogStatus')}</span>
                    <span className="text-yellow-400">{t('pricing.pendingVerification')}</span>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button className="w-full" onClick={() => {
                  resetCrypto();
                  router.refresh();
                }}>
                  {t('pricing.dialogDone')}
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
