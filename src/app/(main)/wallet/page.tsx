"use client";

import { useState, useEffect, useCallback } from "react";
import { authedFetch } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n/context";
import { Coins, TrendingUp, TrendingDown, CalendarCheck, MessageCircle, Image, Video, Gift, ShoppingBag, Zap, Loader2, CreditCard, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Transaction = { id: number; delta: number; reason: string; ref_id: string | null; balance_after: number; created_at: string; };
type HistoryData = { transactions: Transaction[]; total: number; page: number; limit: number; balance: number; today: { earned: number; spent: number; net: number }; };
type TokenPackage = { id: string; name: string; token_count: number; bonus_tokens: number; price_cents: number; sort_order: number; is_active: boolean; };

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

const RARITY_STYLES: Record<string, { border: string; glow: string; badge: string }> = {
  common: { border: "border-gray-600/50", glow: "", badge: "bg-gray-600/30 text-gray-300" },
  rare: { border: "border-blue-500/50", glow: "shadow-blue-500/10", badge: "bg-blue-500/20 text-blue-300" },
  epic: { border: "border-purple-500/50", glow: "shadow-purple-500/10", badge: "bg-purple-500/20 text-purple-300" },
  legendary: { border: "border-amber-500/50", glow: "shadow-amber-500/10", badge: "bg-amber-500/20 text-amber-300" },
};

export default function WalletPage() {
  const { t, locale } = useTranslation();
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

  // Fetch credit packages from backend
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
        toast.error(locale === "zh" ? "创建订单失败" : "Failed to create checkout");
      }
    } catch {
      toast.error(locale === "zh" ? "网络错误" : "Network error");
    }
    setBuying(null);
  }, [locale]);

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Coins className="w-6 h-6 text-yellow-400" />
        {locale === "zh" ? "我的积分" : "My Credits"}
      </h1>

      {/* Balance card */}
      <div className="rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 p-5 mb-4">
        <p className="text-sm text-yellow-200/70 mb-1">{locale === "zh" ? "当前余额" : "Current Balance"}</p>
        <p className="text-4xl font-bold text-yellow-300">{data?.balance ?? "..."}</p>
        <p className="text-xs text-yellow-200/50 mt-1">1000 credits = $9.90</p>
      </div>

      {/* ── Credit Packages (purchase section) ── */}
      {packages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            {locale === "zh" ? "购买积分" : "Buy Credits"}
          </h2>
          <div className="grid grid-cols-1 gap-3">
            {packages.map((pkg) => {
              const rarity = pkg.price_cents >= 6000 ? "epic" : pkg.price_cents >= 3000 ? "rare" : "common";
              const style = RARITY_STYLES[rarity] || RARITY_STYLES.common;
              const totalTokens = pkg.token_count + (pkg.bonus_tokens || 0);
              return (
                <div
                  key={pkg.id}
                  className={cn(
                    "relative rounded-xl border bg-gray-900/80 p-4 flex items-center gap-4 shadow-lg transition-all hover:scale-[1.01]",
                    style.border,
                    style.glow,
                  )}
                >
                  {/* Token icon */}
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-yellow-500/30 to-amber-600/20 border border-yellow-500/30 flex items-center justify-center shrink-0">
                    <Coins className="w-6 h-6 text-yellow-400" />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{pkg.token_count.toLocaleString()}</span>
                      <span className="text-xs text-gray-400">{locale === "zh" ? "积分" : "credits"}</span>
                      {pkg.bonus_tokens > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                          +{pkg.bonus_tokens} bonus
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {locale === "zh" ? `共 ${totalTokens.toLocaleString()} 积分` : `${totalTokens.toLocaleString()} total`}
                    </div>
                  </div>
                  {/* Price + Buy */}
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
              );
            })}
          </div>
          <p className="text-[10px] text-gray-600 mt-2 text-center">
            {locale === "zh" ? "通过 Stripe 安全支付，积分即时到账" : "Secure payment via Stripe, credits delivered instantly"}
          </p>
        </div>
      )}

      {/* Today stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 text-center">
          <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-emerald-400">+{data?.today?.earned ?? 0}</p>
          <p className="text-xs text-gray-500">{locale === "zh" ? "今日获得" : "Earned Today"}</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 text-center">
          <TrendingDown className="w-4 h-4 text-rose-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-rose-400">-{data?.today?.spent ?? 0}</p>
          <p className="text-xs text-gray-500">{locale === "zh" ? "今日消耗" : "Spent Today"}</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 text-center">
          <Coins className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <p className={cn("text-lg font-semibold", (data?.today?.net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {(data?.today?.net ?? 0) >= 0 ? "+" : ""}{data?.today?.net ?? 0}
          </p>
          <p className="text-xs text-gray-500">{locale === "zh" ? "今日净收" : "Net Today"}</p>
        </div>
      </div>

      {/* Transaction history */}
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
        {locale === "zh" ? "交易记录" : "Transaction History"}
      </h2>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : (
        <div className="space-y-2">
          {data?.transactions?.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              {locale === "zh" ? "暂无交易记录，每日签到可获得积分" : "No transactions yet. Check in daily to earn credits!"}
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

      {/* Credit costs reference */}
      <div className="mt-8 rounded-xl bg-gray-900/40 border border-gray-800/50 p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">{locale === "zh" ? "积分消耗参考" : "Credit Costs"}</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <div className="flex justify-between"><span>{locale === "zh" ? "额外聊天" : "Extra Chat"}</span><span className="text-sky-400">2 credits</span></div>
          <div className="flex justify-between"><span>{locale === "zh" ? "AI 生图" : "Image Gen"}</span><span className="text-purple-400">20 credits</span></div>
          <div className="flex justify-between"><span>{locale === "zh" ? "AI 视频" : "Video Gen"}</span><span className="text-rose-400">100 credits</span></div>
          <div className="flex justify-between"><span>{locale === "zh" ? "语音消息" : "Voice/TTS"}</span><span className="text-amber-400">5 credits</span></div>
          <div className="flex justify-between"><span>{locale === "zh" ? "礼物" : "Gifts"}</span><span className="text-pink-400">5~500 credits</span></div>
          <div className="flex justify-between"><span>{locale === "zh" ? "每日签到" : "Daily Check-in"}</span><span className="text-emerald-400">+10 credits</span></div>
        </div>
      </div>
    </div>
  );
}
