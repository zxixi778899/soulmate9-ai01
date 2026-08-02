"use client";

import { useState, useEffect, useCallback } from "react";
import { authedFetch } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n/context";
import { Coins, TrendingUp, TrendingDown, CalendarCheck, MessageCircle, Image, Video, Gift, ShoppingBag, Zap, Loader2, CreditCard, ShieldCheck, Film } from "lucide-react";
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

const REASON_META: Record<string, { label: string; icon: typeof Coins; color: string }> = {
  daily_checkin: { label: "Daily Check-in", icon: CalendarCheck, color: "text-emerald-400" },
  chat_extra: { label: "Extra Chat Message", icon: MessageCircle, color: "text-sky-400" },
  image_gen_extra: { label: "Image Generation", icon: Image, color: "text-purple-400" },
  video_gen: { label: "Video Generation", icon: Video, color: "text-rose-400" },
  tts_extra: { label: "Voice Message", icon: Zap, color: "text-amber-400" },
  gift_send: { label: "Gift Sent", icon: Gift, color: "text-pink-400" },
  shop_purchase: { label: "Shop Purchase", icon: ShoppingBag, color: "text-orange-400" },
  token_purchase: { label: "Credits Purchase", icon: Coins, color: "text-yellow-400" },
  signup_bonus: { label: "Welcome Bonus", icon: Coins, color: "text-yellow-400" },
  admin_grant: { label: "Admin Grant", icon: Coins, color: "text-gray-400" },
  refund: { label: "Refund", icon: Coins, color: "text-emerald-400" },
  achievement: { label: "Achievement", icon: Zap, color: "text-amber-400" },
};

const RARITY_STYLES: Record<string, { border: string; glow: string }> = {
  common: { border: "border-gray-600/50", glow: "" },
  rare: { border: "border-blue-500/50", glow: "shadow-blue-500/10" },
  epic: { border: "border-purple-500/50", glow: "shadow-purple-500/10" },
  legendary: { border: "border-amber-500/50", glow: "shadow-amber-500/10" },
};

export default function WalletPage() {
  const { locale } = useTranslation();
  const zh = locale === "zh";
  const [data, setData] = useState<HistoryData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [buying, setBuying] = useState<string | null>(null);

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

  const handleBuy = useCallback(async (pkg: TokenPackage) => {
    setBuying(pkg.id);
    try {
      const res = await authedFetch("/api/v2/shop/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: pkg.id, provider: "stripe" }),
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else if (result.error) {
        toast.error(result.error);
      } else {
        toast.error(zh ? "创建订单失败" : "Failed to create checkout");
      }
    } catch {
      toast.error(zh ? "网络错误" : "Network error");
    }
    setBuying(null);
  }, [zh]);

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  // Accurate credit costs — single source of truth from credit-system.ts
  const giftValues = Object.values(GIFT_CREDIT_COSTS);
  const giftMin = Math.min(...giftValues);
  const giftMax = Math.max(...giftValues);

  const costItems: Array<{ icon: typeof Coins; color: string; label: string; value: string; sub?: string }> = [
    {
      icon: Image,
      color: "text-purple-400",
      label: zh ? "AI 生图" : "Image Gen",
      value: `${CREDIT_COSTS.image_gen}`,
      sub: zh ? `高清 ${CREDIT_COSTS.image_gen_hd}` : `HD ${CREDIT_COSTS.image_gen_hd}`,
    },
    {
      icon: Video,
      color: "text-rose-400",
      label: zh ? "AI 视频" : "Video Gen",
      value: `${CREDIT_COSTS.video_5s}`,
      sub: zh ? `10 秒 ${CREDIT_COSTS.video_10s}` : `10s ${CREDIT_COSTS.video_10s}`,
    },
    {
      icon: Zap,
      color: "text-amber-400",
      label: zh ? "语音消息" : "Voice / TTS",
      value: `${CREDIT_COSTS.tts}`,
    },
    {
      icon: Gift,
      color: "text-pink-400",
      label: zh ? "礼物" : "Gifts",
      value: `${giftMin}~${giftMax}`,
    },
    {
      icon: MessageCircle,
      color: "text-sky-400",
      label: zh ? "文字聊天" : "Text Chat",
      value: zh ? "订阅包含" : "Included",
      sub: zh ? "不额外扣积分" : "No extra credits",
    },
    {
      icon: CalendarCheck,
      color: "text-emerald-400",
      label: zh ? "每日签到" : "Daily Check-in",
      value: `+${DAILY_CHECKIN_REWARD}`,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Coins className="w-6 h-6 text-yellow-400" />
          {zh ? "我的积分" : "My Credits"}
        </h1>

        {/* ── Top row: balance + today stats ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 mb-6">
          {/* Balance card */}
          <div className="lg:col-span-4 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 p-5 flex flex-col justify-center">
            <p className="text-sm text-yellow-200/70 mb-1">{zh ? "当前余额" : "Current Balance"}</p>
            <p className="text-4xl font-bold text-yellow-300">{data?.balance ?? "..."}</p>
            <p className="text-xs text-yellow-200/50 mt-2">
              {CREDIT_EXCHANGE.credits} {zh ? "积分" : "credits"} = ${(CREDIT_EXCHANGE.usd_cents / 100).toFixed(2)}
            </p>
          </div>

          {/* Today stats */}
          <div className="lg:col-span-8 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 flex flex-col items-center justify-center text-center">
              <TrendingUp className="w-5 h-5 text-emerald-400 mb-1.5" />
              <p className="text-2xl font-semibold text-emerald-400">+{data?.today?.earned ?? 0}</p>
              <p className="text-xs text-gray-500 mt-0.5">{zh ? "今日获得" : "Earned Today"}</p>
            </div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 flex flex-col items-center justify-center text-center">
              <TrendingDown className="w-5 h-5 text-rose-400 mb-1.5" />
              <p className="text-2xl font-semibold text-rose-400">-{data?.today?.spent ?? 0}</p>
              <p className="text-xs text-gray-500 mt-0.5">{zh ? "今日消耗" : "Spent Today"}</p>
            </div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 flex flex-col items-center justify-center text-center">
              <Coins className="w-5 h-5 text-yellow-400 mb-1.5" />
              <p className={cn("text-2xl font-semibold", (data?.today?.net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {(data?.today?.net ?? 0) >= 0 ? "+" : ""}{data?.today?.net ?? 0}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{zh ? "今日净收" : "Net Today"}</p>
            </div>
          </div>
        </div>

        {/* ── Main grid: packages + transactions (left) / costs (right) ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Left column */}
          <div className="lg:col-span-8 space-y-6">
            {/* Credit Packages */}
            {packages.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {zh ? "购买积分" : "Buy Credits"}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {packages.map((pkg) => {
                    const rarity = pkg.price_cents >= 6000 ? "epic" : pkg.price_cents >= 3000 ? "rare" : "common";
                    const style = RARITY_STYLES[rarity] || RARITY_STYLES.common;
                    const totalTokens = pkg.token_count + (pkg.bonus_tokens || 0);
                    return (
                      <div
                        key={pkg.id}
                        className={cn(
                          "relative rounded-xl border bg-gray-900/80 overflow-hidden shadow-lg transition-all hover:scale-[1.01]",
                          style.border,
                          style.glow,
                        )}
                      >
                        {/* Showcase media from backend */}
                        <div className="relative aspect-[16/9] bg-black/40">
                          {pkg.video_url ? (
                            <video
                              src={pkg.video_url}
                              poster={pkg.image_url || undefined}
                              muted
                              loop
                              playsInline
                              autoPlay
                              preload="metadata"
                              className="h-full w-full object-cover"
                            />
                          ) : pkg.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={pkg.image_url} alt={pkg.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center bg-gradient-to-br from-yellow-500/10 to-amber-600/5">
                              <Coins className="w-12 h-12 text-yellow-400/60" />
                            </div>
                          )}
                          {pkg.video_url && (
                            <Film className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded bg-black/60 p-0.5 text-slate-300" />
                          )}
                          {pkg.bonus_tokens > 0 && (
                            <span className="absolute top-2 right-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                              +{pkg.bonus_tokens} {zh ? "奖励" : "bonus"}
                            </span>
                          )}
                        </div>
                        {/* Body */}
                        <div className="p-4 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xl font-bold text-white">{pkg.token_count.toLocaleString()}</span>
                              <span className="text-xs text-gray-400">{zh ? "积分" : "credits"}</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {zh ? `共 ${totalTokens.toLocaleString()} 积分` : `${totalTokens.toLocaleString()} total`}
                            </div>
                          </div>
                          <button
                            onClick={() => void handleBuy(pkg)}
                            disabled={buying === pkg.id}
                            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white text-sm font-semibold hover:from-[#ff4d92] hover:to-[#a78bfa] transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-[#FF2D78]/20"
                          >
                            {buying === pkg.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-4 h-4" />
                            )}
                            ${(pkg.price_cents / 100).toFixed(2)}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-600 mt-2 text-center">
                  {zh ? "通过 Stripe 安全支付，积分即时到账" : "Secure payment via Stripe, credits delivered instantly"}
                </p>
              </div>
            )}

            {/* Transaction history */}
            <div>
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
                {zh ? "交易记录" : "Transaction History"}
              </h2>

              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
              ) : (
                <div className="space-y-2">
                  {data?.transactions?.length === 0 && (
                    <p className="text-center text-gray-500 py-8">
                      {zh ? "暂无交易记录，每日签到可获得积分" : "No transactions yet. Check in daily to earn credits!"}
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
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg bg-gray-800 text-sm disabled:opacity-40 hover:bg-gray-700 transition">Prev</button>
                  <span className="text-sm text-gray-400">{page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg bg-gray-800 text-sm disabled:opacity-40 hover:bg-gray-700 transition">Next</button>
                </div>
              )}
            </div>
          </div>

          {/* Right column: credit costs reference */}
          <div className="lg:col-span-4">
            <div className="rounded-xl bg-gray-900/40 border border-gray-800/50 p-5 lg:sticky lg:top-20">
              <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                {zh ? "积分消耗明细" : "Credit Costs"}
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
                        {isText ? item.value : `${item.value} ${zh ? "积分" : "credits"}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-800/60 text-[11px] text-gray-500 leading-relaxed">
                <p>
                  {zh
                    ? `汇率：${CREDIT_EXCHANGE.credits} 积分 = $${(CREDIT_EXCHANGE.usd_cents / 100).toFixed(2)}`
                    : `Rate: ${CREDIT_EXCHANGE.credits} credits = $${(CREDIT_EXCHANGE.usd_cents / 100).toFixed(2)}`}
                </p>
                <p className="mt-1">
                  {zh ? "生成失败 / 超时会自动退回积分。" : "Failed or timed-out generations are auto-refunded."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
