'use client';

/**
 * Character Creator v3 — game-style companion creation.
 *
 * Step 1 "基础信息": card-style panels for appearance + identity (optional
 *         preset quick-start rail).
 * Step 2 "选择立绘": 4 AI portraits generated side by side; pick one, finish.
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
  CreditCard, RefreshCw, ImagePlus,
} from 'lucide-react';
import { GameShell, GamePrimaryButton } from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import { companionScore, type Rarity } from '@/lib/rarity';
import { CreateSuccessModal, type CreatedCompanionReveal } from '@/components/creator/CreateSuccessModal';
import type { CreatorPreset } from '@/lib/creator-presets';
import type { CharacterPart } from '@/lib/character-parts';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
const STYLE_PREVIEWS: Record<string, string> = {
  realistic:
    'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/style-previews/realistic.png',
  anime:
    'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/style-previews/anime.png',
  '3d': 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/style-previews/3d.png',
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CreatePage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';

  // Steps: info → portrait
  const [step, setStep] = useState<'info' | 'portrait'>('info');

  // Data from backend
  const [presets, setPresets] = useState<CreatorPreset[]>([]);
  const [options, setOptions] = useState<Record<string, OptionItem[]>>({});
  const [vibes, setVibes] = useState<Record<string, { en: string; zh: string }>>({});
  const [parts, setParts] = useState<Record<string, CharacterPart[]>>({});
  const [cardStatus, setCardStatus] = useState<CardStatus | null>(null);
  const [loadingData, setLoadingData] = useState(true);

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
  const [name, setName] = useState('');
  const [age, setAge] = useState(22);
  const [shortDescription, setShortDescription] = useState('');
  const [relationship, setRelationship] = useState('girlfriend');
  const [selectedPreset, setSelectedPreset] = useState<CreatorPreset | null>(null);

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

  // ─── Data fetching ───────────────────────────────────────────────────────

  const fetchCreatorData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [optsRes, cardsRes, partsRes] = await Promise.all([
        fetch('/api/creator/presets?section=all'),
        authedFetch('/api/creator/cards'),
        fetch('/api/creator/parts'),
      ]);
      const optsData = await readResponseJson<{ presets?: CreatorPreset[]; options?: Record<string, OptionItem[]>; vibes?: Record<string, { en: string; zh: string }> }>(optsRes);
      const cardsData = await readResponseJson<CardStatus>(cardsRes);
      const partsData = await readResponseJson<{ categories?: Record<string, CharacterPart[]> }>(partsRes);

      if (optsData.options) setOptions(optsData.options);
      if (optsData.presets) setPresets(optsData.presets);
      if (optsData.vibes) setVibes(optsData.vibes);
      if (cardsData) setCardStatus(cardsData);
      if (partsData.categories) setParts(partsData.categories);
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

  const applyPreset = useCallback((preset: CreatorPreset) => {
    setSelectedPreset(preset);
    setVisualStyle(preset.visual_style);
    setGender(preset.gender);
    setEthnicity(preset.ethnicity);
    setFaceShape(preset.face_shape);
    setHairStyle(preset.hair_style);
    setHairColor(preset.hair_color);
    setEyeColor(preset.eye_color);
    setBodyType(preset.body_type);
    setFashionStyle(preset.fashion_style);
    setSelectedTags(preset.personality_tags.slice(0, 8));
    setOccupation(preset.occupation);
    setRelationship(preset.relationship);
    setShortDescription(preset.short_description);
    setName((prev) => (prev.trim() ? prev : preset.default_name || preset.name));
    setAge(preset.age && preset.age >= 18 ? preset.age : 22);
  }, []);

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
    // Preset cache: only when the look still matches the preset exactly
    preset_slug: selectedPreset && selectedPreset.gender === gender ? selectedPreset.slug : undefined,
  }), [name, visualStyle, ethnicity, gender, faceShape, hairStyle, hairColor, eyeColor, bodyType, fashionStyle, appearancePrompt, selectedTags, partPrompt, skinTone, selectedPreset]);

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

  const runBatch = useCallback(async () => {
    const run = ++batchRun.current;
    setBatchRunning(true);
    setError(null);
    setSelectedSlot(-1);
    setSlots(Array.from({ length: SLOT_COUNT }, () => ({ status: 'loading' as const })));
    try {
      const res = await authedFetch('/api/girlfriends/generate-portrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...portraitRequestBody(), count: SLOT_COUNT }),
      });
      const data = await readResponseJson<PortraitBatchResponse>(res);
      if (batchRun.current !== run) return;
      if (!res.ok) {
        setError(data.error || (zh ? '生成失败' : 'Generation failed'));
        setSlots(EMPTY_SLOTS);
        return;
      }

      // Normalize batch / legacy single responses
      const readyUrls: string[] = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
      const pendingJobs: Array<{ job_id: string; endpoint_id?: string }> = Array.isArray(data.pending_jobs) ? data.pending_jobs : [];
      const singleUrl = data.imageUrl || data.portrait_url || data.url;
      if (!readyUrls.length && singleUrl) readyUrls.push(singleUrl);
      if (!pendingJobs.length && data.pending && data.job_id) {
        pendingJobs.push({ job_id: data.job_id, endpoint_id: data.endpoint_id });
      }

      if (!readyUrls.length && !pendingJobs.length) {
        setError(zh ? '未返回图片，请稍后重试' : 'No image returned — try again');
        setSlots(EMPTY_SLOTS);
        return;
      }

      const next: PortraitSlot[] = Array.from({ length: SLOT_COUNT }, (_, i) => {
        if (readyUrls[i]) return { status: 'ready' as const, url: readyUrls[i] };
        const job = pendingJobs[i - readyUrls.length];
        if (job) return { status: 'loading' as const, jobId: job.job_id, endpointId: job.endpoint_id };
        return { status: 'idle' as const };
      });
      setSlots(next);

      // Poll pending jobs in parallel, each fills its own slot
      const pollTasks = next.map((slot, idx) => {
        if (slot.status !== 'loading' || !slot.jobId) return null;
        const jobId = slot.jobId;
        const endpointId = slot.endpointId;
        return pollJob(jobId, endpointId).then((url) => {
          if (batchRun.current !== run) return;
          setSlots((prev) => prev.map((s, i) => (i === idx
            ? (url ? { status: 'ready', url } : { status: 'error', error: zh ? '生成失败' : 'Failed' })
            : s)));
        });
      }).filter(Boolean);
      await Promise.all(pollTasks as Promise<void>[]);
    } catch (e) {
      if (batchRun.current === run) {
        logger.error(String(e));
        setError(errorMessageFromUnknown(e, zh ? '生成失败' : 'Generation failed'));
        setSlots(EMPTY_SLOTS);
      }
    } finally {
      if (batchRun.current === run) setBatchRunning(false);
    }
  }, [portraitRequestBody, pollJob, zh]);

  const startPortraitStep = useCallback(() => {
    if (!infoValid) {
      if (name.trim().length < 2) {
        setError(zh ? '请先输入角色名字（至少2个字符）' : 'Enter a name (at least 2 characters)');
        nameInputRef.current?.focus();
        nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setError(zh ? '请完善必填信息' : 'Please complete the required fields');
      }
      return;
    }
    setError(null);
    setStep('portrait');
    void runBatch();
  }, [infoValid, name, zh, runBatch]);

  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const chosen = slots[selectedSlot];
    if (!chosen?.url || saving) return;
    setSaving(true);
    setError(null);
    try {
      const relOpts = getOpts('relationship');
      const relMeta = relOpts.find((r) => r.value === relationship);
      const relLabel = relMeta ? getLabel(relMeta, locale) : (zh ? '伴侣' : 'Girlfriend');
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
          preset_slug: selectedPreset && selectedPreset.gender === gender ? selectedPreset.slug : undefined,
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
        if (data.code === 'SEAT_LIMIT') {
          setError(t('creator.seatLimit') || (zh ? '好友数量已达上限，升级套餐即可添加更多好友' : 'Friend limit reached — upgrade your plan to add more friends'));
          return;
        }
        if (data.code === 'NO_CARDS') {
          setError(t('creator.noCards') || (zh ? '创建卡已用完，请到商城购买' : 'No creation cards — buy more in Shop'));
          return;
        }
        setError(data.error || (zh ? '创建失败' : 'Create failed'));
        return;
      }

      if (data.cards_remaining !== undefined && cardStatus) {
        setCardStatus({ ...cardStatus, cards: data.cards_remaining });
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
      setError(errorMessageFromUnknown(e, zh ? '网络错误' : 'Network error'));
    } finally {
      setSaving(false);
    }
  }, [slots, selectedSlot, saving, getOpts, relationship, locale, zh, visualStyle, gender, faceShape, ethnicity, occupation, shortDescription, name, age, selectedTags, hairStyle, hairColor, eyeColor, bodyType, fashionStyle, skinTone, buildGenome, selectedPreset, appearancePrompt, cardStatus, t]);

  // ─── Reveal actions ──────────────────────────────────────────────────────

  const handleGoChat = useCallback(() => {
    const id = reveal?.id;
    setReveal(null);
    if (id) router.push(`/chat/${id}`);
    else router.push('/chats');
  }, [reveal, router]);

  const handleCreateAnother = useCallback(() => {
    setReveal(null);
    setSlots(EMPTY_SLOTS);
    setSelectedSlot(-1);
    setStep('info');
    void fetchCreatorData();
  }, [fetchCreatorData]);

  // ─── Derived UI bits ─────────────────────────────────────────────────────

  const readyCount = slots.filter((s) => s.status === 'ready').length;
  const stepLabels = [
    t('creator.stepInfo') || (zh ? '基础信息' : 'Basics'),
    t('creator.stepPortrait') || (zh ? '选择立绘' : 'Portrait'),
  ];
  const stepIndex = step === 'info' ? 0 : 1;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <GameShell className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden" innerClassName="flex flex-1 flex-col min-h-0">
      <PageHeader
        eyebrow="CREATOR"
        title={t('creator.title') || (zh ? '捏脸创建' : 'Create Companion')}
        subtitle={t('creator.subtitle') || (zh ? '基础信息 · 立绘生成 · 命运结算' : 'Basics · Portrait · Destiny')}
        backHref="/"
        sticky={false}
        className="shrink-0"
      />

      {/* Card balance + Stepper */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/[0.06]">
        {cardStatus && (
          <div className="flex items-center gap-1.5 text-[11px] text-white/50">
            <CreditCard className="h-3.5 w-3.5" />
            <span>{t('creator.creationCard') || (zh ? '创建卡' : 'Cards')}: </span>
            <span className={cn('font-bold', cardStatus.cards > 0 ? 'text-[#FF2D78]' : 'text-red-400')}>
              {cardStatus.cards}
            </span>
            {cardStatus.monthlyQuota > 0 && (
              <span className="text-white/30">/{cardStatus.monthlyQuota}{zh ? '月' : '/mo'}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          {stepLabels.map((label, idx) => {
            const active = idx === stepIndex;
            const done = idx < stepIndex;
            return (
              <div key={label} className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold',
                    active && 'bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white shadow-[0_0_16px_rgba(255,45,120,0.4)]',
                    done && 'bg-[#FF2D78]/80 text-white',
                    !active && !done && 'bg-white/5 text-white/40',
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : idx + 1}
                </div>
                <span className={cn('hidden sm:block text-[10px] font-medium', active ? 'text-white' : 'text-white/40')}>
                  {label}
                </span>
                {idx < stepLabels.length - 1 && (
                  <div className={cn('h-px w-6 sm:w-10', done ? 'bg-[#FF2D78]/50' : 'bg-white/10')} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pt-4 pb-6">
        <div className="mx-auto max-w-6xl">
          <AnimatePresence mode="wait">

            {/* ─── Step 1: 基础信息 ──────────────────────────────────────── */}
            {step === 'info' && (
              <motion.div
                key="info"
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
                    {/* Preset quick-start rail */}
                    {presets.length > 0 && (
                      <Panel
                        title={t('creator.quickStart') || (zh ? '快速开始 · 预设灵感' : 'Quick Start · Presets')}
                        hint={t('creator.quickStartHint') || (zh ? '点选自动填充，仍可自由修改' : 'Tap to auto-fill, still fully editable')}
                      >
                        <div className="creator-rail -mx-1 flex gap-3 overflow-x-auto px-1 pb-2.5">
                          {presets.map((preset) => {
                            const activePreset = selectedPreset?.id === preset.id;
                            const presetName = zh ? preset.name_zh : preset.name;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => applyPreset(preset)}
                                title={`${presetName} — ${zh ? preset.description_zh : preset.description}`}
                                className={cn(
                                  'group relative aspect-[3/4] w-36 shrink-0 overflow-hidden rounded-2xl border text-left transition-all duration-300 touch-manipulation sm:w-40',
                                  activePreset
                                    ? 'border-[#FF2D78]/90 ring-2 ring-[#FF2D78]/50 shadow-[0_0_28px_rgba(255,45,120,0.45)]'
                                    : 'border-white/[0.09] shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:border-[#FF2D78]/50 hover:shadow-[0_8px_28px_rgba(255,45,120,0.18)]',
                                )}
                              >
                                {preset.portrait_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={preset.portrait_url}
                                    alt={presetName}
                                    loading="lazy"
                                    decoding="async"
                                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#FF2D78]/15 via-white/[0.03] to-[#8b5cf6]/20">
                                    <User2 className="h-10 w-10 text-white/15" />
                                  </div>
                                )}

                                {/* Rarity badge */}
                                {preset.rarity && (
                                  <span
                                    className={cn(
                                      'absolute right-2 top-2 z-10 rounded-md px-1.5 py-0.5 text-[9px] font-black tracking-wider backdrop-blur-sm',
                                      preset.rarity === 'SSR' && 'bg-gradient-to-r from-amber-300 to-yellow-500 text-amber-950 shadow-[0_0_12px_rgba(251,191,36,0.55)]',
                                      preset.rarity === 'SR' && 'bg-violet-500/85 text-white shadow-[0_0_10px_rgba(139,92,246,0.5)]',
                                      preset.rarity === 'R' && 'bg-sky-500/85 text-white',
                                      preset.rarity === 'N' && 'bg-black/55 text-white/75',
                                    )}
                                  >
                                    {preset.rarity}
                                  </span>
                                )}

                                {/* Applied check */}
                                {activePreset && (
                                  <motion.span
                                    className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] shadow-[0_0_12px_rgba(255,45,120,0.6)]"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                                  >
                                    <Check className="h-3.5 w-3.5 text-white" />
                                  </motion.span>
                                )}

                                {/* Bottom gradient overlay: name + vibes */}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2.5 pb-2.5 pt-10">
                                  <div className="truncate text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                    {presetName}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {(preset.vibe_tags || []).slice(0, 2).map((v) => (
                                      <span
                                        key={v}
                                        className="rounded-full border border-[#FF2D78]/30 bg-[#FF2D78]/15 px-1.5 py-0.5 text-[9px] text-[#ffb3d1] backdrop-blur-sm"
                                      >
                                        {vibes[v] ? (zh ? vibes[v].zh : vibes[v].en) : v}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </Panel>
                    )}

                    {/* Dossier preview + core identity */}
                    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                      {/* Live dossier card */}
                      <div className="relative hidden overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#FF2D78]/[0.07] via-white/[0.02] to-transparent shadow-[0_8px_32px_rgba(0,0,0,0.28)] lg:block">
                        <div className="sticky top-4 p-5">
                          {/* Portrait preview — shows the applied preset's artwork */}
                          <div className="relative mx-auto aspect-[3/4] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_12px_40px_rgba(139,92,246,0.18)]">
                            {selectedPreset?.portrait_url ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={selectedPreset.portrait_url}
                                  alt={zh ? selectedPreset.name_zh : selectedPreset.name}
                                  className="h-full w-full object-cover"
                                />
                                <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
                                <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2">
                                  <span className="truncate text-[11px] font-semibold text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                    {zh ? selectedPreset.name_zh : selectedPreset.name}
                                  </span>
                                  {selectedPreset.rarity && (
                                    <span className="shrink-0 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-black text-amber-300 backdrop-blur-sm">
                                      {selectedPreset.rarity}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] shadow-[inset_0_0_40px_rgba(139,92,246,0.15)]">
                                  <User2 className="h-10 w-10 text-white/15" />
                                </div>
                                <span className="text-[10px] text-white/25">
                                  {zh ? '选择预设或生成立绘' : 'Pick a preset or generate'}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="mt-4 text-center">
                            <div className="text-base font-bold text-white/90">
                              {name.trim() || (zh ? '未命名角色' : 'Unnamed')}
                            </div>
                            <div className="mt-0.5 text-[11px] text-white/40">
                              {age}{zh ? '岁' : ' y/o'} · {ethnicity} · {bodyType}
                            </div>
                            <div className="mt-1 text-[11px] text-white/30">{shortDescription || (zh ? '一句话人设…' : 'A short tagline…')}</div>
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
                        <Panel title={t('creator.sectionIdentity') || (zh ? '身份档案' : 'Identity')}>
                          <div className="grid grid-cols-[1fr_auto] gap-3">
                            <div>
                              <label className="mb-1.5 block text-[11px] text-white/40">
                                {t('creator.name') || (zh ? '名字' : 'Name')} *
                              </label>
                              <input
                                ref={nameInputRef}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('creator.namePlaceholder') || (zh ? '她的名字' : 'Her name')}
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm outline-none transition-all focus:border-[#FF2D78]/50 focus:shadow-[0_0_0_3px_rgba(255,45,120,0.10)]"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-[11px] text-white/40">
                                {t('creator.age') || (zh ? '年龄' : 'Age')}
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
                              {t('creator.tagline') || (zh ? '一句话人设' : 'Tagline')}
                            </label>
                            <input
                              value={shortDescription}
                              onChange={(e) => setShortDescription(e.target.value)}
                              placeholder={t('creator.taglinePlaceholder') || (zh ? '深夜电台里的温柔声音…' : 'A soft voice on the late-night radio…')}
                              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm outline-none transition-all focus:border-[#FF2D78]/50 focus:shadow-[0_0_0_3px_rgba(255,45,120,0.10)]"
                            />
                          </div>
                        </Panel>

                        <Panel title={t('creator.sectionAppearance') || (zh ? '外观设定' : 'Appearance')}>
                          {/* Visual style cards — artwork preview */}
                          <div className="mb-4 grid grid-cols-3 gap-2.5">
                            {getOpts('visual_style').map((v) => {
                              const activeStyle = visualStyle === v.value;
                              const preview = STYLE_PREVIEWS[v.value];
                              return (
                                <button
                                  key={v.value}
                                  type="button"
                                  onClick={() => setVisualStyle(v.value)}
                                  className={cn(
                                    'group relative aspect-[3/4] overflow-hidden rounded-2xl border text-left transition-all duration-300 touch-manipulation',
                                    activeStyle
                                      ? 'border-[#FF2D78]/90 ring-2 ring-[#FF2D78]/50 shadow-[0_0_24px_rgba(255,45,120,0.4)]'
                                      : 'border-white/[0.09] shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:border-white/25',
                                  )}
                                >
                                  {preview ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={preview}
                                      alt={getLabel(v, locale)}
                                      loading="lazy"
                                      decoding="async"
                                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                                    />
                                  ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-[#FF2D78]/15 via-white/[0.03] to-[#8b5cf6]/20" />
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
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2.5 pb-2.5 pt-10">
                                    <div className="text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                      {getLabel(v, locale)}
                                    </div>
                                    <div className="mt-0.5 line-clamp-1 text-[10px] text-white/55">
                                      {getExtra(v, 'desc', locale)}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Pill groups */}
                          {[
                            { key: 'gender', title: t('creator.gender') || (zh ? '性别气质' : 'Gender'), items: getOpts('gender'), value: gender, set: setGender },
                            { key: 'ethnicity', title: t('creator.ethnicity') || (zh ? '种族 / 血统' : 'Ethnicity'), items: getOpts('ethnicity'), value: ethnicity, set: setEthnicity },
                            { key: 'face_shape', title: t('creator.faceShape') || (zh ? '脸型' : 'Face Shape'), items: getOpts('face_shape'), value: faceShape, set: setFaceShape },
                            { key: 'body_type', title: t('creator.bodyType') || (zh ? '体型' : 'Body Type'), items: getOpts('body_type'), value: bodyType, set: setBodyType },
                            { key: 'hair_style', title: t('creator.hairStyle') || (zh ? '发型' : 'Hair Style'), items: getOpts('hair_style'), value: hairStyle, set: setHairStyle },
                            { key: 'eye_color', title: t('creator.eyeColor') || (zh ? '瞳色' : 'Eye Color'), items: getOpts('eye_color'), value: eyeColor, set: setEyeColor },
                            { key: 'fashion_style', title: t('creator.fashionStyle') || (zh ? '服装风格' : 'Fashion Style'), items: getOpts('fashion_style'), value: fashionStyle, set: setFashionStyle },
                          ].map((group) => group.items.length > 0 && (
                            <div key={group.key} className="mb-3">
                              <div className="mb-1.5 text-[11px] text-white/40">{group.title}</div>
                              <div className="flex flex-wrap gap-2">
                                {group.items.map((o) => (
                                  <Pill key={o.value} active={group.value === o.value} onClick={() => group.set(o.value)}>
                                    {getLabel(o, locale)}
                                  </Pill>
                                ))}
                              </div>
                            </div>
                          ))}

                          {/* Skin tone from parts library */}
                          {(parts['skin_tone'] || []).length > 0 && (
                            <div className="mb-3">
                              <div className="mb-1.5 text-[11px] text-white/40">{t('creator.skinTone') || (zh ? '肤色' : 'Skin Tone')}</div>
                              <div className="flex flex-wrap gap-2">
                                {(parts['skin_tone'] || []).map((p) => (
                                  <Pill key={p.slug} active={skinTone === p.value} onClick={() => setSkinTone(p.value)}>
                                    {locale === 'zh' ? p.name_zh : p.name_en}
                                  </Pill>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Hair color swatches */}
                          <div className="mb-3">
                            <div className="mb-1.5 text-[11px] text-white/40">{t('creator.hairColor') || (zh ? '发色' : 'Hair Color')}</div>
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

                          {/* Extra notes */}
                          <div>
                            <div className="mb-1.5 text-[11px] text-white/40">
                              {t('creator.extraNotes') || (zh ? '补充描述（可选）' : 'Extra Notes (optional)')}
                            </div>
                            <textarea
                              value={appearancePrompt}
                              onChange={(e) => setAppearancePrompt(e.target.value)}
                              placeholder={t('creator.extraNotesPlaceholder') || (zh ? '例如：酒窝、右眼泪痣、雀斑' : 'e.g. dimples, freckles, beauty mark')}
                              rows={2}
                              className="w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm outline-none transition-all focus:border-[#FF2D78]/50 focus:shadow-[0_0_0_3px_rgba(255,45,120,0.10)]"
                            />
                          </div>
                        </Panel>

                        <Panel title={t('creator.personality') || (zh ? '性格与灵魂' : 'Personality & Soul')}>
                          <div className="mb-3">
                            <div className="mb-1.5 text-[11px] text-white/40">
                              {t('creator.personality') || (zh ? '性格标签' : 'Personality Tags')} ({selectedTags.length}/8)
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
                              <div className="mb-1.5 text-[11px] text-white/40">{t('creator.occupation') || (zh ? '职业' : 'Occupation')}</div>
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
                            <div className="mb-1.5 text-[11px] text-white/40">{t('creator.relationship') || (zh ? '关系定位' : 'Relationship')}</div>
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
                    {t('creator.pickOne') || (zh ? '选择她的模样' : 'Choose Her Look')}
                  </h2>
                  <p className="mt-1 text-xs text-white/40">
                    {batchRunning
                      ? (t('creator.generating') || (zh ? '正在注入灵魂，生成 4 张立绘…' : 'Forging 4 portraits…'))
                      : readyCount > 0
                        ? (t('creator.pickOneHint') || (zh ? '点选最喜欢的一张，完成创建' : 'Tap your favorite to finish'))
                        : (t('creator.portraitHint') || (zh ? '生成完成后可选择一张' : 'Pick one when ready'))}
                  </p>
                </div>

                {/* 4 portrait cards — first row side by side on desktop */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {slots.map((slot, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={slot.status !== 'ready'}
                      onClick={() => setSelectedSlot(idx)}
                      className={cn(
                        'group relative aspect-[3/4] overflow-hidden rounded-2xl border text-left transition-all',
                        slot.status === 'ready' && selectedSlot === idx
                          ? 'border-[#FF2D78] ring-2 ring-[#FF2D78]/60 shadow-[0_0_28px_rgba(255,45,120,0.45)] scale-[1.02]'
                          : slot.status === 'ready'
                            ? 'border-white/15 hover:border-[#FF2D78]/50 hover:shadow-[0_0_18px_rgba(255,45,120,0.2)]'
                            : 'border-white/[0.08] bg-white/[0.02]',
                      )}
                    >
                      {slot.status === 'ready' && slot.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={slot.url} alt={`portrait-${idx + 1}`} className="h-full w-full object-cover" />
                      ) : slot.status === 'loading' ? (
                        <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden">
                          {/* shimmer sweep */}
                          <motion.div
                            className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
                            animate={{ x: ['-100%', '300%'] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                          />
                          <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]/60" />
                          <span className="text-[10px] text-white/30">
                            {zh ? `生成中 ${idx + 1}/4` : `Generating ${idx + 1}/4`}
                          </span>
                        </div>
                      ) : slot.status === 'error' ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
                          <span className="text-[11px] text-red-400/80">{slot.error || (zh ? '生成失败' : 'Failed')}</span>
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
                            {zh ? `立绘 ${idx + 1}` : `Portrait ${idx + 1}`}
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
                        </>
                      )}
                    </button>
                  ))}
                </div>

                {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}
              </motion.div>
            )}
          </AnimatePresence>

          {error && step === 'info' && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        className="shrink-0 sticky bottom-0 z-30 flex items-center justify-between gap-3 border-t border-white/10 bg-[#0a0612]/96 backdrop-blur-xl px-4 py-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => {
            if (step === 'portrait') { setStep('info'); return; }
            router.push('/');
          }}
          className="h-11 min-w-[5.5rem] px-4 rounded-full border border-white/10 text-sm flex items-center justify-center gap-1 touch-manipulation hover:bg-white/[0.04]"
        >
          <ArrowLeft className="h-4 w-4" /> {t('creator.back') || (zh ? '上一步' : 'Back')}
        </button>

        {step === 'info' ? (
          <GamePrimaryButton
            className="h-11 px-6 touch-manipulation"
            disabled={!infoValid || noCards || loadingData}
            onClick={startPortraitStep}
          >
            <Wand2 className="h-4 w-4" />
            {noCards
              ? (t('creator.noCards') || (zh ? '创建卡已用完' : 'No cards'))
              : (t('creator.genPortraits') || (zh ? '生成立绘' : 'Generate Portraits'))}
            <ArrowRight className="h-4 w-4" />
          </GamePrimaryButton>
        ) : (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={batchRunning}
              onClick={() => void runBatch()}
              className="h-11 px-4 rounded-full border border-[#8b5cf6]/40 bg-[#8b5cf6]/10 text-sm text-violet-200 flex items-center justify-center gap-1.5 touch-manipulation hover:bg-[#8b5cf6]/20 disabled:opacity-40"
            >
              <RefreshCw className={cn('h-4 w-4', batchRunning && 'animate-spin')} />
              {t('creator.regenerate') || (zh ? '重新生成' : 'Regenerate')}
            </button>
            <GamePrimaryButton
              className="h-11 px-6 touch-manipulation"
              disabled={selectedSlot < 0 || saving || !slots[selectedSlot]?.url}
              onClick={handleSubmit}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t('creator.finishCreate') || (zh ? '完成创建' : 'Finish Creation')}
            </GamePrimaryButton>
          </div>
        )}
      </div>

      {/* Gacha-style success reveal */}
      <CreateSuccessModal
        companion={reveal}
        onGoChat={handleGoChat}
        onCreateAnother={handleCreateAnother}
      />
    </GameShell>
  );
}
