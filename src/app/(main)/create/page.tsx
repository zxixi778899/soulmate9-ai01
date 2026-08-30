'use client';

/**
 * Character Creator v5 — 六步向导（风格 → 性别 → 种族/发型 → 身材/服装 → 人设 → 立绘）。
 *
 * Steps 风格/性别/种族发型/身材服装/人设：左侧档案卡预览 + 右侧分步选项面板；
 * Step 人设：身份档案 + 性格灵魂 + 声音；
 * Step 立绘：4 张高清 AI 立绘（2 写实 + 2 二次元），用户从 4 中选 1 完成。
 * On success a gacha-style reveal modal shows the rolled score / rarity.
 *
 * Rarity rule (site-wide, see src/lib/rarity.ts):
 *   score = round((desire + development + kink) / 3)
 *   70-79 → R · 80-89 → SR · 90-100 → SSR
 */

import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { readResponseJson, errorMessageFromUnknown } from '@/lib/safe-json';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { notifyDataChange } from '@/hooks/useDataSync';
import {
  ArrowLeft, ArrowRight, Wand2, Loader2, Sparkles, Check, User2,
  CreditCard, RefreshCw, ImagePlus, RotateCcw, Trash2, Settings,
  Plus, X, Coins,
} from 'lucide-react';
import { GameShell, GamePrimaryButton } from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';
import { OptimizedImg } from '@/components/OptimizedImg';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/types';

import { companionScore, type Rarity } from '@/lib/rarity';
import { CreateSuccessModal, type CreatedCompanionReveal } from '@/components/creator/CreateSuccessModal';

import { VOICE_TIMBRES } from '@/lib/voice-timbres';
import type { CharacterPart } from '@/lib/character-parts';

// ─── Integration: New components & store ────────────────────────────────────
import { useCreationStore } from '@/components/creator/useCreationStore';
import { ModelInfoCard } from '@/components/creator/ModelInfoCard';
import type { ModelMeta, ModelLoraInfo } from '@/components/creator/ModelInfoCard';
import { PromptEditor } from '@/components/creator/PromptEditor';
import { GenerationSettings } from '@/components/creator/GenerationSettings';
import { CharacterPresetCard } from '@/components/creator/CharacterPresetCard';

type CreateStep = 'style' | 'gender' | 'race_hair' | 'body_fashion' | 'identity' | 'portrait';
const CREATE_STEPS: CreateStep[] = ['style', 'gender', 'race_hair', 'body_fashion', 'identity', 'portrait'];

// ─── Types ───────────────────────────────────────────────────────────────────

interface OptionItem {
  id: string;
  category: string;
  value: string;
  label_en: string;
  label_zh: string;
  extra?: Record<string, string>;
  sort_order: number;
}

interface CardStatus {
  cards: number;
  monthlyQuota: number;
  tier: string;
  canCreate: boolean;
}

type SlotStatus = 'idle' | 'loading' | 'ready' | 'error';

interface PortraitSlot {
  status: SlotStatus;
  url?: string;
  jobId?: string;
  endpointId?: string;
  error?: string;
}

interface PortraitBatchResponse {
  success?: boolean;
  error?: string;
  // batch shape
  images?: string[];
  pending_jobs?: Array<{ job_id: string; endpoint_id?: string }>;
  // legacy single shape
  imageUrl?: string;
  portrait_url?: string;
  url?: string;
  cached?: boolean;
  pending?: boolean;
  job_id?: string;
  endpoint_id?: string;
}

const SLOT_COUNT = 4;
const EMPTY_SLOTS: PortraitSlot[] = Array.from({ length: SLOT_COUNT }, () => ({ status: 'idle' as const }));

/**
 * 立绘槽位动态生成进度：后端状态接口仅返回粗粒度状态（IN_PROGRESS/COMPLETED），
 * 这里按耗时驱动的渐进曲线模拟进度（起步快、后段慢，渐近逼近 96%），
 * 并分三阶段展示：排队 → AI 绘制 → 高清精修。
 */
function PortraitLoadingProgress({ label }: { label: string }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((p) => {
        const next = p + Math.max(0.2, (96 - p) * 0.03);
        return next >= 96 ? 96 : next;
      });
    }, 400);
    return () => clearInterval(timer);
  }, []);
  const pct = Math.round(progress);
  const phaseKey: TranslationKey =
    pct < 20 ? 'create.progressQueued' : pct < 82 ? 'create.progressDrawing' : 'create.progressEnhance';
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-2.5 overflow-hidden px-6">
      {/* shimmer sweep */}
      <motion.div
        className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
        animate={{ x: ['-100%', '300%'] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
      />
      <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]/60" />
      <span className="text-[10px] font-medium text-white/40">
        {label} · {t(phaseKey)} {pct}%
      </span>
      <div className="h-1 w-full max-w-[130px] overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Portrait card used in the dual-style preview grid */
function PortraitCard({
  slot, idx, selectedSlot, onSelectSlot, t,
}: {
  slot: PortraitSlot;
  idx: number;
  selectedSlot: number;
  onSelectSlot: (idx: number) => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <button
      type="button"
      disabled={slot.status !== 'ready'}
      onClick={() => onSelectSlot(idx)}
      className={cn(
        'group relative aspect-[3/4] overflow-hidden rounded-[22px] border text-left transition-all',
        slot.status === 'ready' && selectedSlot === idx
          ? 'border-[#FF2D78] ring-2 ring-[#FF2D78]/60 shadow-[0_0_28px_rgba(255,45,120,0.45)] scale-[1.02]'
          : slot.status === 'ready'
            ? 'border-white/15 hover:border-[#FF2D78]/50 hover:shadow-[0_0_18px_rgba(255,45,120,0.2)]'
            : 'border-white/[0.08] bg-white/[0.02]',
      )}
    >
      {slot.status === 'ready' && slot.url ? (
        <OptimizedImg
          src={slot.url}
          size="card"
          previewWidth={1024}
          previewQuality={78}
          alt={`portrait-${idx + 1}`}
          className="h-full w-full object-cover"
        />
      ) : slot.status === 'loading' ? (
        <PortraitLoadingProgress
          label={`Generating ${idx + 1}/4`}
        />
      ) : slot.status === 'error' ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
          <span className="text-[11px] text-red-400/80">{slot.error || (t('create.genFailed'))}</span>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImagePlus className="h-6 w-6 text-white/10" />
        </div>
      )}

      {slot.status === 'ready' && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="pointer-events-none absolute bottom-2 left-2.5 text-[10px] font-semibold text-white/70">
            {t('create.portraitN', { n: idx + 1 })}
          </div>
          {selectedSlot === idx && (
            <motion.div
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] shadow-[0_0_12px_rgba(255,45,120,0.6)]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            >
              <Check className="h-4 w-4 text-white" />
            </motion.div>
          )}
          {selectedSlot === idx && (
            <motion.div
              className="pointer-events-none absolute bottom-2 right-2.5 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] px-2 py-0.5 text-[9px] font-bold text-white shadow-[0_0_10px_rgba(255,45,120,0.5)]"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {t('create.setAsAvatarPortrait')}
            </motion.div>
          )}
        </>
      )}
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 风格 → LoRA 预览（与 auto-lora.ts / fluxScenarioPlan 的 SFW 组合保持一致，仅用于 UI 展示） */
const STYLE_LORA_PREVIEW: Record<string, string[]> = {
  realistic: ['flux_style_photoreal_v1', 'flux_detail_skin_v1'],
  anime: ['rdanimefluxv1rapid'],
};

/**
 * 性别差异化预选项：男性/女性的发型、身材集合不同（值与 creator_option_pool 种子一致）。
 * 跨性别展示并集（即不过滤）。
 */
const GENDER_OPTION_SETS: Record<string, Partial<Record<string, string[]>>> = {
  Female: {
    hair_style: ['Straight', 'Wavy', 'Curly', 'Bob', 'Pixie Cut', 'Long Flowing', 'Ponytail', 'Twin Tails', 'Braided'],
    body_type: ['Petite', 'Slim', 'Athletic', 'Curvy', 'Busty', 'Voluptuous', 'Tall'],
  },
  Male: {
    hair_style: ['Buzz Cut', 'Bald', 'Undercut', 'Textured Fringe', 'Slicked Back', 'Pompadour', 'Curly Top', 'Long Hair'],
    body_type: ['Balanced', 'Twink', 'Lean', 'Muscular', 'Stocky', 'Bodybuilder', 'Dad Bod', 'Bear'],
  },
};

/** 关系选项的性别倾向：切换性别时随动到对应默认值 */
const FEMALE_ONLY_RELATIONSHIPS = ['girlfriend', 'wife', 'maid', 'princess'];
const MALE_ONLY_RELATIONSHIPS = ['boyfriend', 'husband'];

interface CardProductItem {
  id: string;
  name: string;
  price_credits: number;
  cardAmount: number;
  rarity: string;
  imageUrl: string;
  videoUrl: string;
}

/** 卡包媒体：按视频原生比例渲染（竖排完整展示、无裁切、无黑框）；视频加载失败回退封面图 */
function CardMedia({
  imageUrl, videoUrl, name, rarity, cardAmount,
}: {
  imageUrl: string;
  videoUrl: string;
  name: string;
  rarity: string;
  cardAmount: number;
}) {
  const [videoFailed, setVideoFailed] = useState(false);
  const showVideo = !!videoUrl && !videoFailed;
  return (
    <div className="relative w-full overflow-hidden">
      {showVideo ? (
        <video
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={imageUrl || undefined}
          className="block h-auto w-full"
          onError={() => setVideoFailed(true)}
        />
      ) : imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- dynamic external storage URL */
        <img src={imageUrl} alt={name} loading="lazy" className="block h-auto w-full" />
      ) : (
        <div className="flex aspect-[9/16] w-full items-center justify-center bg-white/[0.04] text-2xl">💳</div>
      )}
      <span
        className={cn(
          'absolute bottom-1.5 right-1.5 rounded px-2 py-0.5 text-xs font-black',
          rarity === 'epic' && 'bg-gradient-to-br from-amber-300 to-yellow-500 text-amber-950',
          rarity === 'rare' && 'bg-violet-500 text-white',
          (rarity === 'common' || (rarity !== 'epic' && rarity !== 'rare')) && 'bg-[#FF2D78] text-white',
        )}
      >
        ×{cardAmount}
      </span>
    </div>
  );
}

/**
 * 创建卡购买弹窗：从商城商品（virtual_meta.kind='creation_card'）拉取卡包，
 * 用积分走 /api/shop/v2/purchase 原子购买（RPC 自动加 profiles.creation_cards）。
 */
function BuyCardsModal({
  open,
  onClose,
  onPurchased,
}: {
  open: boolean;
  onClose: () => void;
  onPurchased: () => void;
}) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<CardProductItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    Promise.all([
      fetch('/api/shop/v2/products?limit=60').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      authedFetch('/api/shop/v2/credits').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([prodData, creditsData]) => {
        const rows = ((prodData?.products ?? []) as Array<Record<string, unknown>>)
          .filter((p) => {
            const meta = (p.virtual_meta ?? {}) as Record<string, unknown>;
            return meta.kind === 'creation_card' && Number(meta.card_amount ?? 0) > 0;
          })
          .map((p) => {
            const meta = (p.virtual_meta ?? {}) as Record<string, unknown>;
            return {
              id: String(p.id ?? ''),
              name: String(p.name ?? ''),
              price_credits: Number(p.price_credits ?? 0),
              cardAmount: Number(meta.card_amount ?? 1),
              rarity: String(p.rarity ?? 'common'),
              imageUrl: String(p.preview_url ?? ''),
              videoUrl: String(meta.video_url ?? ''),
            };
          })
          .sort((a, b) => a.cardAmount - b.cardAmount);
        setProducts(rows);
        setBalance(Number((creditsData as { balance?: number } | null)?.balance ?? 0));
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleBuy = useCallback(async (product: CardProductItem) => {
    if (buyingId) return;
    setBuyingId(product.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await authedFetch('/api/shop/v2/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id }),
      });
      const data = await readResponseJson<{ success?: boolean; error?: string; new_credits_balance?: number }>(res);
      if (!res.ok || !data.success) {
        setError(res.status === 402 ? t('create.insufficientCredits') : (data.error || t('create.createFailed')));
        return;
      }
      if (typeof data.new_credits_balance === 'number') setBalance(data.new_credits_balance);
      setSuccess(t('create.cardsAdded', { n: product.cardAmount }));
      onPurchased();
    } catch (e) {
      setError(errorMessageFromUnknown(e, t('common.networkError')));
    } finally {
      setBuyingId(null);
    }
  }, [buyingId, onPurchased, t]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.09] bg-[#120a1a] shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] bg-gradient-to-r from-[#FF2D78]/10 to-[#8b5cf6]/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-[#FF2D78]" />
                <span className="text-sm font-bold text-white/90">{t('create.buyCards')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                  <Coins className="h-3 w-3" /> {t('create.creditsBalance', { n: balance })}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="max-h-[82vh] overflow-y-auto p-4">
              <p className="mb-3 text-[11px] text-white/40">{t('create.buyCardsDesc')}</p>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-7 w-7 animate-spin text-white/30" />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {products.map((p) => {
                    const affordable = balance >= p.price_credits;
                    return (
                      <div
                        key={p.id}
                        className="flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]"
                      >
                        {/* 竖排媒体区：视频原生比例完整展示，无黑框 */}
                        <CardMedia
                          imageUrl={p.imageUrl}
                          videoUrl={p.videoUrl}
                          name={p.name}
                          rarity={p.rarity}
                          cardAmount={p.cardAmount}
                        />
                        <div className="flex flex-1 flex-col justify-between gap-2 p-2.5">
                          <span className="truncate text-center text-sm font-semibold text-white/85">{p.name}</span>
                          <button
                            type="button"
                            disabled={buyingId !== null}
                            onClick={() => void handleBuy(p)}
                            className={cn(
                              'flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-all touch-manipulation',
                              affordable
                                ? 'bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white shadow-[0_0_14px_rgba(255,45,120,0.35)] hover:opacity-90'
                                : 'bg-white/[0.06] text-white/35',
                              buyingId !== null && 'opacity-50',
                            )}
                          >
                            {buyingId === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Coins className="h-3.5 w-3.5" />
                            )}
                            {t('create.buyFor', { n: p.price_credits })}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {products.length === 0 && !loading && (
                    <p className="col-span-full py-6 text-center text-xs text-white/30">{t('common.networkError')}</p>
                  )}
                </div>
              )}

              {success && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-center text-xs font-semibold text-emerald-300"
                >
                  {success}
                </motion.p>
              )}
              {error && (
                <p className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-center text-xs font-semibold text-red-300">
                  {error}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function getLabel(opt: OptionItem, locale: string): string {
  if (locale === 'zh' && opt.label_zh) return opt.label_zh;
  return opt.label_en;
}

function getExtra(opt: OptionItem, key: string, locale: string): string {
  if (!opt.extra) return '';
  const localeKey = `${key}_${locale}`;
  return opt.extra[localeKey] || opt.extra[`${key}_en`] || '';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 性别选项图标符号（第十二轮定稿：仅 女/男/跨性别 三项） */
const GENDER_SYMBOLS: Record<string, string> = {
  Female: '♀',
  Male: '♂',
  Transgender: '⚧',
};
const CANONICAL_GENDERS = ['Female', 'Male', 'Transgender'] as const;

/** 性别选项值 → gender-previews 存储键 */
const GENDER_PREVIEW_KEYOF: Record<string, string> = {
  Female: 'female',
  Male: 'male',
  Transgender: 'transgender',
};

/**
 * 管理员专属：卡片左上角 上传/删除(恢复默认) 小按钮组。
 * 仅 isAdmin 渲染；stopPropagation 避免触发卡片选择。
 */
function AdminCardButtons({
  busy,
  onUpload,
  onClear,
  clearTitle,
  clearIcon,
}: {
  busy: boolean;
  onUpload: () => void;
  onClear: () => void;
  clearTitle: string;
  clearIcon: 'reset' | 'trash';
}) {
  const { t } = useTranslation();
  return (
    <span
      className="absolute left-1.5 top-1.5 z-20 flex gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title={t('create.adminUploadImage')}
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); onUpload(); }}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm transition-colors hover:bg-[#FF2D78] hover:text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
      </button>
      <button
        type="button"
        title={clearTitle}
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); onClear(); }}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm transition-colors hover:bg-red-500/90 hover:text-white disabled:opacity-50"
      >
        {clearIcon === 'reset' ? <RotateCcw className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
      </button>
    </span>
  );
}

// ─── Small building blocks ───────────────────────────────────────────────────

function Pill({
  active, onClick, children, className,
}: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-medium border transition-all touch-manipulation',
        active
          ? 'bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white border-transparent shadow-[0_0_14px_rgba(255,45,120,0.35)]'
          : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:border-[#FF2D78]/40 hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.015] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white/90">
          <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-[#FF2D78] to-[#8b5cf6] shadow-[0_0_8px_rgba(255,45,120,0.6)]" />
          {title}
        </h3>
        {hint && <span className="text-[10px] text-white/30">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Dedicated style-demo artwork for the visual-style cards (static samples). */
const DEFAULT_STYLE_PREVIEWS: Record<string, string> = {
  realistic:
    'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/style-previews/realistic.png',
  anime:
    'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/style-previews/anime.png',
};

/** 内容级别 1-5 内置默认预览图（site_settings creator_nsfw_previews 可后台替换） */
const NSFW_LEVEL_PREVIEWS: Record<string, string> = {
  1: 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/nsfw-previews/level-1.png',
  2: 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/nsfw-previews/level-2.png',
  3: 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/nsfw-previews/level-3.png',
  4: 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/nsfw-previews/level-4.png',
  5: 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/nsfw-previews/level-5.png',
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CreatePage() {
  const router = useRouter();
  const { t, locale } = useTranslation();

  // ─── Integration: Zustand store for creation state ────────────────────────
  const {
    formData,
    modelMeta,
    loraInfo,
    positivePrompt,
    negativePrompt,
    basePrompt,
    generationSettings,
    updateSettings,
    updateNegativePrompt,
    isSettingsOpen,
    toggleSettings,
    closeSettings,
    setGenerationResult,
    saveDraftToLocalStorage,
    loadDraftFromLocalStorage,
  } = useCreationStore();

  // Load draft on mount
  useEffect(() => {
    loadDraftFromLocalStorage();
  }, [loadDraftFromLocalStorage]);

  // Auto-save drafts every 2 seconds (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveDraftToLocalStorage();
    }, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [formData, saveDraftToLocalStorage]);

  // Steps: 四步向导 风格 → 面部/身材 → 人设 → 立绘
  const [step, setStep] = useState<CreateStep>('style');
  /** 立绘内容级别：UI 已移除，固定默认 1（SFW）随生图请求提交 */
  const [nsfwLevel] = useState(1);

  // Data from backend
  const [options, setOptions] = useState<Record<string, OptionItem[]>>({});
  const [companions, setCompanions] = useState<Array<Record<string, unknown>>>([]);
  const [parts, setParts] = useState<Record<string, CharacterPart[]>>({});
  const [cardStatus, setCardStatus] = useState<CardStatus | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  // 创建卡购买弹窗（顶部「+」按钮触发）
  const [buyCardsOpen, setBuyCardsOpen] = useState(false);

  // 风格示例图可在后台「预设库管理」更换（site_settings creator_style_previews），缺省用内置默认图
  const [stylePreviews, setStylePreviews] = useState<Record<string, string>>(DEFAULT_STYLE_PREVIEWS);
  // 性别示例图（site_settings creator_gender_previews），空 = 符号占位，管理员可上传/删除
  const [genderPreviews, setGenderPreviews] = useState<Record<string, string>>({});
  // 预设卡示例图（种族/发型/体型/穿搭，site_settings creator_preset_previews），空 = emoji 占位，管理员可上传/删除
  const [presetPreviews, setPresetPreviews] = useState<Record<string, Record<string, string>>>({});
  // 内容级别示例图（site_settings creator_nsfw_previews），缺省用内置默认图，管理员可上传/恢复默认
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [nsfwPreviews, setNsfwPreviews] = useState<Record<string, string>>(NSFW_LEVEL_PREVIEWS);
  // 管理员身份探测：admin API 可访问 → 在创建页显示就地上传/删除入口
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const mergePatch = (
      set: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
      raw: unknown,
    ) => {
      const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const patchUrls: Record<string, string> = {};
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === 'string' && v.trim()) patchUrls[k] = v;
      }
      if (Object.keys(patchUrls).length) set((prev) => ({ ...prev, ...patchUrls }));
    };
    const mergePresetPatch = (raw: unknown) => {
      const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const patch: Record<string, Record<string, string>> = {};
      for (const [cat, bucket] of Object.entries(p)) {
        if (cat === 'updated_at' || !bucket || typeof bucket !== 'object' || Array.isArray(bucket)) continue;
        const urls: Record<string, string> = {};
        for (const [k, v] of Object.entries(bucket as Record<string, unknown>)) {
          if (typeof v === 'string' && v.trim()) urls[k] = v;
        }
        if (Object.keys(urls).length) patch[cat] = urls;
      }
      if (Object.keys(patch).length) {
        setPresetPreviews((prev) => {
          const next = { ...prev };
          for (const [cat, urls] of Object.entries(patch)) next[cat] = { ...(next[cat] || {}), ...urls };
          return next;
        });
      }
    };
    fetch('/api/creator/style-previews')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => mergePatch(setStylePreviews, data?.previews))
      .catch(() => {
        /* keep defaults */
      });
    fetch('/api/creator/gender-previews')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => mergePatch(setGenderPreviews, data?.previews))
      .catch(() => {
        /* keep defaults */
      });
    fetch('/api/creator/nsfw-previews')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => mergePatch(setNsfwPreviews, data?.previews))
      .catch(() => {
        /* keep defaults */
      });
    fetch('/api/creator/preset-previews')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => mergePresetPatch(data?.previews))
      .catch(() => {
        /* keep placeholders */
      });
    // 管理员探测：非管理员返回 401/403，静默跳过；成功则顺带取最新配置
    authedFetch('/api/admin/style-previews')
      .then(async (r) => {
        if (!r.ok) return null;
        setIsAdmin(true);
        const [styleData, genderRes, nsfwRes, presetRes] = await Promise.all([
          readResponseJson<{ previews?: Record<string, unknown> }>(r),
          authedFetch('/api/admin/gender-previews'),
          authedFetch('/api/admin/nsfw-previews'),
          authedFetch('/api/admin/preset-previews'),
        ]);
        mergePatch(setStylePreviews, styleData.previews);
        if (genderRes.ok) {
          const genderData = await readResponseJson<{ previews?: Record<string, unknown> }>(genderRes);
          mergePatch(setGenderPreviews, genderData.previews);
        }
        if (nsfwRes.ok) {
          const nsfwData = await readResponseJson<{ previews?: Record<string, unknown> }>(nsfwRes);
          mergePatch(setNsfwPreviews, nsfwData.previews);
        }
        if (presetRes.ok) {
          const presetData = await readResponseJson<{ previews?: Record<string, unknown> }>(presetRes);
          mergePresetPatch(presetData.previews);
        }
      })
      .catch(() => {
        /* 非管理员或离线：无就地管理入口 */
      });
  }, []);

  // Form state
  const [visualStyle, setVisualStyle] = useState('realistic');
  const [gender, setGender] = useState('Female');
  const [ethnicity, setEthnicity] = useState('Asian');
  const [skinTone, setSkinTone] = useState('Porcelain Fair');
  const [faceShape, setFaceShape] = useState('Oval');
  const [bodyType, setBodyType] = useState('Slim');
  const [hairStyle, setHairStyle] = useState('Long Flowing');
  const [hairColor, setHairColor] = useState('#d4a574');
  const [eyeColor, setEyeColor] = useState('Brown');
  const [fashionStyle, setFashionStyle] = useState('Casual');
  const [appearancePrompt, setAppearancePrompt] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(['Romantic', 'Playful']);
  const [occupation, setOccupation] = useState('Student');
  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState(22);
  const [shortDescription, setShortDescription] = useState('');
  const [relationship, setRelationship] = useState('girlfriend');
  const [selectedVoice, setSelectedVoice] = useState<string>(''); // empty = default (warm-caring)

  // Voice welcome message generator
  const [generatingWelcome, setGeneratingWelcome] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [messageLocale, setMessageLocale] = useState('en');

  // Portrait slots
  const [slots, setSlots] = useState<PortraitSlot[]>(EMPTY_SLOTS);
  const [selectedSlot, setSelectedSlot] = useState(-1);
  const [batchRunning, setBatchRunning] = useState(false);
  const batchRun = useRef(0);

  // Submit + reveal
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CreatedCompanionReveal | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Creation flow (LLM prompt → text-to-image) ──
  const [creating, setCreating] = useState(false);
  const [createPhase, setCreatePhase] = useState<'idle' | 'reserving_card' | 'crafting_prompt' | 'generating_images' | 'committing_card' | 'done'>('idle');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  // 创建卡预约 token：生成成功后才用此 token 真正扣 1 张卡；
  // 任何中途失败（LLM 错误/图片生成失败/用户放弃）→ 调 cancel 释放预约，卡片不丢失。
  const cardReservationRef = useRef<{ token: string; balanceAtReserve: number } | null>(null);

  // ─── Data fetching ───────────────────────────────────────────────────────

  const fetchCreatorData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [optsRes, cardsRes, partsRes, gfRes] = await Promise.all([
        fetch('/api/creator/presets?section=all'),
        authedFetch('/api/creator/cards'),
        fetch('/api/creator/parts'),
        authedFetch('/api/girlfriends'),
      ]);
      const optsData = await readResponseJson<{ options?: Record<string, OptionItem[]> }>(optsRes);
      const cardsData = await readResponseJson<CardStatus>(cardsRes);
      const partsData = await readResponseJson<{ categories?: Record<string, CharacterPart[]> }>(partsRes);
      const gfData = await readResponseJson<{ girlfriends?: Array<Record<string, unknown>> }>(gfRes);

      if (optsData.options) setOptions(optsData.options);
      if (cardsData) setCardStatus(cardsData);
      if (partsData.categories) setParts(partsData.categories);
      if (gfData.girlfriends) setCompanions(gfData.girlfriends);
    } catch (err) {
      logger.warn('[creator] fetch data failed', { error: String(err) });
    } finally {
      setLoadingData(false);
    }
  }, []);

  useAutoRefresh(fetchCreatorData);

  useEffect(() => {
    void fetchCreatorData();
  }, [fetchCreatorData]);

  // ─── Option helpers ──────────────────────────────────────────────────────

  const getOpts = useCallback((category: string): OptionItem[] => options[category] || [], [options]);

  /**
   * 性别差异化选项：发型/身材按所选性别过滤（跨性别 = 并集不过滤）；
   * 选项池缺性别种子时（过滤结果为空）回退全集，避免空面板。
   */
  const genderFilteredOpts = useCallback((category: string): OptionItem[] => {
    const all = getOpts(category);
    const set = GENDER_OPTION_SETS[gender]?.[category];
    if (!set) return all;
    const filtered = all.filter((o) => set.includes(o.value));
    return filtered.length > 0 ? filtered : all;
  }, [getOpts, gender]);

  // 切换性别 → 预选项随动：当前发型/身材不在新性别集合内则重置；关系跟随性别切换
  useEffect(() => {
    const sets = GENDER_OPTION_SETS[gender];
    if (sets) {
      if (sets.hair_style && !sets.hair_style.includes(hairStyle) && sets.hair_style.length > 0) {
        setHairStyle(sets.hair_style[0]);
      }
      if (sets.body_type && !sets.body_type.includes(bodyType) && sets.body_type.length > 0) {
        setBodyType(sets.body_type[0]);
      }
    }
    if (gender === 'Male' && FEMALE_ONLY_RELATIONSHIPS.includes(relationship)) setRelationship('boyfriend');
    else if (gender === 'Female' && MALE_ONLY_RELATIONSHIPS.includes(relationship)) setRelationship('girlfriend');
  }, [gender, hairStyle, bodyType, relationship]);

  /** 购买成功后重拉创建卡状态（RPC 已入账 profiles.creation_cards） */
  const refreshCards = useCallback(async () => {
    try {
      const res = await authedFetch('/api/creator/cards');
      const data = await readResponseJson<CardStatus>(res);
      if (data) setCardStatus(data);
    } catch {
      /* 静默：下次页面刷新会重拉 */
    }
  }, []);

  const partPrompt = useCallback((cat: string, value: string): string => {
    return (parts[cat] || []).find((p) => p.value.toLowerCase() === value.toLowerCase())?.prompt_en || '';
  }, [parts]);

  const buildGenome = useCallback((): Record<string, string> => {
    const genome: Record<string, string> = {};
    const match = (cat: string, value: string) => {
      const part = (parts[cat] || []).find((p) => p.value.toLowerCase() === value.toLowerCase());
      if (part) genome[cat] = part.slug;
    };
    match('hairstyle', hairStyle);
    match('hair_color', hairColor);
    match('face_shape', faceShape);
    match('body_type', bodyType);
    match('skin_tone', skinTone);
    match('eye_color', eyeColor);
    return genome;
  }, [parts, hairStyle, hairColor, faceShape, bodyType, skinTone, eyeColor]);


  // ─── Select companion as template — pre-fill form with her appearance & persona ──
  const handleSelectCompanion = useCallback((gf: Record<string, unknown>) => {
    const gfId = String(gf.id || '');
    setSelectedCompanionId((prev) => (prev === gfId ? null : gfId));

    const s = (v: unknown): string => (v != null && v !== 'null' ? String(v) : '');

    // Identity
    const n = s(gf.name);
    if (n) setName(n);
    const a = Number(gf.age);
    if (a >= 18 && a <= 120) setAge(a);
    const sd = s(gf.short_description);
    if (sd) setShortDescription(sd);

    // Personality tags
    const pRaw = s(gf.personality);
    if (pRaw) {
      setSelectedTags(pRaw.split(',').map((t) => t.trim()).filter(Boolean));
    }
    const occ = s(gf.occupation);
    if (occ) setOccupation(occ);

    // Appearance (direct columns from girlfriends table)
    const hair = s(gf.appearance_hair);
    if (hair) setHairStyle(hair);
    const hairCol = s(gf.appearance_hair_color);
    if (hairCol) setHairColor(hairCol);
    const eyes = s(gf.appearance_eyes);
    if (eyes) setEyeColor(eyes);
    const body = s(gf.appearance_body);
    if (body) setBodyType(body);
    const fash = s(gf.appearance_style);
    if (fash) setFashionStyle(fash);
    const race = s(gf.appearance_race);
    if (race) setEthnicity(race);
    const face = s(gf.appearance_face);
    if (face) setFaceShape(face);
    const skin = s(gf.appearance_skin);
    if (skin) setSkinTone(skin);

    // Meta fallback
    const meta = (gf.meta && typeof gf.meta === 'object' ? gf.meta : {}) as Record<string, unknown>;
    const vs = s(meta.visual_style);
    if (vs) setVisualStyle(vs);
    const g = s(meta.gender);
    if (g) setGender(g);

    // Voice
    const voice = s(gf.voice_timbre_id);
    if (voice) setSelectedVoice(voice);

    // Relationship
    const rel = s(gf.relationship);
    if (rel) {
      const relOpts = options['relationship'] || [];
      const match = relOpts.find((r) => r.value === rel || r.label_en === rel);
      if (match) setRelationship(match.value);
    }
  }, [options]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : prev.length >= 8 ? prev : [...prev, tag],
    );
  }, []);

  // ─── Validation ──────────────────────────────────────────────────────────

  const infoValid = useMemo(
    () => name.trim().length >= 2 && age >= 18 && Boolean(ethnicity && hairStyle && eyeColor && bodyType && relationship),
    [name, age, ethnicity, hairStyle, eyeColor, bodyType, relationship],
  );

  // 「基本」步门槛：名字与年龄先行校验，避免到立绘步才报错
  const generalValid = useMemo(() => name.trim().length >= 2 && age >= 18, [name, age]);

  const noCards = Boolean(cardStatus && cardStatus.cards <= 0);

  // ─── Portrait batch generation ───────────────────────────────────────────

  const portraitRequestBody = useCallback(() => ({
    name: name.trim() || 'Companion',
    visual_style: visualStyle,
    ethnicity, gender, face_shape: faceShape,
    hair_style: hairStyle, hair_color: hairColor,
    eye_color: eyeColor, body_type: bodyType,
    fashion_style: fashionStyle, appearance_prompt: appearancePrompt,
    personality: selectedTags.join(', '),
    skin_tone: partPrompt('skin_tone', skinTone) || undefined,
    // Preset cache: no longer using presets
    preset_slug: undefined,
    nsfw_level: nsfwLevel,
  }), [name, visualStyle, ethnicity, gender, faceShape, hairStyle, hairColor, eyeColor, bodyType, fashionStyle, appearancePrompt, selectedTags, partPrompt, skinTone, nsfwLevel]);

  const pollJob = useCallback(async (jobId: string, endpointId?: string): Promise<string | null> => {
    for (let i = 0; i < 80; i++) {
      await sleep(3000);
      try {
        const r = await authedFetch(`/api/ai/status?job_id=${encodeURIComponent(jobId)}${endpointId ? `&endpoint_id=${encodeURIComponent(endpointId)}` : ''}`);
        const d = await readResponseJson<{ status?: string; images?: string[]; error?: string }>(r);
        if (d.status === 'COMPLETED' && Array.isArray(d.images) && d.images.length > 0) return d.images[0];
        if (d.status === 'FAILED') return null;
      } catch { /* keep polling */ }
    }
    return null;
  }, []);

  const runBatch = useCallback(async (level?: number, customPromptOverride?: string) => {
    const run = ++batchRun.current;
    setBatchRunning(true);
    setError(null);
    setSelectedSlot(-1);
    setSlots(Array.from({ length: SLOT_COUNT }, () => ({ status: 'loading' as const })));
    try {
      const baseBody: Record<string, unknown> = {
        ...portraitRequestBody(),
        count: 2,
        ...(level ? { nsfw_level: level } : {}),
      };
      if (customPromptOverride) {
        baseBody.custom_prompt = customPromptOverride;
      }
      // Send two parallel requests: one realistic, one anime
      const [resRealistic, resAnime] = await Promise.all([
        authedFetch('/api/girlfriends/generate-portrait', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseBody, visual_style: 'realistic' }),
        }),
        authedFetch('/api/girlfriends/generate-portrait', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseBody, visual_style: '2d' }),
        }),
      ]);
      const [dataRealistic, dataAnime] = await Promise.all([
        readResponseJson<PortraitBatchResponse>(resRealistic),
        readResponseJson<PortraitBatchResponse>(resAnime),
      ]);
      if (batchRun.current !== run) return;
      if (!resRealistic.ok || !resAnime.ok) {
        setError(dataRealistic.error || dataAnime.error || t('create.failed'));
        setSlots(EMPTY_SLOTS);
        return;
      }

      // Normalize batch / legacy single responses for each style
      const normalizeResponse = (data: PortraitBatchResponse) => {
        const readyUrls: string[] = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
        const pendingJobs: Array<{ job_id: string; endpoint_id?: string }> = Array.isArray(data.pending_jobs) ? data.pending_jobs : [];
        const singleUrl = data.imageUrl || data.portrait_url || data.url;
        if (!readyUrls.length && singleUrl) readyUrls.push(singleUrl);
        if (!pendingJobs.length && data.pending && data.job_id) {
          pendingJobs.push({ job_id: data.job_id, endpoint_id: data.endpoint_id });
        }
        return { readyUrls, pendingJobs };
      };

      const normRealistic = normalizeResponse(dataRealistic);
      const normAnime = normalizeResponse(dataAnime);

      if (!normRealistic.readyUrls.length && !normRealistic.pendingJobs.length &&
          !normAnime.readyUrls.length && !normAnime.pendingJobs.length) {
        setError(t('create.noImageReturned'));
        setSlots(EMPTY_SLOTS);
        return;
      }

      // Slots 0-1: realistic, Slots 2-3: anime
      const buildSlots = (
        norm: { readyUrls: string[]; pendingJobs: Array<{ job_id: string; endpoint_id?: string }> },
        offset: number,
      ): PortraitSlot[] => {
        return Array.from({ length: 2 }, (_, i) => {
          if (norm.readyUrls[i]) return { status: 'ready' as const, url: norm.readyUrls[i] };
          const job = norm.pendingJobs[i - norm.readyUrls.length];
          if (job) return { status: 'loading' as const, jobId: job.job_id, endpointId: job.endpoint_id };
          return { status: 'idle' as const };
        });
      };

      const realisticSlots = buildSlots(normRealistic, 0);
      const animeSlots = buildSlots(normAnime, 2);
      const next: PortraitSlot[] = [...realisticSlots, ...animeSlots];
      setSlots(next);

      // Poll pending jobs in parallel, each fills its own slot
      const pollTasks = next.map((slot, idx) => {
        if (slot.status !== 'loading' || !slot.jobId) return null;
        const jobId = slot.jobId;
        const endpointId = slot.endpointId;
        return pollJob(jobId, endpointId).then((url) => {
          if (batchRun.current !== run) return;
          setSlots((prev) => prev.map((s, i) => (i === idx
            ? (url ? { status: 'ready', url } : { status: 'error', error: t('create.genFailed') })
            : s)));
        });
      }).filter(Boolean);
      await Promise.all(pollTasks as Promise<void>[]);
    } catch (e) {
      if (batchRun.current === run) {
        logger.error(String(e));
        setError(errorMessageFromUnknown(e, t('create.genFailed')));
        setSlots(EMPTY_SLOTS);
      }
    } finally {
      if (batchRun.current === run) setBatchRunning(false);
    }
  }, [portraitRequestBody, pollJob, t]);

  /** 取消创建卡预约（不扣卡）。失败也安全——预约阶段从未扣分。 */
  const cancelCardReservation = useCallback(async () => {
    const tok = cardReservationRef.current?.token;
    if (!tok) return;
    try {
      await authedFetch('/api/creator/consume-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'cancel', reservation_token: tok }),
      });
    } catch (err) {
      logger.warn('[creator] cancel card reservation failed (non-blocking)', { err: String(err) });
    } finally {
      cardReservationRef.current = null;
    }
  }, []);

  const handleStartCreation = useCallback(async () => {
    if (!infoValid || creating) {
      if (name.trim().length < 2) {
        setError(t('create.enterNameMin2'));
        nameInputRef.current?.focus();
        nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (!infoValid) {
        setError(t('create.completeRequired'));
      }
      return;
    }
    setError(null);
    setCreating(true);

    try {
      // Phase 1: Reserve creation card (NO deduction yet — only check eligibility).
      // The card is only deducted at Phase "committing_card" once the companion
      // is fully created and saved. If anything fails in between, the
      // reservation is cancelled and the user's card balance is untouched.
      setCreatePhase('reserving_card');
      const cardRes = await authedFetch('/api/creator/consume-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'reserve' }),
      });
      const cardData = await readResponseJson<{
        ok?: boolean;
        reservation?: { token: string; balance_at_reserve: number };
        error?: string; code?: string;
      }>(cardRes);
      if (!cardRes.ok || !cardData.ok || !cardData.reservation?.token) {
        if (cardData.code === 'membership_required') {
          router.push('/pricing');
          setCreating(false);
          setCreatePhase('idle');
          return;
        }
        setError(
          cardData.code === 'creation_quota_exceeded'
            ? t('create.quotaReachedDesc')
            : cardData.code === 'NO_CARDS'
              ? t('create.noCardsRetry')
              : (cardData.error || t('create.createFailed')),
        );
        setCreating(false);
        setCreatePhase('idle');
        return;
      }
      // Hold the reservation token for the final commit/cancel step.
      cardReservationRef.current = {
        token: cardData.reservation.token,
        balanceAtReserve: cardData.reservation.balance_at_reserve,
      };

      try {
        // Phase 2: Generate LLM prompt from form selections
        setCreatePhase('crafting_prompt');
        const promptRes = await authedFetch('/api/creator/generate-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...portraitRequestBody(),
            nsfw_level: nsfwLevel,
          }),
        });
        const promptData = await readResponseJson<{
          success?: boolean;
          prompt?: string;
          error?: string;
          meta?: ModelMeta | null;
          lora_info?: ModelLoraInfo | null;
          negative_prompt?: string;
          base_prompt?: string;
        }>(promptRes);

        if (!promptRes.ok || !promptData.success || !promptData.prompt) {
          throw new Error(promptData.error || t('create.genFailed'));
        }

        // Store metadata for UI panels
        setGenerationResult({
          meta: promptData.meta || null,
          lora: promptData.lora_info || null,
          positive: promptData.prompt || '',
          negative: promptData.negative_prompt || '',
          base: promptData.base_prompt || promptData.prompt,
        });

        setGeneratedPrompt(promptData.prompt);

        // Phase 3: Start image generation (text-to-image mode)
        setCreatePhase('generating_images');
        setStep('portrait');
        // Pass advanced settings to generation
        await runBatch(undefined, promptData.prompt);
        // Image generation finished — success means we proceed to user pick + submit,
        // failure means runBatch already surfaced the error and slots are empty.
        // Card deduction is deferred until handleSubmit (which creates the companion).
        setCreatePhase('done');
      } catch (innerErr) {
        // Phase 2/3 failed — release the reservation so the user keeps their card.
        await cancelCardReservation();
        throw innerErr;
      }
    } catch (e) {
      logger.error(String(e));
      setError(errorMessageFromUnknown(e, t('create.genFailed')));
      setCreatePhase('idle');
    } finally {
      setCreating(false);
    }
  }, [infoValid, creating, name, t, portraitRequestBody, nsfwLevel, runBatch, setGenerationResult, router, cancelCardReservation]);

  const startPortraitStep = handleStartCreation;

  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const chosen = slots[selectedSlot];
    if (!chosen?.url || saving) return;
    setSaving(true);
    setError(null);
    try {
      const relOpts = getOpts('relationship');
      const relMeta = relOpts.find((r) => r.value === relationship);
      const relLabel = relMeta ? getLabel(relMeta, locale) : (t('create.girlfriend'));
      const relDesc = relMeta ? getExtra(relMeta, 'desc', locale) : '';

      const fullCharacterCard = [
        `Visual style: ${visualStyle}. Gender presentation: ${gender}. Face: ${faceShape}.`,
        `Ethnicity: ${ethnicity}.`,
        `Occupation: ${occupation}.`,
        relMeta ? `Relationship: ${relLabel}${relDesc ? ' - ' + relDesc : ''}.` : '',
        shortDescription ? `Tagline: ${shortDescription}.` : '',
      ].filter(Boolean).join('\n');

      const res = await authedFetch('/api/girlfriends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          age,
          short_description: shortDescription.trim(),
          personality: selectedTags.join(', '),
          backstory: fullCharacterCard,
          appearance_hair: hairStyle,
          appearance_hair_color: hairColor,
          appearance_eyes: eyeColor,
          appearance_body: bodyType,
          appearance_style: fashionStyle,
          appearance_race: ethnicity,
          appearance_face: faceShape,
          appearance_skin: skinTone,
          genome: buildGenome(),
          tags: [...selectedTags, ethnicity, occupation, relLabel],
          avatar_url: chosen.url,
          portrait_url: chosen.url,
          preset_slug: undefined,
          voice_timbre_id: selectedVoice || 'warm-caring',
          locale,
          meta: {
            visual_style: visualStyle, ethnicity, gender,
            face_shape: faceShape, occupation,
            relationship, appearance_prompt: appearancePrompt,
          },
        }),
      });
      const data = await readResponseJson<{
        error?: string;
        code?: string;
        cards_remaining?: number;
        girlfriend?: Record<string, unknown>;
        stats?: { base_desire?: number; base_development?: number; base_kink?: number; score?: number; rarity?: Rarity };
      }>(res);
      if (!res.ok) {
        // All companion-save failures must release the card reservation so
        // the user doesn't lose a card for a creation that wasn't actually
        // committed. Throwing routes through the catch which calls
        // cancelCardReservation() and the catch's setError surfaces the
        // user-friendly message.
        let errorMessage =
          data.code === 'SEAT_LIMIT'
            ? t('create.seatLimitDesc')
            : data.code === 'creation_quota_exceeded'
              ? t('create.quotaReachedDesc')
              : data.code === 'NO_CARDS'
                ? t('create.noCardsBuyMore')
                : data.error || t('create.createFailed');
        setError(errorMessage);
        if (data.code === 'membership_required') {
          router.push('/pricing');
        }
        throw new Error(errorMessage);
      }

      if (data.cards_remaining !== undefined && cardStatus) {
        setCardStatus({ ...cardStatus, cards: data.cards_remaining });
      } else if (cardReservationRef.current) {
        // Reservation flow: refresh local card status from the source of truth
        // (commit endpoint reports the new balance).
        refreshCards();
      }
      // Commit the reservation — only NOW is the creation card actually deducted.
      // This is the "确认生成完成才扣除创建卡-1" step: failure any time before
      // here leaves the user's card balance untouched.
      const reserved = cardReservationRef.current;
      if (reserved?.token) {
        setCreatePhase('committing_card');
        try {
          await authedFetch('/api/creator/consume-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'commit', reservation_token: reserved.token }),
          });
        } catch (commitErr) {
          logger.warn('[creator] commit card reservation failed (companion already saved)', { err: String(commitErr) });
        } finally {
          cardReservationRef.current = null;
        }
      }
      notifyDataChange('girlfriends');

      const gf = data.girlfriend || {};
      const desire = Number(data.stats?.base_desire ?? gf.base_desire ?? 0);
      const development = Number(data.stats?.base_development ?? gf.base_development ?? 0);
      const kink = Number(data.stats?.base_kink ?? gf.base_kink ?? 0);
      const score = Number(data.stats?.score ?? companionScore(desire, development, kink));
      const rarity = (data.stats?.rarity || (gf.rarity as Rarity) || 'R') as Rarity;
      setReveal({
        id: String(gf.id || ''),
        name: String(gf.name || name.trim()),
        portraitUrl: chosen.url || '',
        rarity, score, desire, development, kink,
      });
    } catch (e) {
      logger.error(String(e));
      // If the companion save failed after a reservation was issued, release
      // it so the user's card balance is preserved. (If we already committed
      // before this catch fired, ref is null and cancelCardReservation is a
      // safe no-op.) The throw inside the try already set a user-friendly
      // error message; for unexpected errors fall back to a generic message.
      await cancelCardReservation();
      setError((prev) => prev || errorMessageFromUnknown(e, t('common.networkError')));
    } finally {
      setSaving(false);
    }
  }, [slots, selectedSlot, saving, getOpts, relationship, locale, visualStyle, gender, faceShape, ethnicity, occupation, shortDescription, name, age, selectedTags, hairStyle, hairColor, eyeColor, bodyType, fashionStyle, skinTone, buildGenome, selectedVoice, appearancePrompt, cardStatus, t, router, refreshCards, cancelCardReservation]);

  // ─── Reveal actions ──────────────────────────────────────────────────────

  const handleGoChat = useCallback(() => {
    const id = reveal?.id;
    setReveal(null);
    if (id) router.push(`/chats?friend=${encodeURIComponent(id)}`);
    else router.push('/chats');
  }, [reveal, router]);

  const handleCreateAnother = useCallback(() => {
    setReveal(null);
    setSlots(EMPTY_SLOTS);
    setSelectedSlot(-1);
    setStep('style');
    setCreating(false);
    setCreatePhase('idle');
    setGeneratedPrompt('');
    // Safety: if the user navigates away with a pending reservation, drop the
    // ref so a stale token isn't accidentally committed on a later submit.
    cardReservationRef.current = null;
    void fetchCreatorData();
  }, [fetchCreatorData]);

  // ─── Admin 就地管理：风格/性别/预设 示例图上传与删除 ────────────────────

  type UploadTarget = { kind: 'style' | 'gender' | 'nsfw' | 'preset'; key: string };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [assetBusy, setAssetBusy] = useState<string | null>(null);

  const pickAssetImage = useCallback((kind: UploadTarget['kind'], key: string) => {
    setUploadTarget({ kind, key });
    fileInputRef.current?.click();
  }, []);

  const handleAssetFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = uploadTarget;
    e.target.value = '';
    if (!file || !target || !isAdmin) return;
    setAssetBusy(`${target.kind}:${target.key}`);
    try {
      if (target.kind === 'preset') {
        const sep = target.key.indexOf(':');
        const category = sep > 0 ? target.key.slice(0, sep) : '';
        const optKey = sep > 0 ? target.key.slice(sep + 1) : target.key;
        const fd = new FormData();
        fd.append('category', category);
        fd.append('key', optKey);
        fd.append('file', file);
        const res = await authedFetch('/api/admin/preset-previews', { method: 'POST', body: fd });
        const data = await readResponseJson<{ previews?: Record<string, Record<string, string>>; error?: string }>(res);
        if (!res.ok) throw new Error(data.error || 'upload failed');
        const bucket = data.previews?.[category];
        if (bucket) {
          setPresetPreviews((prev) => ({ ...prev, [category]: { ...(prev[category] || {}), ...bucket } }));
        }
      } else if (target.kind === 'style' || target.kind === 'gender' || target.kind === 'nsfw') {
        const fd = new FormData();
        fd.append(target.kind === 'nsfw' ? 'level' : target.kind, target.key);
        fd.append('file', file);
        const res = await authedFetch(
          target.kind === 'style'
            ? '/api/admin/style-previews'
            : target.kind === 'gender'
              ? '/api/admin/gender-previews'
              : '/api/admin/nsfw-previews',
          { method: 'POST', body: fd },
        );
        const data = await readResponseJson<{ previews?: Record<string, string>; error?: string }>(res);
        if (!res.ok) throw new Error(data.error || 'upload failed');
        if (data.previews) {
          const patch = data.previews;
          if (target.kind === 'style') setStylePreviews((prev) => ({ ...prev, ...patch }));
          else if (target.kind === 'gender') setGenderPreviews((prev) => ({ ...prev, ...patch }));
          else setNsfwPreviews((prev) => ({ ...prev, ...patch }));
        }
      }
    } catch (err) {
      logger.warn('[creator] admin asset upload failed', { error: String(err) });
      setError(errorMessageFromUnknown(err, t('create.adminUploadFailed')));
    } finally {
      setAssetBusy(null);
      setUploadTarget(null);
    }
  }, [uploadTarget, isAdmin, t]);

  const clearAssetImage = useCallback(async (kind: UploadTarget['kind'], key: string) => {
    if (!isAdmin) return;
    setAssetBusy(`${kind}:${key}`);
    try {
      if (kind === 'preset') {
        const sep = key.indexOf(':');
        const category = sep > 0 ? key.slice(0, sep) : '';
        const optKey = sep > 0 ? key.slice(sep + 1) : key;
        const res = await authedFetch(
          `/api/admin/preset-previews?category=${encodeURIComponent(category)}&key=${encodeURIComponent(optKey)}`,
          { method: 'DELETE' },
        );
        const data = await readResponseJson<{ error?: string }>(res);
        if (!res.ok) throw new Error(data.error || 'delete failed');
        setPresetPreviews((prev) => {
          const bucket = { ...(prev[category] || {}) };
          delete bucket[optKey];
          return { ...prev, [category]: bucket };
        });
      } else if (kind === 'style') {
        const res = await authedFetch(`/api/admin/style-previews?style=${encodeURIComponent(key)}`, { method: 'DELETE' });
        const data = await readResponseJson<{ previews?: Record<string, string>; error?: string }>(res);
        if (!res.ok) throw new Error(data.error || 'delete failed');
        if (data.previews) {
          const patch = data.previews;
          setStylePreviews((prev) => ({ ...prev, ...patch }));
        }
      } else if (kind === 'gender') {
        const res = await authedFetch(`/api/admin/gender-previews?gender=${encodeURIComponent(key)}`, { method: 'DELETE' });
        const data = await readResponseJson<{ error?: string }>(res);
        if (!res.ok) throw new Error(data.error || 'delete failed');
        setGenderPreviews((prev) => ({ ...prev, [key]: '' }));
      }
    } catch (err) {
      logger.warn('[creator] admin asset delete failed', { error: String(err) });
      setError(errorMessageFromUnknown(err, t('common.networkError')));
    } finally {
      setAssetBusy(null);
    }
  }, [isAdmin, t]);

  // 预设卡（种族/发型/体型/穿搭）管理员就地上传/删除覆盖层
  // 预览版面性别：男性独立版面；女性/跨性别共用女性版面
  const previewBoardGender: 'female' | 'male' = gender === 'Male' ? 'male' : 'female';

  /** 预览图查找：男性版面用 male/<value> 独立槽位（缺失时回退共享图），女性版面用现有槽位 */
  const presetPreviewImage = useCallback(
    (category: string, value: string): string | undefined => {
      const bucket = presetPreviews[category];
      if (!bucket) return undefined;
      if (previewBoardGender === 'male') return bucket[`male/${value}`] ?? bucket[value];
      return bucket[value];
    },
    [presetPreviews, previewBoardGender],
  );

  const presetAdminOverlay = useCallback(
    (category: string) =>
      isAdmin
        ? (o: { value: string }) => {
            // 男性版面上传/删除写入 male/ 前缀的独立槽位
            const optKey = previewBoardGender === 'male' ? `male/${o.value}` : o.value;
            return (
              <AdminCardButtons
                busy={assetBusy === `preset:${category}:${optKey}`}
                onUpload={() => pickAssetImage('preset', `${category}:${optKey}`)}
                onClear={() => void clearAssetImage('preset', `${category}:${optKey}`)}
                clearTitle={t('create.adminDeleteImage')}
                clearIcon="trash"
              />
            );
          }
        : undefined,
    [isAdmin, assetBusy, pickAssetImage, clearAssetImage, t, previewBoardGender],
  );

  // ─── Derived UI bits ─────────────────────────────────────────────────────

  const readyCount = slots.filter((s) => s.status === 'ready').length;
  const stepLabels: TranslationKey[] = [
    'create.stepStyle',
    'create.stepGender',
    'create.stepRaceHair',
    'create.stepBodyFashion',
    'create.stepIdentity',
    'create.portrait',
  ];
  const stepIndex = CREATE_STEPS.indexOf(step);
  const isFormStep = step !== 'portrait';
  const goPrevStep = useCallback(() => {
    const idx = CREATE_STEPS.indexOf(step);
    if (idx > 0) setStep(CREATE_STEPS[idx - 1]);
    else router.push('/');
  }, [step, router]);
  const goNextStep = useCallback(() => {
    const idx = CREATE_STEPS.indexOf(step);
    if (idx >= 0 && idx < CREATE_STEPS.length - 1) setStep(CREATE_STEPS[idx + 1]);
  }, [step]);

  // Membership redesign: free tier is chat-only. Show an upgrade wall instead
  // of the creator — forbidden surfaces guide to membership, never fail.
  const isFreeTier = Boolean(cardStatus && (cardStatus.tier === 'free' || cardStatus.tier === ''));
  if (!loadingData && isFreeTier) {
    return (
      <GameShell className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden" innerClassName="flex flex-1 flex-col min-h-0">
        <PageHeader
          eyebrow="CREATOR"
          title={t('create.createCompanion')}
          subtitle={t('create.stepDesc')}
          backHref="/"
          sticky={false}
          className="shrink-0"
        />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-8 text-center shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF2D78]/60 to-transparent" />
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#FF2D78] to-[#8b5cf6] shadow-[0_0_28px_rgba(255,45,120,0.5)]">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-white">{t('create.freeWallTitle')}</h2>
            <p className="mb-6 text-sm leading-relaxed text-white/60">{t('create.freeWallDesc')}</p>
            <GamePrimaryButton className="h-11 w-full" onClick={() => router.push('/pricing')}>
              {t('create.upgradeNow')}
              <ArrowRight className="h-4 w-4" />
            </GamePrimaryButton>
          </div>
        </div>
      </GameShell>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <GameShell className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden" innerClassName="flex flex-1 flex-col min-h-0">
      <PageHeader
        eyebrow="CREATOR"
        title={t('create.createCompanion')}
        subtitle={t('create.stepDesc')}
        backHref="/"
        sticky={false}
        className="shrink-0"
      />

      {/* Card balance + Stepper */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/[0.06]">
        {cardStatus && (
          <div className="flex items-center gap-1.5 text-[11px] text-white/50">
            <CreditCard className="h-3.5 w-3.5" />
            <span>{t('create.cards')}: </span>
            <span className={cn('font-bold', cardStatus.cards > 0 ? 'text-[#FF2D78]' : 'text-red-400')}>
              {cardStatus.cards}
            </span>
            {cardStatus.monthlyQuota > 0 && (
              <span className="text-white/30">/{cardStatus.monthlyQuota}{t('create.perMonth')}</span>
            )}
            {/* 「+」快捷充值入口：弹窗用积分购买创建卡 */}
            <button
              type="button"
              onClick={() => setBuyCardsOpen(true)}
              title={t('create.buyCards')}
              className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white shadow-[0_0_10px_rgba(255,45,120,0.45)] transition-transform hover:scale-110 touch-manipulation"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* 竞品式步骤指示器：圆形图标钮（无连接线），激活 = 品牌粉实心；五步紧凑排布 */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {stepLabels.map((label, idx) => {
            const active = idx === stepIndex;
            const done = idx < stepIndex;
            return (
              <div key={label} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                    active && 'bg-[#FF2D78] text-white shadow-[0_0_16px_rgba(255,45,120,0.5)]',
                    done && 'bg-[#FF2D78]/25 text-[#FF8FBB] ring-1 ring-[#FF2D78]/50',
                    !active && !done && 'bg-white/[0.08] text-white/45',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                <span className={cn('text-[9px] font-semibold whitespace-nowrap', active ? 'text-white' : 'text-white/40')}>
                  {t(label)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pt-4 pb-6">
        <div className="mx-auto max-w-none">
          <AnimatePresence mode="wait">

            {/* ─── Creating phase: LLM prompt + image gen progress ────────────── */}
            {creating && step === 'identity' && (
              <motion.div
                key="creating"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="flex min-h-[60vh] flex-col gap-6 py-12"
              >
                {/* ─── Three-panel layout: center progress + right info panels ──── */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
                  {/* Center: generating progress */}
                  <div className="flex min-h-[400px] flex-col items-center justify-center gap-6">
                    {/* Animated glow orb */}
                    <div className="relative">
                      <motion.div
                        className="h-24 w-24 rounded-full bg-gradient-to-br from-[#FF2D78]/30 to-[#8b5cf6]/30 blur-2xl"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                      >
                        <Sparkles className="h-10 w-10 text-[#FF2D78]/80 drop-shadow-[0_0_12px_rgba(255,45,120,0.5)]" />
                      </motion.div>
                    </div>

                    {/* Phase progress messages */}
                    <div className="text-center">
                      <motion.p
                        key={createPhase}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-lg font-bold text-white/90"
                      >
                        {createPhase === 'reserving_card' && t('create.cardReserving')}
                        {createPhase === 'crafting_prompt' && t('create.craftingPrompt')}
                        {createPhase === 'generating_images' && t('create.generatingImages')}
                        {createPhase === 'committing_card' && t('create.cardCommitting')}
                        {createPhase === 'done' && t('create.promptReady')}
                      </motion.p>
                      <motion.p
                        className="mt-2 text-xs text-white/40"
                        animate={{ opacity: [0.4, 0.7, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        {createPhase !== 'done' && t('create.almostDone')}
                      </motion.p>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full max-w-xs">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6]"
                          initial={{ width: '0%' }}
                          animate={{
                            width:
                              createPhase === 'reserving_card' ? '10%' :
                              createPhase === 'crafting_prompt' ? '40%' :
                              createPhase === 'generating_images' ? '75%' :
                              createPhase === 'committing_card' ? '95%' : '100%',
                          }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right panel stack */}
                  <div className="flex flex-col gap-4 w-full max-w-none">
                    {/* Model Info Card */}
                    {modelMeta && (
                      <ModelInfoCard
                        modelMeta={modelMeta}
                        loraInfo={loraInfo}
                      />
                    )}
                    
                    {/* Prompt Editor */}
                    {(positivePrompt || negativePrompt) && (
                      <PromptEditor
                        positivePrompt={positivePrompt}
                        negativePrompt={negativePrompt}
                        basePrompt={basePrompt}
                        triggerWords={loraInfo?.triggerWords || []}
                        onPositiveChange={(txt) => setGenerationResult({ meta: modelMeta || { category: 'custom', renderStyle: 'realistic', nsfwLevel: 1, modelFamily: 'flux', checkpoint: 'flux1-dev-fp8', steps: 28, cfg: 1, fluxGuidance: 3.5, sampler: 'euler', scheduler: 'simple', width: 1024, height: 1536, presetId: 'flux-portrait-sfw', reason: 'fallback' }, positive: txt })}
                        onNegativeChange={updateNegativePrompt}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── Step 1: 基础信息 ──────────────────────────────────────── */}
            {isFormStep && !creating && (
              <motion.div
                key={`form-${step}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                className="space-y-4"
              >
                {loadingData ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-white/30" />
                  </div>
                ) : (
                  <>
                    {/* Companions rail — show user's existing companions */}
                    {isFormStep && companions.length > 0 && (
                      <Panel
                        title={t('create.yourCompanions')}
                        hint={t('create.yourCompanionsHint')}
                      >
                        <div className="creator-rail -mx-1 flex gap-3 overflow-x-auto px-1 pb-2.5">
                          {companions.map((gf) => {
                            const gfName = String(gf.name || '');
                            const gfPortrait = String(gf.portrait_url || gf.avatar_url || '');
                            const gfRarity = String(gf.rarity || '');
                            return (
                              <div
                                key={String(gf.id)}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleSelectCompanion(gf)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectCompanion(gf); }}
                                className={cn(
                                  'group relative aspect-[3/4] w-36 shrink-0 cursor-pointer overflow-hidden rounded-[22px] border text-left transition-all duration-300 sm:w-40',
                                  selectedCompanionId === String(gf.id)
                                    ? 'border-[#FF2D78]/90 ring-2 ring-[#FF2D78]/50 shadow-[0_0_24px_rgba(255,45,120,0.4)] scale-[1.03]'
                                    : 'border-white/[0.09] shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:border-[#FF2D78]/40 hover:shadow-[0_0_16px_rgba(255,45,120,0.15)]',
                                )}
                              >
                                {gfPortrait && gfPortrait !== 'null' ? (
                                  <OptimizedImg
                                    src={gfPortrait}
                                    size="card"
                                    alt={gfName}
                                    className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.06]"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#FF2D78]/15 via-white/[0.03] to-[#8b5cf6]/20">
                                    <User2 className="h-10 w-10 text-white/15" />
                                  </div>
                                )}

                                {/* Rarity badge */}
                                {gfRarity && gfRarity !== 'null' && gfRarity !== '' && (
                                  <span
                                    className={cn(
                                      'absolute right-2 top-2 z-10 rounded-md px-1.5 py-0.5 text-[9px] font-black tracking-wider backdrop-blur-sm',
                                      gfRarity === 'SSR' && 'bg-gradient-to-r from-amber-300 to-yellow-500 text-amber-950 shadow-[0_0_12px_rgba(251,191,36,0.55)]',
                                      gfRarity === 'SR' && 'bg-violet-500/85 text-white shadow-[0_0_10px_rgba(139,92,246,0.5)]',
                                      gfRarity === 'R' && 'bg-sky-500/85 text-white',
                                      gfRarity === 'N' && 'bg-black/55 text-white/75',
                                    )}
                                  >
                                    {gfRarity}
                                  </span>
                                )}

                                {/* Selected check */}
                                {selectedCompanionId === String(gf.id) && (
                                  <motion.span
                                    className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] shadow-[0_0_12px_rgba(255,45,120,0.6)]"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                                  >
                                    <Check className="h-3.5 w-3.5 text-white" />
                                  </motion.span>
                                )}
                                {/* Bottom gradient overlay: name */}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2.5 pb-2.5 pt-10">
                                  <div className="truncate text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                    {gfName}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="mt-1.5 text-[10px] text-white/25">
                          {t('create.tapToPrefill')}
                        </p>
                      </Panel>
                    )}

                    {/* Dossier preview + core identity — 左右三七分 */}
                    <div className="grid gap-4 lg:grid-cols-[3fr_7fr]">
                      {/* Live dossier card */}
                      <div className="relative hidden overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#FF2D78]/[0.07] via-white/[0.02] to-transparent shadow-[0_8px_32px_rgba(0,0,0,0.28)] lg:block">
                        <div className="sticky top-4 p-5">
                          {/* Portrait preview — live preview of companion being created */}
                          <div className="relative mx-auto aspect-[3/4] w-full overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.03] shadow-[0_12px_40px_rgba(139,92,246,0.18)]">
                            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] shadow-[inset_0_0_40px_rgba(139,92,246,0.15)]">
                                <User2 className="h-10 w-10 text-white/15" />
                              </div>
                              <span className="text-[10px] text-white/25">
                                {t('create.createPreview')}
                              </span>
                            </div>
                          </div>
                          <div className="mt-4 text-center">
                            <div className="text-base font-bold text-white/90">
                              {name.trim() || (t('create.unnamed'))}
                            </div>
                            <div className="mt-0.5 text-[11px] text-white/40">
                              {age}{t('create.yearsOld')} · {ethnicity} · {bodyType}
                            </div>
                            <div className="mt-1 text-[11px] text-white/30">{shortDescription || (t('create.taglineExample'))}</div>
                          </div>
                          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                            {[hairStyle, `${eyeColor} eyes`, fashionStyle, ...selectedTags.slice(0, 2)].filter(Boolean).map((chip) => (
                              <span key={chip} className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-white/50">{chip}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right column: options */}
                      <div className="space-y-4">
                        {/* ── 人设步：身份档案 ── */}
                        {step === 'identity' && (
                        <Panel title={t('create.identity')}>
                          <div className="grid grid-cols-[1fr_auto] gap-3">
                            <div>
                              <label className="mb-1.5 block text-[11px] text-white/40">
                                {t('create.name')} *
                              </label>
                              <input
                                ref={nameInputRef}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('create.namePlaceholder')}
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm outline-none transition-all focus:border-[#FF2D78]/50 focus:shadow-[0_0_0_3px_rgba(255,45,120,0.10)]"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-[11px] text-white/40">
                                {t('create.age')}
                              </label>
                              <input
                                type="number"
                                min={18}
                                max={45}
                                value={age}
                                onChange={(e) => setAge(Number(e.target.value))}
                                className="h-11 w-24 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm outline-none transition-all focus:border-[#FF2D78]/50 focus:shadow-[0_0_0_3px_rgba(255,45,120,0.10)]"
                              />
                            </div>
                          </div>
                          <div className="mt-3">
                            <label className="mb-1.5 block text-[11px] text-white/40">
                              {t('create.tagline')}
                            </label>
                            <input
                              value={shortDescription}
                              onChange={(e) => setShortDescription(e.target.value)}
                              placeholder={t('create.taglinePlaceholder')}
                              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm outline-none transition-all focus:border-[#FF2D78]/50 focus:shadow-[0_0_0_3px_rgba(255,45,120,0.10)]"
                            />
                          </div>
                        </Panel>
                        )}

                        {/* ── 风格步（golove Style）：视觉风格卡 + 性别 ── */}
                        {step === 'style' && (
                        <Panel title={t('create.stepStyle')}>
                          {/* Visual style cards — artwork preview */}
                          <div className="mb-4 grid grid-cols-3 gap-2.5">
                            {getOpts('visual_style').map((v) => {
                              const activeStyle = visualStyle === v.value;
                              const preview = stylePreviews[v.value];
                              return (
                                <button
                                  key={v.value}
                                  type="button"
                                  onClick={() => setVisualStyle(v.value)}
                                  className={cn(
                                    'group relative aspect-[3/4] overflow-hidden rounded-[20px] border text-left transition-all duration-300 touch-manipulation',
                                    activeStyle
                                      ? 'border-[#FF2D78]/90 ring-2 ring-[#FF2D78]/50 shadow-[0_0_24px_rgba(255,45,120,0.4)]'
                                      : 'border-white/[0.09] shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:border-white/25',
                                  )}
                                >
                                  {preview ? (
                                    // 取消遮罩：示例图按 3:4 比例正常填充整卡，不裁剪上下
                                    <OptimizedImg
                                      src={preview}
                                      size="card"
                                      alt={getLabel(v, locale)}
                                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                    />
                                  ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-[#FF2D78]/15 via-white/[0.03] to-[#8b5cf6]/20" />
                                  )}
                                  {/* Admin 就地管理：上传/恢复默认 */}
                                  {isAdmin && (
                                    <AdminCardButtons
                                      busy={assetBusy === `style:${v.value}`}
                                      onUpload={() => pickAssetImage('style', v.value)}
                                      onClear={() => void clearAssetImage('style', v.value)}
                                      clearTitle={t('create.adminResetDefault')}
                                      clearIcon="reset"
                                    />
                                  )}
                                  {activeStyle && (
                                    <motion.span
                                      className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] shadow-[0_0_12px_rgba(255,45,120,0.6)]"
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                                    >
                                      <Check className="h-3.5 w-3.5 text-white" />
                                    </motion.span>
                                  )}
                                  {/* 竞品同款底部 pill 标签：选中=品牌粉实心，未选=black/50 毛玻璃 */}
                                  <div className="absolute inset-x-0 bottom-0 flex justify-center pb-3">
                                    <span
                                      className={cn(
                                        'rounded-full px-3.5 py-1 text-xs font-semibold backdrop-blur transition-all',
                                        activeStyle
                                          ? 'bg-[#FF2D78] text-white shadow-[0_0_16px_rgba(255,45,120,0.5)]'
                                          : 'bg-black/50 text-white/85',
                                      )}
                                    >
                                      {getLabel(v, locale)}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* 风格 LoRA 预览：不同风格生图时自动挂载对应 LoRA（后端 auto-lora 同源） */}
                          {(() => {
                            const loras = STYLE_LORA_PREVIEW[visualStyle];
                            return loras && loras.length > 0 ? (
                              <div className="mt-3">
                                <div className="mb-1.5 text-[11px] text-white/40">{t('create.styleLoraStack')}</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {loras.map((l) => (
                                    <span
                                      key={l}
                                      className="rounded-full border border-[#8b5cf6]/35 bg-[#8b5cf6]/10 px-2.5 py-1 text-[10px] font-medium text-violet-200"
                                    >
                                      {l}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null;
                          })()}
                        </Panel>
                        )}

                        {/* ── 性别步：性别选择（卡片式） ── */}
                        {step === 'gender' && (
                        <Panel title={t('create.gender')}>
                          {(() => {
                            const allGenders = getOpts('gender');
                            const canonical = allGenders.filter((o) =>
                              (CANONICAL_GENDERS as readonly string[]).includes(o.value),
                            );
                            const genderOpts = canonical.length ? canonical : allGenders;
                            return genderOpts.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2.5">
                              {genderOpts.map((o) => {
                                const activeGender = gender === o.value;
                                const gKey = GENDER_PREVIEW_KEYOF[o.value] || o.value.toLowerCase();
                                const gPreview = genderPreviews[gKey];
                                return (
                                  <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => setGender(o.value)}
                                    className={cn(
                                      'group relative aspect-[3/4] overflow-hidden rounded-[20px] border text-left transition-all duration-300 touch-manipulation',
                                      activeGender
                                        ? 'border-[#FF2D78]/90 ring-2 ring-[#FF2D78]/50 shadow-[0_0_24px_rgba(255,45,120,0.4)]'
                                        : 'border-white/[0.09] shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:border-white/25',
                                    )}
                                  >
                                    {gPreview ? (
                                      <OptimizedImg
                                        src={gPreview}
                                        size="card"
                                        alt={getLabel(o, locale)}
                                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                      />
                                    ) : (
                                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#FF2D78]/15 via-white/[0.03] to-[#8b5cf6]/20">
                                        <span aria-hidden className="text-4xl text-white/25">
                                          {GENDER_SYMBOLS[o.value] || '⚧'}
                                        </span>
                                      </div>
                                    )}
                                    {isAdmin && (
                                      <AdminCardButtons
                                        busy={assetBusy === `gender:${gKey}`}
                                        onUpload={() => pickAssetImage('gender', gKey)}
                                        onClear={() => void clearAssetImage('gender', gKey)}
                                        clearTitle={t('create.adminDeleteImage')}
                                        clearIcon="trash"
                                      />
                                    )}
                                    {activeGender && (
                                      <motion.span
                                        className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] shadow-[0_0_12px_rgba(255,45,120,0.6)]"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                                      >
                                        <Check className="h-3.5 w-3.5 text-white" />
                                      </motion.span>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 flex justify-center pb-3">
                                      <span
                                        className={cn(
                                          'rounded-full px-3.5 py-1 text-xs font-semibold backdrop-blur transition-all',
                                          activeGender
                                            ? 'bg-[#FF2D78] text-white shadow-[0_0_16px_rgba(255,45,120,0.5)]'
                                            : 'bg-black/50 text-white/85',
                                        )}
                                      >
                                        {getLabel(o, locale)}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            ) : null;
                          })()}
                        </Panel>
                        )}

                        {/* ── 种族/发型步：种族 / 发型 / 发色 (可视化卡片) ── */}
                        {step === 'race_hair' && (
                        <Panel title={t('create.stepFace')} hint={t('create.genderTailored')}>
                          {/* Ethnicity Cards - 8 options max */}
                          {(() => {
                            const options = getOpts('ethnicity').map((o) => ({
                              value: o.value,
                              label: getLabel(o, locale),
                              description: getExtra(o, 'desc', locale),
                              image: presetPreviewImage('ethnicity', o.value),
                              imagePlaceholder: '🌍',
                            }));
                            return options.length > 0 && (
                              <CharacterPresetCard
                                options={options.slice(0, 8)}
                                selected={ethnicity}
                                onSelect={setEthnicity}
                                title={t('create.ethnicity')}
                                columns={4}
                                showDescription
                                cardVariant="large"
                                renderAdminOverlay={presetAdminOverlay('ethnicity')}
                              />
                            );
                          })()}                        
                          
                          {/* Hair Style Cards - 8 options max（按性别过滤） */}
                          {(() => {
                            const options = genderFilteredOpts('hair_style').map((o) => ({
                              value: o.value,
                              label: getLabel(o, locale),
                              description: getExtra(o, 'desc', locale),
                              image: presetPreviewImage('hair_style', o.value),
                              imagePlaceholder: '💇️',
                            }));
                            return options.length > 0 && (
                              <CharacterPresetCard
                                options={options.slice(0, 8)}
                                selected={hairStyle}
                                onSelect={setHairStyle}
                                title={t('create.hairStyle')}
                                columns={4}
                                showDescription
                                cardVariant="large"
                                renderAdminOverlay={presetAdminOverlay('hair_style')}
                              />
                            );
                          })()}
                        
                          {/* Eye Color Cards */}


                          {/* Hair color swatches */}
                          <div className="mb-3">
                            <div className="mb-1.5 text-[11px] text-white/40">{t('create.hairColor')}</div>
                            <div className="flex flex-wrap gap-2">
                              {getOpts('hair_color').map((c) => (
                                <button
                                  key={c.value}
                                  type="button"
                                  title={getLabel(c, locale)}
                                  onClick={() => setHairColor(c.value)}
                                  className={cn(
                                    'h-9 w-9 rounded-full border-2 transition-transform',
                                    hairColor === c.value ? 'border-white scale-110 ring-2 ring-[#FF2D78]' : 'border-white/20',
                                  )}
                                  style={{ background: c.value }}
                                />
                              ))}
                            </div>
                          </div>

                        </Panel>
                        )}

                        {/* ── 身材/服装步：体型 / 穿搭风格 / 额外备注 (可视化卡片) ── */}
                        {step === 'body_fashion' && (
                        <Panel title={t('create.stepBody')} hint={t('create.genderTailored')}>
                          {/* Body Type Cards - 8 options max（按性别过滤） */}
                          {(() => {
                            const options = genderFilteredOpts('body_type').map((o) => ({
                              value: o.value,
                              label: getLabel(o, locale),
                              description: getExtra(o, 'desc', locale),
                              image: presetPreviewImage('body_type', o.value),
                              imagePlaceholder: '💪',
                            }));
                            return options.length > 0 && (
                              <CharacterPresetCard
                                options={options.slice(0, 8)}
                                selected={bodyType}
                                onSelect={setBodyType}
                                title={t('create.bodyType')}
                                columns={4}
                                showDescription
                                cardVariant="large"
                                renderAdminOverlay={presetAdminOverlay('body_type')}
                              />
                            );
                          })()}
                        
                          {/* Fashion Style Cards - 8 options max */}
                          {(() => {
                            const options = getOpts('fashion_style').map((o) => ({
                              value: o.value,
                              label: getLabel(o, locale),
                              description: getExtra(o, 'desc', locale),
                              image: presetPreviewImage('fashion_style', o.value),
                              imagePlaceholder: '👗',
                            }));
                            return options.length > 0 && (
                              <CharacterPresetCard
                                options={options.slice(0, 8)}
                                selected={fashionStyle}
                                onSelect={setFashionStyle}
                                title={t('create.fashionStyle')}
                                columns={4}
                                showDescription
                                cardVariant="large"
                                renderAdminOverlay={presetAdminOverlay('fashion_style')}
                              />
                            );
                          })()}
                        
                          {/* Extra notes */}
                          <div className="mt-3">
                            <div className="mb-1.5 text-[11px] text-white/40">
                              {t('create.extraNotes')}
                            </div>
                            <textarea
                              value={appearancePrompt}
                              onChange={(e) => setAppearancePrompt(e.target.value)}
                              placeholder={t('create.extraNotesPlaceholder')}
                              rows={2}
                              className="w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm outline-none transition-all focus:border-[#FF2D78]/50 focus:shadow-[0_0_0_3px_rgba(255,45,120,0.10)]"
                            />
                          </div>
                        </Panel>
                        )}

                        {/* ── 身份步（Identity）：性格灵魂 / 声音 ── */}
                        {step === 'identity' && (
                        <>
                        <Panel title={t('create.personalitySoul')}>
                          <div className="mb-3">
                            <div className="mb-1.5 text-[11px] text-white/40">
                              {t('create.personalityTags')} ({selectedTags.length}/8)
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {getOpts('personality_tag').map((tag) => (
                                <Pill key={tag.value} active={selectedTags.includes(tag.value)} onClick={() => toggleTag(tag.value)}>
                                  {getLabel(tag, locale)}
                                </Pill>
                              ))}
                            </div>
                          </div>
                          {getOpts('occupation').length > 0 && (
                            <div className="mb-3">
                              <div className="mb-1.5 text-[11px] text-white/40">{t('create.occupation')}</div>
                              <div className="flex flex-wrap gap-2">
                                {getOpts('occupation').map((o) => (
                                  <Pill key={o.value} active={occupation === o.value} onClick={() => setOccupation(o.value)}>
                                    {getLabel(o, locale)}
                                  </Pill>
                                ))}
                              </div>
                            </div>
                          )}
                          <div>
                            <div className="mb-1.5 text-[11px] text-white/40">{t('create.relationship')}</div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {getOpts('relationship').map((r) => (
                                <button
                                  key={r.value}
                                  type="button"
                                  onClick={() => setRelationship(r.value)}
                                  className={cn(
                                    'rounded-2xl border p-3 text-left transition-all touch-manipulation',
                                    relationship === r.value
                                      ? 'border-[#FF2D78]/70 bg-[#FF2D78]/10 shadow-[0_0_18px_rgba(255,45,120,0.2)]'
                                      : 'border-white/[0.09] bg-white/[0.03] hover:border-white/25',
                                  )}
                                >
                                  <div className="text-sm font-semibold">{getLabel(r, locale)}</div>
                                  <div className="mt-0.5 text-[10px] text-white/40">{getExtra(r, 'desc', locale)}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        </Panel>

                        {/* ── Voice ── */}
                        <Panel title={t('create.voiceTitle')}>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-[11px] text-white/40">
                              {t('create.voiceSubtitle')}
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!selectedVoice) {
                                  setError(t('create.selectVoiceFirst'));
                                  return;
                                }
                                const timbre = VOICE_TIMBRES.find(t => t.id === selectedVoice);
                                if (!timbre) return;
                                
                                setGeneratingWelcome(true);
                                try {
                                  const response = await authedFetch('/api/creator/generate-welcome', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ timbreId: selectedVoice }),
                                  });
                                  
                                  if (!response.ok) throw new Error('Failed');
                                  
                                  const data = await response.json();
                                  setWelcomeMessage(data.message || '');
                                  setMessageLocale(locale === 'zh' ? 'zh' : 'en');
                                } catch (error) {
                                  console.error('Generate welcome message failed:', error);
                                  setError(t('create.genWelcomeFailed'));
                                } finally {
                                  setGeneratingWelcome(false);
                                }
                              }}
                              disabled={generatingWelcome}
                              className="flex items-center gap-1 rounded-full border border-[#FF2D78]/30 bg-[#FF2D78]/10 px-3 py-1.5 text-[11px] font-medium text-[#FF2D78] transition-colors hover:bg-[#FF2D78]/20 disabled:opacity-50"
                            >
                              {generatingWelcome ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Wand2 className="h-3 w-3" />
                              )}
                              {t('create.generateWelcome')}
                            </button>
                          </div>
                          
                          {/* Welcome message display */}
                          {welcomeMessage && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mb-3 rounded-xl border border-[#FF2D78]/30 bg-gradient-to-br from-[#FF2D78]/5 to-transparent p-3"
                            >
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 text-lg">💬</span>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-white leading-relaxed">
                                    {welcomeMessage}
                                  </p>
                                  <div className="mt-1.5 flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => navigator.clipboard.writeText(welcomeMessage)}
                                      className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-[9px] text-white/50 hover:border-[#FF2D78]/40 hover:text-white"
                                    >
                                      {t('common.copy')}
                                    </button>
                                    <span className="text-[9px] text-white/30">
                                      {locale === 'zh' ? '中文' : 'English'} · {messageLocale}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            {VOICE_TIMBRES.map(timbre => (
                              <button
                                key={timbre.id}
                                type="button"
                                onClick={() => setSelectedVoice(selectedVoice === timbre.id ? '' : timbre.id)}
                                className={cn(
                                  'relative rounded-xl border p-3 text-left transition-all',
                                  selectedVoice === timbre.id
                                    ? 'border-[#ff6ba6]/60 bg-[#ff6ba6]/10 ring-1 ring-[#ff6ba6]/30'
                                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                                )}
                              >
                                {selectedVoice === timbre.id && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#ff6ba6] text-[10px] text-white">{'✓'}</span>
                                )}
                                <span className="text-lg">{timbre.icon}</span>
                                <div className="mt-1 text-xs font-semibold text-white/90">
                                  {locale === 'zh' ? timbre.nameZh : timbre.nameEn}
                                </div>
                                <div className="mt-0.5 text-[10px] leading-tight text-white/40 line-clamp-2">
                                  {locale === 'zh' ? timbre.descZh : timbre.descEn}
                                </div>
                              </button>
                            ))}
                          </div>
                        </Panel>


                        </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* ─── Step 2: 选择立绘 ──────────────────────────────────────── */}
            {step === 'portrait' && (
              <motion.div
                key="portrait"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
              >
                <div className="mb-4 text-center">
                  <h2 className="text-lg font-bold text-white/90">
                    {t('create.chooseHerLook')}
                  </h2>
                  <p className="mt-1 text-xs text-white/40">
                    {batchRunning
                      ? (t('create.forgingPortraits'))
                      : readyCount > 0
                        ? (t('create.tapFavoriteToFinish'))
                        : (t('create.pickWhenReady'))}
                  </p>
                </div>

                {/* 内容级别选择已移除：固定默认级别随请求提交 */}

                {/* 4 portrait cards — 2 行：写实 + 二次元，各 2 选 1 */}
                <div className="mx-auto w-full max-w-[1020px] space-y-4">
                  {/* Row 1: Realistic */}
                  <div>
                    <div className="mb-2 text-center">
                      <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-white/60">
                        {t('create.realisticStyle')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {slots.slice(0, 2).map((slot, idx) => (
                        <PortraitCard key={idx} slot={slot} idx={idx} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} t={t} />
                      ))}
                    </div>
                  </div>
                  {/* Row 2: Anime */}
                  <div>
                    <div className="mb-2 text-center">
                      <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-white/60">
                        {t('create.animeStyle')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {slots.slice(2, 4).map((slot, idx) => (
                        <PortraitCard key={idx + 2} slot={slot} idx={idx + 2} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} t={t} />
                      ))}
                    </div>
                  </div>
                </div>

                {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}
              </motion.div>
            )}
          </AnimatePresence>

          {error && isFormStep && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        className="shrink-0 sticky bottom-0 z-30 flex items-center justify-between gap-3 border-t border-white/10 bg-[#0a0612]/96 backdrop-blur-xl px-4 py-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={goPrevStep}
          disabled={creating}
          className="h-11 min-w-[5.5rem] px-4 rounded-full border border-white/10 text-sm flex items-center justify-center gap-1 touch-manipulation hover:bg-white/[0.04] disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> {t('create.back')}
        </button>

        {step === 'identity' ? (
          <GamePrimaryButton
            className="h-11 px-6 touch-manipulation"
            disabled={!infoValid || !generalValid || noCards || loadingData || creating}
            onClick={startPortraitStep}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {creating
              ? t('create.creating')
              : noCards
                ? t('create.noCards')
                : t('create.startCreation')}
            {!creating && <ArrowRight className="h-4 w-4" />}
          </GamePrimaryButton>
        ) : step !== 'portrait' ? (
          <GamePrimaryButton
            className="h-11 px-6 touch-manipulation"
            onClick={goNextStep}
          >
            {t('create.next')}
            <ArrowRight className="h-4 w-4" />
          </GamePrimaryButton>
        ) : (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={batchRunning}
              onClick={() => void runBatch(undefined, generatedPrompt || undefined)}
              className="h-11 px-4 rounded-full border border-[#8b5cf6]/40 bg-[#8b5cf6]/10 text-sm text-violet-200 flex items-center justify-center gap-1.5 touch-manipulation hover:bg-[#8b5cf6]/20 disabled:opacity-40"
            >
              <RefreshCw className={cn('h-4 w-4', batchRunning && 'animate-spin')} />
              {t('create.regenerate')}
            </button>
            <GamePrimaryButton
              className="h-11 px-6 touch-manipulation"
              disabled={selectedSlot < 0 || saving || !slots[selectedSlot]?.url}
              onClick={handleSubmit}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t('create.finishCreation')}
            </GamePrimaryButton>
          </div>
        )}
        
        {/* ─── Integration: Settings button for advanced controls ──────────── */}
        {step === 'portrait' && (
          <button
            type="button"
            onClick={toggleSettings}
            className="h-11 w-11 flex items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-white/60 hover:border-[#FF2D78]/40 hover:text-[#FF2D78] transition-all touch-manipulation"
            title={'Advanced Settings'}
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Admin 就地管理：隐藏文件选择器（风格/性别/预设共用） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void handleAssetFile(e)}
      />

      {/* Gacha-style success reveal */}
      <CreateSuccessModal
        companion={reveal}
        onGoChat={handleGoChat}
        onCreateAnother={handleCreateAnother}
      />

      {/* 创建卡购买弹窗（顶部「+」触发） */}
      <BuyCardsModal
        open={buyCardsOpen}
        onClose={() => setBuyCardsOpen(false)}
        onPurchased={() => void refreshCards()}
      />

      {/* ─── Integration: Advanced Settings Modal ──────────────────────────── */}
      <GenerationSettings
        isOpen={isSettingsOpen}
        onClose={closeSettings}
        steps={generationSettings.steps}
        cfg={generationSettings.cfg}
        fluxGuidance={generationSettings.fluxGuidance}
        width={generationSettings.width}
        height={generationSettings.height}
        aspectRatio={generationSettings.aspectRatio}
        sampler={generationSettings.sampler}
        scheduler={generationSettings.scheduler}
        seed={generationSettings.seed}
        randomSeed={generationSettings.randomSeed}
        onSettingsChange={(newSettings) => {
          updateSettings(newSettings);
          saveDraftToLocalStorage(); // Auto-save changes
        }}
      />
    </GameShell>
  );
}
