"use client";

import { useState, useEffect, useCallback } from "react";
import { authedFetch } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n/context";
import { Coins, TrendingUp, TrendingDown, CalendarCheck, MessageCircle, Image, Video, Gift, ShoppingBag, Zap, Loader2, ShieldCheck, Film, Sparkles, Layers } from "lucide-react";
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
type CreationCardProduct = { id: string; name: string; price_credits: number; preview_url?: string; rarity?: string; virtual_meta?: Record<string, unknown> };

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

const RARITY_CHIP: Record<string, string> = {
  legendary: "bg-gradient-to-r from-[#ffd700] to-[#f59e0b] text-black",
  epic: "bg-gradient-to-r from-[#ff2e88] to-[#c026d3] text-white",
  rare: "bg-gradient-to-r from-[#00e5ff] to-[#3b82f6] text-black",
  common: "bg-white/15 text-white/80",
};

export default function WalletPage() {
  const { locale } = useTranslation();
  const zh = locale === "zh";
  const [data, setData] = useState<HistoryData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [cards, setCards] = useState<CreationCardProduct[]>([]);
  const [cardBalance, setCardBalance] = useState<number | null>(null);
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

  // Fetch companion creation cards + current card balance
  useEffect(() => {
    authedFetch("/api/shop/v2/products?limit=60")
      .then((r) => r.json())
      .then((d) => {
        const list = ((d.products || []) as Array<Record<string, unknown>>).filter(
          (p) =>
            p.subcategory === "creation_card" ||
            String((p.virtual_meta as Record<string, unknown> | null)?.kind || "") === "creation_card",
        ) as unknown as CreationCardProduct[];
        list.sort((a, b) => Number(a.virtual_meta?.card_amount || 1) - Number(b.virtual_meta?.card_amount || 1));
        setCards(list);
      })
      .catch(() => {});
    authedFetch("/api/creator/cards")
      .then((r) => r.json())
      .then((d) => { if (typeof d.cards === "number") setCardBalance(d.cards); })
      .catch(() => {});
  }, []);

  const refreshBalance = useCallback(() => {
    authedFetch("/api/credits/history?page=1&limit=20")
      .then((r) => r.json())
      .then((d) => setData(d as HistoryData))
      .catch(() => {});
  }, []);

  const handleBuyPackage = useCallback(async (pkg: TokenPackage) => {
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

  const handleBuyCard = useCallback(async (p: CreationCardProduct) => {
    if (buying) return;
    setBuying(p.id);
    try {
      const res = await authedFetch("/api/shop/v2/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: p.id }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(zh ? "购买成功，创建卡已到账" : "Purchase successful — cards added");
        authedFetch("/api/creator/cards")
          .then((r) => r.json())
          .then((s) => { if (typeof s.cards === "number") setCardBalance(s.cards); })
          .catch(() => {});
        refreshBalance();
      } else if (res.status === 402) {
        toast.error(zh ? "积分不足，请先充值" : "Insufficient credits");
      } else {
        toast.error((d as { error?: string }).error || (zh ? "购买失败" : "Purchase failed"));
      }
    } catch {
      toast.error(zh ? "网络错误" : "Network error");
    }
    setBuying(null);
  }, [buying, zh, refreshBalance]);

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  // Accurate credit costs — single source of truth from credit-system.ts
  const giftValues = Object.values(GIFT_CREDIT_COSTS);
  const giftMin = Math.min(...giftValues);
  const giftMax = Math.max(...giftValues);

  const costItems: Array<{ icon: typeof Coins; color: string; label: string; value: string; sub?: string }> = [
    { icon: Image, color: "text-purple-400", label: zh ? "AI 生图" : "Image Gen", value: `${CREDIT_COSTS.image_gen}`, sub: zh ? `高清 ${CREDIT_COSTS.image_gen_hd}` : `HD ${CREDIT_COSTS.image_gen_hd}` },
    { icon: Video, color: "text-rose-400", label: zh ? "AI 视频" : "Video Gen", value: `${CREDIT_COSTS.video_5s}`, sub: zh ? `10 秒 ${CREDIT_COSTS.video_10s}` : `10s ${CREDIT_COSTS.video_10s}` },
    { icon: Zap, color: "text-amber-400", label: zh ? "语音消息" : "Voice / TTS", value: `${CREDIT_COSTS.tts}` },
    { icon: Gift, color: "text-pink-400", label: zh ? "礼物" : "Gifts", value: `${giftMin}~${giftMax}` },
    { icon: MessageCircle, color: "text-sky-400", label: zh ? "文字聊天" : "Text Chat", value: zh ? "订阅包含" : "Included", sub: zh ? "不额外扣积分" : "No extra credits" },
    { icon: CalendarCheck, color: "text-emerald-400", label: zh ? "每日签到" : "Daily Check-in", value: `+${DAILY_CHECKIN_REWARD}` },
  ];

  const hasProducts = cards.length > 0 || packages.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Coins className="w-6 h-6 text-yellow-400" />
            {zh ? "我的积分" : "My Credits"}
          </h1>
          {cardBalance !== null && (
            <span className="text-xs text-cyan-300 flex items-center gap-1.5 bg-cyan-400/10 border border-cyan-400/25 rounded-full px-3 py-1.5">
              <Layers className="w-3.5 h-3.5" />
              {zh ? `创建卡 × ${cardBalance}` : `Creation cards × ${cardBalance}`}
            </span>
          )}
        </div>

        {/* ── Top row: balance + today stats ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 mb-8">
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
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <TrendingUp className="w-5 h-5 text-emerald-400 mb-1.5" />
              <p className="text-xl sm:text-2xl font-semibold text-emerald-400">+{data?.today?.earned ?? 0}</p>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{zh ? "今日获得" : "Earned Today"}</p>
            </div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <TrendingDown className="w-5 h-5 text-rose-400 mb-1.5" />
              <p className="text-xl sm:text-2xl font-semibold text-rose-400">-{data?.today?.spent ?? 0}</p>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{zh ? "今日消耗" : "Spent Today"}</p>
            </div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <Coins className="w-5 h-5 text-yellow-400 mb-1.5" />
              <p className={cn("text-xl sm:text-2xl font-semibold", (data?.today?.net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {(data?.today?.net ?? 0) >= 0 ? "+" : ""}{data?.today?.net ?? 0}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{zh ? "今日净收" : "Net Today"}</p>
            </div>
          </div>
        </div>

        {/* ── One-row rail: creation cards + credit packages (enlarged) ── */}
        {hasProducts && (
          <div className="mb-10">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-300" />
              {zh ? "创建卡 & 积分充值" : "Creation Cards & Credits"}
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory [scrollbar-width:thin]">
              {/* Companion creation cards */}
              {cards.map((p) => {
                const amount = Math.max(1, Number(p.virtual_meta?.card_amount || 1));
                const promoVideo = String(p.virtual_meta?.video_url || "");
                const busy = buying === p.id;
                const rarity = p.rarity || "common";
                return (
                  <div
                    key={p.id}
                    className="group relative shrink-0 w-[200px] sm:w-[232px] snap-start rounded-2xl overflow-hidden border border-cyan-400/25 bg-gray-900/80 shadow-lg hover:border-cyan-300/50 hover:shadow-cyan-500/15 transition-all hover:-translate-y-0.5"
                  >
                    <div className="relative aspect-[3/4] bg-black/40">
                      {p.preview_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.preview_url} alt={p.name} loading="lazy" className={cn("h-full w-full object-cover transition-transform duration-500", promoVideo ? "" : "group-hover:scale-105")} />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-cyan-500/25 to-purple-600/25">
                          <Sparkles className="w-10 h-10 text-white/40" />
                        </div>
                      )}
                      {promoVideo && (
                        <video
                          src={promoVideo}
                          muted loop playsInline preload="none"
                          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                          onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10 pointer-events-none" />
                      <span className={cn("absolute top-2 right-2 text-[9px] font-black tracking-wide px-1.5 py-0.5 rounded", RARITY_CHIP[rarity] || RARITY_CHIP.common)}>
                        {rarity.toUpperCase()}
                      </span>
                      <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-none">
                        <div className="text-sm font-bold truncate">{p.name}</div>
                        <div className="text-[11px] text-cyan-300 flex items-center gap-1 mt-0.5">
                          <Layers className="w-3 h-3" />
                          {zh ? "创建卡" : "Cards"} ×{amount}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => void handleBuyCard(p)}
                      disabled={busy}
                      className="w-full flex items-center justify-center gap-1.5 h-11 text-sm font-bold text-white bg-gradient-to-r from-cyan-500/85 to-blue-600/85 hover:from-cyan-500 hover:to-blue-600 disabled:opacity-50 transition-all"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                      {p.price_credits} {zh ? "积分" : "credits"}
                    </button>
                  </div>
                );
              })}

              {/* Credit packages */}
              {packages.map((pkg) => {
                const busy = buying === pkg.id;
                const totalTokens = pkg.token_count + (pkg.bonus_tokens || 0);
                return (
                  <div
                    key={pkg.id}
                    className="group relative shrink-0 w-[200px] sm:w-[232px] snap-start rounded-2xl overflow-hidden border border-yellow-500/25 bg-gray-900/80 shadow-lg hover:border-yellow-400/50 hover:shadow-yellow-500/15 transition-all hover:-translate-y-0.5"
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
                          +{pkg.bonus_tokens} {zh ? "奖励" : "bonus"}
                        </span>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-none">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xl font-bold text-white">{pkg.token_count.toLocaleString()}</span>
                          <span className="text-[11px] text-yellow-200/70">{zh ? "积分" : "credits"}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {zh ? `共 ${totalTokens.toLocaleString()}` : `${totalTokens.toLocaleString()} total`}
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
              {zh ? "创建卡用积分购买 · 积分包通过 Stripe 安全支付，即时到账" : "Cards buy with credits · Credit packs via Stripe, delivered instantly"}
            </p>
          </div>
        )}

        {/* ── Main grid: transactions (left) / costs (right) ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Left column: transaction history */}
          <div className="lg:col-span-8">
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
