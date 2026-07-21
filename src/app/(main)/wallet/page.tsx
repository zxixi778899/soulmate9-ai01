"use client";

import { useState, useEffect } from "react";
import { authedFetch } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n/context";
import { Coins, TrendingUp, TrendingDown, CalendarCheck, MessageCircle, Image, Video, Gift, ShoppingBag, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Transaction = { id: number; delta: number; reason: string; ref_id: string | null; balance_after: number; created_at: string; };
type HistoryData = { transactions: Transaction[]; total: number; page: number; limit: number; balance: number; today: { earned: number; spent: number; net: number }; };

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

export default function WalletPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<HistoryData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authedFetch(`/api/credits/history?page=${page}&limit=20`)
      .then((r) => r.json())
      .then((d) => setData(d as HistoryData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Coins className="w-6 h-6 text-yellow-400" />
        My Credits
      </h1>

      <div className="rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 p-5 mb-4">
        <p className="text-sm text-yellow-200/70 mb-1">Current Balance</p>
        <p className="text-4xl font-bold text-yellow-300">{data?.balance ?? "..."}</p>
        <p className="text-xs text-yellow-200/50 mt-1">1000 credits = $9.90</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 text-center">
          <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-emerald-400">+{data?.today?.earned ?? 0}</p>
          <p className="text-xs text-gray-500">Earned Today</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 text-center">
          <TrendingDown className="w-4 h-4 text-rose-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-rose-400">-{data?.today?.spent ?? 0}</p>
          <p className="text-xs text-gray-500">Spent Today</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 text-center">
          <Coins className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <p className={cn("text-lg font-semibold", (data?.today?.net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {(data?.today?.net ?? 0) >= 0 ? "+" : ""}{data?.today?.net ?? 0}
          </p>
          <p className="text-xs text-gray-500">Net Today</p>
        </div>
      </div>

      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Transaction History</h2>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : (
        <div className="space-y-2">
          {data?.transactions?.length === 0 && (
            <p className="text-center text-gray-500 py-8">No transactions yet. Check in daily to earn credits!</p>
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

      <div className="mt-8 rounded-xl bg-gray-900/40 border border-gray-800/50 p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Credit Costs</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <div className="flex justify-between"><span>Extra Chat</span><span className="text-sky-400">2 credits</span></div>
          <div className="flex justify-between"><span>Image Gen</span><span className="text-purple-400">20 credits</span></div>
          <div className="flex justify-between"><span>Video Gen</span><span className="text-rose-400">100 credits</span></div>
          <div className="flex justify-between"><span>Voice/TTS</span><span className="text-amber-400">5 credits</span></div>
          <div className="flex justify-between"><span>Gifts</span><span className="text-pink-400">5~500 credits</span></div>
          <div className="flex justify-between"><span>Daily Check-in</span><span className="text-emerald-400">+10 credits</span></div>
        </div>
      </div>
    </div>
  );
}
