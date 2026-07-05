/**
 * 虚拟商城 v2 — 主页面
 * /shop-v2
 *
 * 风格：继承 DESIGN.md 的深色 + 粉色高亮，玻璃卡片
 * 功能：商品列表（按 category 筛选）、购买按钮、积分余额显示
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { authedFetch } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n/context';
import { Sparkles, Tag, Coins, ShoppingBag, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/lib/logger';

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price_credits: number;
  price_cents: number;
  compare_at_price_cents: number | null;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  is_featured: boolean;
  is_new: boolean;
  preview_url: string;
  product: { name: string };
  sales_count: number;
}

const RARITY_COLORS: Record<string, string> = {
  common: 'from-slate-400 to-slate-600',
  rare: 'from-blue-400 to-blue-600',
  epic: 'from-purple-400 to-pink-600',
  legendary: 'from-amber-300 to-orange-500',
};

const RARITY_BG: Record<string, string> = {
  common: 'bg-slate-500/20 text-slate-300',
  rare: 'bg-blue-500/20 text-blue-300',
  epic: 'bg-purple-500/20 text-purple-300',
  legendary: 'bg-amber-500/20 text-amber-300',
};

const CATEGORIES = [
  { id: 'all', label: 'All', emoji: '✨' },
  { id: 'outfit', label: 'Outfits', emoji: '👗' },
  { id: 'voice_pack', label: 'Voices', emoji: '🎙️' },
  { id: 'effect', label: 'Effects', emoji: '💫' },
  { id: 'background', label: 'Backgrounds', emoji: '🌆' },
  { id: 'consumable', label: 'Consumables', emoji: '🎁' },
];

export default function ShopV2Page() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [balance, setBalance] = useState(0);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadBalance = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/shop/v2/credits');
      const data = await res.json();
      setBalance(data.balance || 0);
    } catch (e) {
      logger.error('load balance failed', { data: e });
    }
  }, [user]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      params.set('limit', '60');

      const res = await authedFetch(`/api/shop/v2/products?${params.toString()}`);
      const data = await res.json();
      setProducts(data.products || []);
    } catch (e) {
      logger.error('load products failed', { data: e });
      showToast('error', 'Failed to load shop');
    } finally {
      setLoading(false);
    }
  }, [category, showToast]);

  useEffect(() => {
    if (user) {
      loadProducts();
      loadBalance();
    }
  }, [user, loadProducts, loadBalance]);

  const handlePurchase = async (product: Product) => {
    if (balance < product.price_credits) {
      showToast('error', `Not enough credits. Need ${product.price_credits}, have ${balance}.`);
      return;
    }

    if (!confirm(`Purchase "${product.name}" for ${product.price_credits} credits?`)) return;

    setPurchasing(product.id);
    try {
      const res = await authedFetch('/api/shop/v2/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, quantity: 1 }),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast('error', data.error || 'Purchase failed');
        return;
      }

      showToast('success', `✨ ${product.name} added to your inventory!`);
      setBalance(data.new_credits_balance);
      // 可选：刷新商品列表看销量
    } catch (e) {
      showToast('error', 'Network error');
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#07070F] via-[#0a0a18] to-[#07070F] px-4 py-8 sm:px-6 lg:px-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-2xl ${
            toast.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}
        >
          {toast.type === 'success' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          <span className="text-sm font-medium">{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight sm:text-4xl">
              <ShoppingBag className="h-7 w-7 text-[#FF2D78]" />
              <span className="bg-gradient-to-br from-white via-[#FF6BA6] to-[#FF2D78] bg-clip-text text-transparent">
                Item Shop
              </span>
            </h1>
            <p className="mt-2 text-sm text-[#8B8BA3]">
              Outfits, voices, effects & more for your companions
            </p>
          </div>

          {/* 余额卡 */}
          <div className="flex items-center gap-3 rounded-2xl border border-[#FF2D78]/30 bg-gradient-to-br from-[#FF2D78]/10 to-[#C026D3]/10 px-5 py-3 backdrop-blur-xl">
            <Coins className="h-6 w-6 text-[#FF6BA6]" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#8B8BA3]">Your Credits</div>
              <div className="font-mono text-2xl font-bold tabular-nums text-[#FF2D78]">
                {balance.toLocaleString()}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="ml-2 border-[#FF2D78]/40 text-[#FF2D78] hover:bg-[#FF2D78]/10"
              onClick={() => alert('Redirect to credits purchase page')}
            >
              + Top Up
            </Button>
          </div>
        </div>

        {/* Category Filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                category === c.id
                  ? 'border-[#FF2D78] bg-[#FF2D78]/15 text-white shadow-[0_0_15px_rgba(255,45,120,0.3)]'
                  : 'border-white/10 bg-white/[0.04] text-[#8B8BA3] hover:border-white/20 hover:text-white'
              }`}
            >
              <span className="text-base">{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-12 text-center backdrop-blur-2xl">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-[#8B8BA3]" />
            <p className="text-lg font-medium">No products in this category yet</p>
            <p className="mt-2 text-sm text-[#8B8BA3]">Check back soon for new items!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                purchasing={purchasing === p.id}
                canAfford={balance >= p.price_credits}
                onPurchase={() => handlePurchase(p)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({
  product,
  purchasing,
  canAfford,
  onPurchase,
}: {
  product: Product;
  purchasing: boolean;
  canAfford: boolean;
  onPurchase: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl transition-all hover:-translate-y-1 hover:border-white/[0.16] hover:shadow-[0_8px_30px_rgba(255,45,120,0.15)]">
      {/* Rarity glow */}
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${RARITY_COLORS[product.rarity] || RARITY_COLORS.common}`}
      />

      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-[#FF2D78]/5 to-[#C026D3]/5">
        {product.preview_url ? (
          <img
            src={product.preview_url}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Sparkles className="h-12 w-12 text-[#8B8BA3]/50" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {product.is_featured && (
            <Badge className="border-none bg-[#FF2D78] px-2 py-0.5 text-[10px] text-white shadow-[0_0_10px_rgba(255,45,120,0.5)]">
              <Sparkles className="mr-1 inline h-3 w-3" /> Featured
            </Badge>
          )}
          {product.is_new && (
            <Badge className="border-none bg-emerald-500 px-2 py-0.5 text-[10px] text-white">NEW</Badge>
          )}
        </div>

        <div className="absolute right-2 top-2">
          <Badge className={`border-none px-2 py-0.5 text-[10px] uppercase ${RARITY_BG[product.rarity]}`}>
            {product.rarity}
          </Badge>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="truncate text-sm font-semibold text-white" title={product.name}>
          {product.name}
        </h3>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-[11px] text-[#8B8BA3]">{product.description}</p>
        )}

        {/* Price + Buy */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 font-mono text-sm font-bold text-[#FF2D78]">
            <Coins className="h-3.5 w-3.5" />
            {product.price_credits.toLocaleString()}
          </div>
          <Button
            size="sm"
            onClick={onPurchase}
            disabled={!canAfford || purchasing}
            className={`h-8 rounded-full px-3 text-xs font-semibold ${
              canAfford
                ? 'bg-gradient-to-br from-[#FF2D78] to-[#C026D3] text-white shadow-[0_0_15px_rgba(255,45,120,0.3)] hover:shadow-[0_0_20px_rgba(255,45,120,0.5)]'
                : 'bg-white/[0.06] text-[#8B8BA3]'
            }`}
          >
            {purchasing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : canAfford ? (
              <>
                <Tag className="mr-1 h-3 w-3" /> Buy
              </>
            ) : (
              'No credits'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
