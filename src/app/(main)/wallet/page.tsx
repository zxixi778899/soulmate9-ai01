"use client";

import { useState, useEffect, useCallback } from "react";
import { authedFetch } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n/context";
import { Coins, TrendingUp, TrendingDown, CalendarCheck, MessageCircle, Image, Video, Gift, ShoppingBag, Zap, Loader2, ShieldCheck, Film } from "lucide-react";
import { QRCode } from "@/components/QRCode";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CREDIT_COSTS,
  GIFT_CREDIT_COSTS,
  DAILY_CHECKIN_REWARD,
  CREDIT_EXCHANGE,
} from "@/lib/credit-system";

type Transaction = { id: number; delta: number; reason: string; ref_id: string | null; balance_after: number; created_at: string; };
type HistoryData = { transactions: Transaction[]; total: number; page: number; limit: number; balance: number; today: { earned: number; spent: number; net: number }; };
type TokenPackage = { id: string; name: string; token_count: number; bonus_tokens: number; price_cents: number; sort_order: number; is_active: boolean; video_url?: string; image_url?: string; };

export default function WalletPage() {
  const { t } = useTranslation();
  const REASON_META: Record<string, { label: string; icon: typeof Coins; color: string }> = {
    daily_checkin: { label: t('wallet.reason.dailyCheckin'), icon: CalendarCheck, color: "text-emerald-400" },
    chat_extra: { label: t('wallet.reason.extraChat'), icon: MessageCircle, color: "text-sky-400" },
    image_gen_extra: { label: t('wallet.reason.imageGen'), icon: Image, color: "text-purple-400" },
    video_gen: { label: t('wallet.reason.videoGen'), icon: Video, color: "text-rose-400" },
    tts_extra: { label: t('wallet.reason.voice'), icon: Zap, color: "text-amber-400" },
    gift_send: { label: t('wallet.reason.gift'), icon: Gift, color: "text-pink-400" },
    shop_purchase: { label: t('wallet.reason.shopPurchase'), icon: ShoppingBag, color: "text-orange-400" },
    token_purchase: { label: t('wallet.reason.creditsPurchase'), icon: Coins, color: "text-yellow-400" },
    signup_bonus: { label: t('wallet.reason.welcomeBonus'), icon: Coins, color: "text-yellow-400" },
    admin_grant: { label: t('wallet.reason.adminGrant'), icon: Coins, color: "text-gray-400" },
    refund: { label: t('wallet.reason.refund'), icon: Coins, color: "text-emerald-400" },
    achievement: { label: t('wallet.reason.achievement'), icon: Zap, color: "text-amber-400" },
  };
  const [data, setData] = useState<HistoryData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [cryptoDialog, setCryptoDialog] = useState<{
    open: boolean;
    paymentId: string | null;
    walletAddress: string;
    network: string;
    amountUsd: number;
    txHash: string;
    step: 'pay' | 'submitting' | 'done';
    pkgName: string;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    authedFetch(`/api/credits/history?page=${page}&limit=20`)
      .then((r) => r.json())
      .then((d) => setData(d as HistoryData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  // Fetch credit packages (with backend showcase media) from backend
  useEffect(() => {
    authedFetch("/api/v2/shop/tokens")
      .then((r) => r.json())
      .then((d) => {
        if (d.packages?.length) setPackages(d.packages as TokenPackage[]);
      })
      .catch(() => {});
  }, []);

  const handleBuyPackage = useCallback(async (pkg: TokenPackage) => {
    setBuying(pkg.id);
    try {
      const res = await authedFetch("/api/v2/shop/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: pkg.id, provider: "crypto" }),
      });
      const result = await res.json();
      if (result.provider === 'crypto') {
        setCryptoDialog({
          open: true,
          paymentId: result.paymentId,
          walletAddress: result.walletAddress,
          network: result.network,
          amountUsd: result.amountUsd,
          txHash: '',
          step: 'pay',
          pkgName: pkg.name,
        });
      } else if (result.error) {
        toast.error(result.error);
      } else {
        toast.error(t('wallet.createOrderFailed'));
      }
    } catch {
      toast.error(t('common.networkError'));
    }
    setBuying(null);
  }, [t]);

  const handleSubmitCryptoPayment = async () => {
    if (!cryptoDialog?.txHash?.trim() || cryptoDialog.txHash.trim().length < 10) {
      toast.error('Please enter a valid transaction hash');
      return;
    }
    setCryptoDialog({ ...cryptoDialog, step: 'submitting' });
    try {
      const res = await authedFetch('/api/crypto/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: cryptoDialog.paymentId, txHash: cryptoDialog.txHash.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCryptoDialog({ ...cryptoDialog, step: 'done' });
        if (data.autoConfirmed) {
          toast.success(t('wallet.paymentConfirmed'), { description: data.message });
          // Refresh data
          authedFetch(`/api/credits/history?page=${page}&limit=20`)
            .then((r) => r.json())
            .then((d) => setData(d as HistoryData))
            .catch(() => {});
        } else {
          toast.info(t('wallet.paymentPending'), { description: data.message });
        }
      } else {
        toast.error(data.error || 'Failed to submit payment');
        setCryptoDialog({ ...cryptoDialog, step: 'pay' });
      }
    } catch {
      toast.error(t('common.networkError'));
      setCryptoDialog({ ...cryptoDialog, step: 'pay' });
    }
  };

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  // Accurate credit costs — single source of truth from credit-system.ts
  const giftValues = Object.values(GIFT_CREDIT_COSTS);
  const giftMin = Math.min(...giftValues);
  const giftMax = Math.max(...giftValues);

  const costItems: Array<{ icon: typeof Coins; color: string; label: string; value: string; sub?: string }> = [
    { icon: Image, color: "text-purple-400", label: t('wallet.imageGen'), value: `${CREDIT_COSTS.image_gen}`, sub: t('wallet.imageGenHd', { cost: CREDIT_COSTS.image_gen_hd }) },
    { icon: Video, color: "text-rose-400", label: t('wallet.videoGen'), value: `${CREDIT_COSTS.video_5s}`, sub: t('wallet.video10s', { cost: CREDIT_COSTS.video_10s }) },
    { icon: Zap, color: "text-amber-400", label: t('wallet.voiceTts'), value: `${CREDIT_COSTS.tts}` },
    { icon: Gift, color: "text-pink-400", label: t('wallet.gifts'), value: `${giftMin}~${giftMax}` },
    { icon: MessageCircle, color: "text-sky-400", label: t('wallet.textChat'), value: t('wallet.included'), sub: t('wallet.noExtraCredits') },
    { icon: CalendarCheck, color: "text-emerald-400", label: t('wallet.dailyCheckin'), value: `+${DAILY_CHECKIN_REWARD}` },
  ];

  const hasProducts = packages.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Coins className="w-6 h-6 text-yellow-400" />
            {t('wallet.myCredits')}
          </h1>
        </div>

        {/* ── Top row: balance + today stats ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 mb-8">
          {/* Balance card */}
          <div className="lg:col-span-4 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 p-5 flex flex-col justify-center">
            <p className="text-sm text-yellow-200/70 mb-1">{t('wallet.currentBalance')}</p>
            <p className="text-4xl font-bold text-yellow-300">{data?.balance ?? "..."}</p>
            <p className="text-xs text-yellow-200/50 mt-2">
              {CREDIT_EXCHANGE.credits} {t('common.credits')} = ${(CREDIT_EXCHANGE.usd_cents / 100).toFixed(2)}
            </p>
          </div>

          {/* Today stats */}
          <div className="lg:col-span-8 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <TrendingUp className="w-5 h-5 text-emerald-400 mb-1.5" />
              <p className="text-xl sm:text-2xl font-semibold text-emerald-400">+{data?.today?.earned ?? 0}</p>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{t('wallet.earnedToday')}</p>
            </div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <TrendingDown className="w-5 h-5 text-rose-400 mb-1.5" />
              <p className="text-xl sm:text-2xl font-semibold text-rose-400">-{data?.today?.spent ?? 0}</p>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{t('wallet.spentToday')}</p>
            </div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <Coins className="w-5 h-5 text-yellow-400 mb-1.5" />
              <p className={cn("text-xl sm:text-2xl font-semibold", (data?.today?.net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {(data?.today?.net ?? 0) >= 0 ? "+" : ""}{data?.today?.net ?? 0}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{t('wallet.netToday')}</p>
            </div>
          </div>
        </div>

        {/* ── One-row rail: credit packages (enlarged) ── */}
        {hasProducts && (
          <div className="mb-10">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Coins className="w-4 h-4 text-yellow-400" />
              {t('wallet.creditPacks')}
            </h2>
            {/* First top-up double credits campaign */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-yellow-500/35 bg-gradient-to-r from-yellow-500/15 via-amber-500/10 to-yellow-500/5 px-4 py-3">
              <div className="h-9 w-9 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5 text-yellow-300" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-yellow-200">
                  {t('wallet.firstTopUpPromo')}
                </p>
                <p className="text-[11px] text-yellow-100/60 mt-0.5">
                  {t('wallet.firstTopUpDesc')}
                </p>
              </div>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory [scrollbar-width:thin]">
              {/* Credit packages */}
              {packages.map((pkg) => {
                const busy = buying === pkg.id;
                const totalTokens = pkg.token_count + (pkg.bonus_tokens || 0);
                return (
                  <div
                    key={pkg.id}
                    className="group relative shrink-0 w-[220px] sm:w-[260px] snap-start rounded-2xl overflow-hidden border border-yellow-500/25 bg-gray-900/80 shadow-lg hover:border-yellow-400/50 hover:shadow-yellow-500/15 transition-all hover:-translate-y-0.5"
                  >
                    <div className="relative aspect-[3/4] bg-black/40">
                      {pkg.video_url ? (
                        <video src={pkg.video_url} poster={pkg.image_url || undefined} muted loop playsInline autoPlay preload="metadata" className="h-full w-full object-cover" />
                      ) : pkg.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pkg.image_url} alt={pkg.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-yellow-500/15 to-amber-600/5">
                          <Coins className="w-12 h-12 text-yellow-400/60" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10 pointer-events-none" />
                      {pkg.video_url && (
                        <Film className="absolute top-2 left-2 h-5 w-5 rounded bg-black/60 p-0.5 text-slate-300" />
                      )}
                      {pkg.bonus_tokens > 0 && (
                        <span className="absolute top-2 right-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                          +{pkg.bonus_tokens} {t('common.bonus')}
                        </span>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-none">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xl font-bold text-white">{pkg.token_count.toLocaleString()}</span>
                          <span className="text-[11px] text-yellow-200/70">{t('common.credits')}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {t('wallet.totalTokens', { total: totalTokens.toLocaleString() })}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => void handleBuyPackage(pkg)}
                      disabled={busy}
                      className="w-full flex items-center justify-center gap-1.5 h-11 text-sm font-bold text-white bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] hover:from-[#ff4d92] hover:to-[#a78bfa] disabled:opacity-50 transition-all"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      ${(pkg.price_cents / 100).toFixed(2)}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-600 mt-1 text-center">
              ₮ USDT · TRC-20 · {t('wallet.securePayment')}
            </p>
          </div>
        )}

        {/* ── Main grid: transactions (left) / costs (right) ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Left column: transaction history */}
          <div className="lg:col-span-8">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
              {t('wallet.transactionHistory')}
            </h2>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
            ) : (
              <div className="space-y-2">
                {data?.transactions?.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    {t('wallet.noTransactions')}
                  </p>
                )}
                {data?.transactions?.map((tx) => {
                  const meta = REASON_META[tx.reason] || { label: tx.reason, icon: Coins, color: "text-gray-400" };
                  const Icon = meta.icon;
                  return (
                    <div key={tx.id} className="flex items-center gap-3 rounded-xl bg-gray-900/60 border border-gray-800/50 px-4 py-3">
                      <Icon className={cn("w-5 h-5 shrink-0", meta.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 truncate">{meta.label}</p>
                        <p className="text-xs text-gray-500">{new Date(tx.created_at).toLocaleString()}{tx.ref_id ? " · " + tx.ref_id : ""}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-sm font-semibold", tx.delta > 0 ? "text-emerald-400" : "text-rose-400")}>
                          {tx.delta > 0 ? "+" : ""}{tx.delta}
                        </p>
                        <p className="text-xs text-gray-600">bal: {tx.balance_after}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-6">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg bg-gray-800 text-sm disabled:opacity-40 hover:bg-gray-700 transition">{t('common.prev')}</button>
                <span className="text-sm text-gray-400">{page} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg bg-gray-800 text-sm disabled:opacity-40 hover:bg-gray-700 transition">{t('common.next')}</button>
              </div>
            )}
          </div>

          {/* Right column: credit costs reference */}
          <div className="lg:col-span-4">
            <div className="rounded-xl bg-gray-900/40 border border-gray-800/50 p-5 lg:sticky lg:top-20">
              <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                {t('wallet.creditCosts')}
              </h3>
              <div className="space-y-3">
                {costItems.map((item) => {
                  const Icon = item.icon;
                  const isText = Number.isNaN(parseInt(item.value, 10));
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-gray-800/80 flex items-center justify-center shrink-0">
                        <Icon className={cn("w-4 h-4", item.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300">{item.label}</p>
                        {item.sub && <p className="text-[10px] text-gray-500">{item.sub}</p>}
                      </div>
                      <span className={cn("text-sm font-semibold shrink-0", item.color)}>
                        {isText ? item.value : `${item.value} ${t('common.credits')}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-800/60 text-[11px] text-gray-500 leading-relaxed">
                <p>
                  {t('wallet.exchangeRate', { credits: CREDIT_EXCHANGE.credits, usd: (CREDIT_EXCHANGE.usd_cents / 100).toFixed(2) })}
                </p>
                <p className="mt-1">
                  {t('wallet.refundNote')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* USDT Payment Dialog */}
      {cryptoDialog?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setCryptoDialog(null)}>
          <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            {cryptoDialog.step === 'pay' && (
              <>
                <h3 className="text-lg font-bold flex items-center gap-2 mb-2">
                  <Coins className="w-5 h-5 text-yellow-400" />
                  {t('wallet.sendUsdt')}
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  {t('wallet.sendUsdtDesc', { amount: cryptoDialog.amountUsd.toFixed(2) })}
                </p>
                <div className="space-y-4">
                  {/* QR Code for scanning */}
                  <div className="flex justify-center">
                    <div className="p-3 bg-white rounded-xl">
                      <QRCode value={cryptoDialog.walletAddress} size={160} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t('wallet.depositAddress')}</label>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-black/40 border border-gray-800">
                      <code className="flex-1 text-xs break-all font-mono text-yellow-300">{cryptoDialog.walletAddress}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(cryptoDialog.walletAddress); toast.success(t('common.copied')); }}
                        className="shrink-0 text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800"
                      >
                        {t('common.copy')}
                      </button>
                    </div>
                    <p className="text-[10px] text-amber-400 mt-1">⚠ {t('wallet.usdtOnly', { network: cryptoDialog.network })}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t('wallet.txHash')}</label>
                    <input
                      type="text"
                      placeholder="TRC-20 tx hash..."
                      value={cryptoDialog.txHash}
                      onChange={(e) => setCryptoDialog({ ...cryptoDialog, txHash: e.target.value })}
                      className="w-full rounded-lg border border-gray-800 bg-black/40 px-3 py-2 text-sm font-mono text-white placeholder:text-gray-600 focus:border-yellow-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setCryptoDialog(null)} className="flex-1 h-10 rounded-lg border border-gray-700 text-sm text-gray-400 hover:bg-gray-800">{t('common.cancel')}</button>
                  <button
                    onClick={handleSubmitCryptoPayment}
                    disabled={!cryptoDialog.txHash?.trim() || cryptoDialog.txHash.trim().length < 10}
                    className="flex-1 h-10 rounded-lg bg-gradient-to-r from-yellow-500 to-amber-600 text-sm font-bold text-black disabled:opacity-40"
                  >
                    {t('wallet.submitPayment')}
                  </button>
                </div>
              </>
            )}
            {cryptoDialog.step === 'submitting' && (
              <div className="py-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-yellow-400 mx-auto mb-3" />
                <p className="text-gray-400">{t('wallet.verifyingPayment')}</p>
              </div>
            )}
            {cryptoDialog.step === 'done' && (
              <>
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-bold text-emerald-400">{t('wallet.paymentSubmitted')}</h3>
                  <p className="text-sm text-gray-400 mt-1">{t('wallet.paymentSubmittedDesc')}</p>
                </div>
                <button
                  onClick={() => setCryptoDialog(null)}
                  className="w-full h-10 rounded-lg bg-gray-800 text-sm font-medium hover:bg-gray-700"
                >
                  {t('common.done')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
