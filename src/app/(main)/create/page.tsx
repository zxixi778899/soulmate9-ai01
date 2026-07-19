'use client';

/**
 * Character Creator v2 — mobile-first, preset-driven, i18n-aware
 * Flow: Preset → Appearance → Personality & Identity
 * Options loaded from backend (creator_option_pool table).
 */

import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { readResponseJson, errorMessageFromUnknown } from '@/lib/safe-json';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { notifyDataChange } from '@/hooks/useDataSync';
import {
  Save, ArrowLeft, ArrowRight, Wand2, Loader2, Sparkles, Check, User2,
  CreditCard, SkipForward, Palette,
} from 'lucide-react';
import { GameShell, GamePrimaryButton } from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';

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

interface CharacterPreset {
  id: string;
  name: string;
  description: string;
  thumbnail_url?: string;
  visual_style: string;
  gender: string;
  ethnicity: string;
  face_shape: string;
  hair_style: string;
  hair_color: string;
  eye_color: string;
  body_type: string;
  fashion_style: string;
  personality_tags: string[];
  voice: string;
  occupation: string;
  relationship: string;
  age: number;
}

interface CardStatus {
  cards: number;
  monthlyQuota: number;
  tier: string;
  canCreate: boolean;
}

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

// ─── Pill Component ──────────────────────────────────────────────────────────

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-white/90 mb-2.5 flex items-center gap-2">
        <span className="h-1 w-1 rounded-full bg-[#FF2D78]" />
        {title}
      </h3>
      {children}
    </section>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CreatePage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';

  // Steps: 0 = preset, 1 = appearance, 2 = personality & identity
  const [step, setStep] = useState(0);
  const stepLabels = [
    t('creator.stepPreset') || (zh ? '选择预设' : 'Choose Preset'),
    t('creator.stepLook') || (zh ? '外观' : 'Appearance'),
    t('creator.stepIdentity') || (zh ? '人设' : 'Identity'),
  ];

  // Data from backend
  const [presets, setPresets] = useState<CharacterPreset[]>([]);
  const [options, setOptions] = useState<Record<string, OptionItem[]>>({});
  const [cardStatus, setCardStatus] = useState<CardStatus | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Form state
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [visualStyle, setVisualStyle] = useState('realistic');
  const [gender, setGender] = useState('Female');
  const [ethnicity, setEthnicity] = useState('Asian');
  const [faceShape, setFaceShape] = useState('Oval');
  const [hairStyle, setHairStyle] = useState('Long Flowing');
  const [hairColor, setHairColor] = useState('#d4a574');
  const [eyeColor, setEyeColor] = useState('Brown');
  const [bodyType, setBodyType] = useState('Slim');
  const [fashionStyle, setFashionStyle] = useState('Casual');
  const [appearancePrompt, setAppearancePrompt] = useState('');

  const [selectedTags, setSelectedTags] = useState<string[]>(['Romantic', 'Playful']);
  const [voice, setVoice] = useState('soft');
  const [occupation, setOccupation] = useState('Student');
  const [hobbies, setHobbies] = useState('');

  const [name, setName] = useState('');
  const [age, setAge] = useState(22);
  const [shortDescription, setShortDescription] = useState('');
  const [relationship, setRelationship] = useState('girlfriend');
  const [backstory, setBackstory] = useState('');
  const [selectedOutfit, setSelectedOutfit] = useState<string | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [generatingPortrait, setGeneratingPortrait] = useState(false);
  const [outfits, setOutfits] = useState<{ id: string; name: string; tier: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchCreatorData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [presetsRes, cardsRes] = await Promise.all([
        fetch('/api/creator/presets'),
        authedFetch('/api/creator/cards'),
      ]);
      const presetsData = await readResponseJson<{ presets?: CharacterPreset[]; options?: Record<string, OptionItem[]> }>(presetsRes);
      const cardsData = await readResponseJson<CardStatus>(cardsRes);

      if (presetsData.presets) setPresets(presetsData.presets);
      if (presetsData.options) setOptions(presetsData.options);
      if (cardsData) setCardStatus(cardsData);
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

  const fetchOutfits = useCallback(async () => {
    try {
      const r = await authedFetch('/api/outfits');
      const data = await readResponseJson<{ outfits?: { id: string; name: string; tier: string }[] }>(r);
      setOutfits(data.outfits || []);
      if (data.outfits?.[0]) setSelectedOutfit(data.outfits[0].id);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void fetchOutfits(); }, [fetchOutfits]);

  // ─── Option Helpers ──────────────────────────────────────────────────────

  const getOpts = useCallback((category: string): OptionItem[] => {
    return options[category] || [];
  }, [options]);

  // ─── Preset Selection ───────────────────────────────────────────────────

  const applyPreset = useCallback((preset: CharacterPreset) => {
    setSelectedPreset(preset.id);
    setVisualStyle(preset.visual_style || 'realistic');
    setGender(preset.gender || 'Female');
    setEthnicity(preset.ethnicity || 'Asian');
    setFaceShape(preset.face_shape || 'Oval');
    setHairStyle(preset.hair_style || 'Long Flowing');
    setHairColor(preset.hair_color || '#d4a574');
    setEyeColor(preset.eye_color || 'Brown');
    setBodyType(preset.body_type || 'Slim');
    setFashionStyle(preset.fashion_style || 'Casual');
    setSelectedTags(preset.personality_tags || ['Romantic']);
    setVoice(preset.voice || 'soft');
    setOccupation(preset.occupation || 'Student');
    setName(preset.name || '');
    setAge(preset.age || 22);
    setRelationship(preset.relationship || 'girlfriend');
    if (preset.description) setShortDescription(preset.description);
  }, []);

  const startFromScratch = useCallback(() => {
    setSelectedPreset(null);
    setStep(1);
  }, []);

  // ─── Tag Toggle ─────────────────────────────────────────────────────────

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length >= 8 ? prev : [...prev, tag],
    );
  }, []);

  // ─── Step Validation ───────────────────────────────────────────────────

  const stepValid = useMemo(() => {
    if (step === 0) return true; // preset selection always valid (can skip)
    if (step === 1) return Boolean(ethnicity && hairStyle && eyeColor && bodyType);
    if (step === 2) return name.trim().length >= 2 && age >= 18 && Boolean(relationship);
    return false;
  }, [step, ethnicity, hairStyle, eyeColor, bodyType, name, age, relationship]);

  // ─── Portrait Generation ───────────────────────────────────────────────

  const handleGeneratePortrait = useCallback(async () => {
    setGeneratingPortrait(true);
    setError(null);
    try {
      const res = await authedFetch('/api/girlfriends/generate-portrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'Companion',
          visual_style: visualStyle,
          ethnicity, gender, face_shape: faceShape,
          hair_style: hairStyle, hair_color: hairColor,
          eye_color: eyeColor, body_type: bodyType,
          fashion_style: fashionStyle, appearance_prompt: appearancePrompt,
          personality: selectedTags.join(', '),
        }),
      });
      const data = await readResponseJson<{ portrait_url?: string; url?: string; imageUrl?: string; error?: string }>(res);
      if (!res.ok) {
        setError(data.error || (zh ? '生成失败' : 'Generate failed'));
        return;
      }
      const url = data.portrait_url || data.url || data.imageUrl;
      if (url) setPortraitUrl(url);
      else setError(zh ? '未返回图片' : 'No image returned');
    } catch (e) {
      logger.error(String(e));
      setError(errorMessageFromUnknown(e, zh ? '生成失败' : 'Generate failed'));
    } finally {
      setGeneratingPortrait(false);
    }
  }, [name, visualStyle, ethnicity, gender, faceShape, hairStyle, hairColor, eyeColor, bodyType, fashionStyle, appearancePrompt, selectedTags, zh]);

  // ─── Submit ────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const relOpts = getOpts('relationship');
      const relMeta = relOpts.find(r => r.value === relationship);
      const relLabel = relMeta ? getLabel(relMeta, locale) : (zh ? '女友' : 'Girlfriend');
      const relDesc = relMeta ? getExtra(relMeta, 'desc', locale) : '';

      const fullCharacterCard = [
        `Visual style: ${visualStyle}. Gender presentation: ${gender}. Face: ${faceShape}.`,
        `Ethnicity: ${ethnicity}.`,
        `Occupation: ${occupation}.`,
        `Voice: ${voice}.`,
        relMeta ? `Relationship: ${relLabel}${relDesc ? ' - ' + relDesc : ''}.` : '',
        hobbies ? `Hobbies: ${hobbies}.` : '',
        backstory ? `Backstory: ${backstory}` : '',
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
          tags: [...selectedTags, ethnicity, occupation, relLabel],
          outfit_id: selectedOutfit,
          portrait_url: portraitUrl || undefined,
          meta: {
            visual_style: visualStyle, ethnicity, gender,
            face_shape: faceShape, voice, occupation,
            relationship, hobbies, appearance_prompt: appearancePrompt,
          },
        }),
      });
      const data = await readResponseJson<{ error?: string; code?: string; cards_remaining?: number }>(res);
      if (!res.ok) {
        if (data.code === 'SEAT_LIMIT') {
          setError(t('creator.seatLimit') || (zh ? '好友席位已满，请到商城购买席位或升级套餐' : 'Friend seats full — buy more seats in Shop or upgrade plan'));
          return;
        }
        if (data.code === 'NO_CARDS') {
          setError(t('creator.noCards') || (zh ? '创建卡已用完，请到商城购买' : 'No creation cards — buy more in Shop'));
          return;
        }
        setError(data.error || (zh ? '创建失败' : 'Create failed'));
        return;
      }

      // Update card status
      if (data.cards_remaining !== undefined && cardStatus) {
        setCardStatus({ ...cardStatus, cards: data.cards_remaining });
      }

      notifyDataChange('girlfriends');
      router.push('/chats');
    } catch (e) {
      logger.error(String(e));
      setError(errorMessageFromUnknown(e, zh ? '网络错误' : 'Network error'));
    } finally {
      setSaving(false);
    }
  }, [
    name, age, shortDescription, selectedTags, hairStyle, hairColor, eyeColor, bodyType,
    fashionStyle, selectedOutfit, portraitUrl, visualStyle, ethnicity, gender, faceShape,
    voice, occupation, relationship, hobbies, backstory, appearancePrompt, router, zh,
    getOpts, locale, t, cardStatus,
  ]);

  // ─── Render ────────────────────────────────────────────────────────────

  const cardLabel = t('creator.creationCard') || (zh ? '创建卡' : 'Creation Cards');

  return (
    <GameShell className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden">
      <PageHeader
        eyebrow="CREATOR"
        title={t('creator.title') || (zh ? '捏脸创建' : 'Create Companion')}
        subtitle={t('creator.subtitle') || (zh ? '预设 · 外观 · 人设' : 'Preset · Look · Identity')}
        backHref="/"
        sticky={false}
        actions={
          step === 2 ? (
            <GamePrimaryButton
              className="!h-10 !px-4 text-xs"
              disabled={!stepValid || saving}
              onClick={handleSubmit}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('creator.finish') || (zh ? '完成' : 'Finish')}
            </GamePrimaryButton>
          ) : undefined
        }
      />

      {/* Card balance + Stepper */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/[0.06]">
        {/* Card balance */}
        {cardStatus && (
          <div className="flex items-center gap-1.5 text-[11px] text-white/50">
            <CreditCard className="h-3.5 w-3.5" />
            <span>{cardLabel}: </span>
            <span className={cn('font-bold', cardStatus.cards > 0 ? 'text-[#FF2D78]' : 'text-red-400')}>
              {cardStatus.cards}
            </span>
            {cardStatus.monthlyQuota > 0 && (
              <span className="text-white/30">/{cardStatus.monthlyQuota}{zh ? '月' : '/mo'}</span>
            )}
          </div>
        )}

        {/* Stepper */}
        <div className="flex items-center gap-2 sm:gap-3">
          {stepLabels.map((label, idx) => {
            const active = idx === step;
            const done = idx < step;
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
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pt-3 pb-32">
        <div className="mx-auto max-w-2xl space-y-6">
          <AnimatePresence mode="wait">

            {/* ─── Step 0: Preset Selection ─────────────────────────────── */}
            {step === 0 && (
              <motion.div
                key="s0"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                className="space-y-6"
              >
                <div className="text-center py-4">
                  <h2 className="text-lg font-bold text-white/90">
                    {t('creator.choosePreset') || (zh ? '选择一个预设模板' : 'Choose a Preset')}
                  </h2>
                  <p className="text-xs text-white/40 mt-1">
                    {t('creator.presetHint') || (zh ? '选择预设可快速填充，也可从零开始自定义' : 'Pick a preset to quick-fill, or start from scratch')}
                  </p>
                </div>

                {loadingData ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-white/30" />
                  </div>
                ) : (
                  <>
                    {/* Preset cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => { applyPreset(preset); setStep(1); }}
                          className={cn(
                            'group relative rounded-2xl border p-4 text-left transition-all overflow-hidden',
                            selectedPreset === preset.id
                              ? 'border-[#FF2D78]/60 bg-[#FF2D78]/10'
                              : 'border-white/10 bg-white/[0.03] hover:border-[#FF2D78]/30 hover:bg-white/[0.05]',
                          )}
                        >
                          {/* Thumbnail or gradient */}
                          <div className="h-24 rounded-xl mb-3 overflow-hidden bg-gradient-to-br from-[#FF2D78]/20 to-[#8b5cf6]/20 flex items-center justify-center">
                            {preset.thumbnail_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={preset.thumbnail_url} alt={preset.name} className="h-full w-full object-cover" />
                            ) : (
                              <Palette className="h-8 w-8 text-white/20" />
                            )}
                          </div>
                          <div className="text-sm font-bold text-white/90">{preset.name}</div>
                          <div className="text-[11px] text-white/40 mt-0.5 line-clamp-2">{preset.description}</div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(preset.personality_tags || []).slice(0, 3).map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] text-white/50">{tag}</span>
                            ))}
                          </div>
                          <div className="text-[10px] text-white/30 mt-2">
                            {preset.age} · {preset.occupation} · {preset.ethnicity}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Start from scratch */}
                    <button
                      type="button"
                      onClick={startFromScratch}
                      className="w-full rounded-2xl border border-dashed border-white/15 p-6 text-center transition-all hover:border-[#FF2D78]/40 hover:bg-white/[0.02]"
                    >
                      <Sparkles className="h-6 w-6 text-white/20 mx-auto mb-2" />
                      <div className="text-sm font-semibold text-white/60">
                        {t('creator.fromScratch') || (zh ? '从零开始自定义' : 'Start from Scratch')}
                      </div>
                      <div className="text-[11px] text-white/30 mt-0.5">
                        {t('creator.fromScratchHint') || (zh ? '完全自定义每一个选项' : 'Customize every detail yourself')}
                      </div>
                    </button>

                    {/* Inline skip button */}
                    <div className="flex justify-end pt-2">
                      <GamePrimaryButton
                        className="h-11 px-6 touch-manipulation"
                        onClick={() => setStep(1)}
                      >
                        {t('creator.skipToCustomize') || (zh ? '开始自定义' : 'Customize')} <ArrowRight className="h-4 w-4" />
                      </GamePrimaryButton>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* ─── Step 1: Appearance ───────────────────────────────────── */}
            {step === 1 && (
              <motion.div
                key="s1"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                className="space-y-6"
              >
                {/* Preview strip */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="h-16 w-16 rounded-lg overflow-hidden bg-black/40 border border-white/10 shrink-0">
                    {portraitUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={portraitUrl} alt="preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-white/20">
                        <User2 className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] tracking-[0.15em] text-white/30 font-bold mb-1">
                      {t('creator.preview') || (zh ? '预览' : 'PREVIEW')}
                    </div>
                    <div className="text-xs text-white/70 truncate">
                      {visualStyle} · {gender} · {ethnicity}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-white/50">{hairStyle}</span>
                      <span className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ background: hairColor }} />
                      <span className="text-[11px] text-white/50">{eyeColor} · {bodyType}</span>
                    </div>
                  </div>
                  <GamePrimaryButton
                    className="!h-9 !px-3 text-[10px] shrink-0"
                    disabled={generatingPortrait}
                    onClick={handleGeneratePortrait}
                  >
                    {generatingPortrait ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    {t('creator.genPortrait') || (zh ? 'AI头像' : 'AI Portrait')}
                  </GamePrimaryButton>
                </div>

                {/* Visual Style */}
                <Section title={t('creator.visualStyle') || (zh ? '画风' : 'Visual Style')}>
                  <div className="grid grid-cols-2 gap-2">
                    {getOpts('visual_style').map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => setVisualStyle(v.value)}
                        className={cn(
                          'rounded-xl border p-3 text-left transition-all',
                          visualStyle === v.value
                            ? 'border-[#FF2D78]/60 bg-[#FF2D78]/10'
                            : 'border-white/10 bg-white/[0.03]',
                        )}
                      >
                        <div className="font-semibold text-sm">{getLabel(v, locale)}</div>
                        <div className="text-[11px] text-white/40 mt-0.5">{getExtra(v, 'desc', locale)}</div>
                      </button>
                    ))}
                  </div>
                </Section>

                {/* Gender */}
                <Section title={t('creator.gender') || (zh ? '性别气质' : 'Gender')}>
                  <div className="flex flex-wrap gap-2">
                    {getOpts('gender').map((g) => (
                      <Pill key={g.value} active={gender === g.value} onClick={() => setGender(g.value)}>{getLabel(g, locale)}</Pill>
                    ))}
                  </div>
                </Section>

                {/* Ethnicity */}
                <Section title={t('creator.ethnicity') || (zh ? '种族 / 血统' : 'Ethnicity')}>
                  <div className="flex flex-wrap gap-2">
                    {getOpts('ethnicity').map((e) => (
                      <Pill key={e.value} active={ethnicity === e.value} onClick={() => setEthnicity(e.value)}>{getLabel(e, locale)}</Pill>
                    ))}
                  </div>
                </Section>

                {/* Face Shape */}
                <Section title={t('creator.faceShape') || (zh ? '脸型' : 'Face Shape')}>
                  <div className="flex flex-wrap gap-2">
                    {getOpts('face_shape').map((f) => (
                      <Pill key={f.value} active={faceShape === f.value} onClick={() => setFaceShape(f.value)}>{getLabel(f, locale)}</Pill>
                    ))}
                  </div>
                </Section>

                {/* Body Type */}
                <Section title={t('creator.bodyType') || (zh ? '体型' : 'Body Type')}>
                  <div className="flex flex-wrap gap-2">
                    {getOpts('body_type').map((b) => (
                      <Pill key={b.value} active={bodyType === b.value} onClick={() => setBodyType(b.value)}>{getLabel(b, locale)}</Pill>
                    ))}
                  </div>
                </Section>

                {/* Hair Style */}
                <Section title={t('creator.hairStyle') || (zh ? '发型' : 'Hair Style')}>
                  <div className="flex flex-wrap gap-2">
                    {getOpts('hair_style').map((h) => (
                      <Pill key={h.value} active={hairStyle === h.value} onClick={() => setHairStyle(h.value)}>{getLabel(h, locale)}</Pill>
                    ))}
                  </div>
                </Section>

                {/* Hair Color */}
                <Section title={t('creator.hairColor') || (zh ? '发色' : 'Hair Color')}>
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
                </Section>

                {/* Eye Color */}
                <Section title={t('creator.eyeColor') || (zh ? '瞳色' : 'Eye Color')}>
                  <div className="flex flex-wrap gap-2">
                    {getOpts('eye_color').map((e) => (
                      <Pill key={e.value} active={eyeColor === e.value} onClick={() => setEyeColor(e.value)}>{getLabel(e, locale)}</Pill>
                    ))}
                  </div>
                </Section>

                {/* Fashion Style */}
                <Section title={t('creator.fashionStyle') || (zh ? '服装风格' : 'Fashion Style')}>
                  <div className="flex flex-wrap gap-2">
                    {getOpts('fashion_style').map((f) => (
                      <Pill key={f.value} active={fashionStyle === f.value} onClick={() => setFashionStyle(f.value)}>{getLabel(f, locale)}</Pill>
                    ))}
                  </div>
                </Section>

                {/* Extra notes */}
                <Section title={t('creator.extraNotes') || (zh ? '补充描述（可选）' : 'Extra Notes (optional)')}>
                  <textarea
                    value={appearancePrompt}
                    onChange={(e) => setAppearancePrompt(e.target.value)}
                    placeholder={t('creator.extraNotesPlaceholder') || (zh ? '例如：酒窝、右眼泪痣、雀斑' : 'e.g. dimples, freckles, beauty mark')}
                    rows={2}
                    className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-[#FF2D78]/40"
                  />
                </Section>

                {/* Inline step navigation */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="h-11 min-w-[5.5rem] px-5 rounded-full border border-white/10 text-sm text-white/70 hover:bg-white/[0.04] flex items-center justify-center gap-1 touch-manipulation"
                  >
                    <ArrowLeft className="h-4 w-4" /> {t('creator.back') || (zh ? '上一步' : 'Back')}
                  </button>
                  <GamePrimaryButton
                    className="h-11 px-6 touch-manipulation"
                    disabled={!stepValid}
                    onClick={() => setStep(2)}
                  >
                    {t('creator.next') || (zh ? '下一步' : 'Next')} <ArrowRight className="h-4 w-4" />
                  </GamePrimaryButton>
                </div>
              </motion.div>
            )}

            {/* ─── Step 2: Personality & Identity ──────────────────────── */}
            {step === 2 && (
              <motion.div
                key="s2"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                className="space-y-6"
              >
                {/* Personality Tags */}
                <Section title={`${t('creator.personality') || (zh ? '性格标签' : 'Personality Tags')} (${selectedTags.length}/8)`}>
                  <div className="flex flex-wrap gap-2">
                    {getOpts('personality_tag').map((tag) => (
                      <Pill key={tag.value} active={selectedTags.includes(tag.value)} onClick={() => toggleTag(tag.value)}>
                        {getLabel(tag, locale)}
                      </Pill>
                    ))}
                  </div>
                </Section>

                {/* Voice */}
                <Section title={t('creator.voice') || (zh ? '声线' : 'Voice')}>
                  <div className="flex flex-wrap gap-2">
                    {getOpts('voice').map((v) => (
                      <Pill key={v.value} active={voice === v.value} onClick={() => setVoice(v.value)}>{getLabel(v, locale)}</Pill>
                    ))}
                  </div>
                </Section>

                {/* Occupation */}
                <Section title={t('creator.occupation') || (zh ? '职业' : 'Occupation')}>
                  <div className="flex flex-wrap gap-2">
                    {getOpts('occupation').map((o) => (
                      <Pill key={o.value} active={occupation === o.value} onClick={() => setOccupation(o.value)}>{getLabel(o, locale)}</Pill>
                    ))}
                  </div>
                </Section>

                {/* Hobbies */}
                <Section title={t('creator.hobbies') || (zh ? '兴趣爱好' : 'Hobbies')}>
                  <input
                    value={hobbies}
                    onChange={(e) => setHobbies(e.target.value)}
                    placeholder={t('creator.hobbiesPlaceholder') || (zh ? '咖啡、摄影、深夜电台…' : 'Coffee, photography, late-night radio…')}
                    className="w-full h-11 rounded-xl bg-white/[0.04] border border-white/10 px-3 text-sm outline-none focus:border-[#FF2D78]/40"
                  />
                </Section>

                {/* Divider */}
                <div className="border-t border-white/[0.06]" />

                {/* Name */}
                <Section title={`${t('creator.name') || (zh ? '名字' : 'Name')} *`}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('creator.namePlaceholder') || (zh ? '她的名字' : 'Her name')}
                    className="w-full h-11 rounded-xl bg-white/[0.04] border border-white/10 px-3 text-sm outline-none focus:border-[#FF2D78]/40"
                  />
                </Section>

                {/* Age */}
                <Section title={t('creator.age') || (zh ? '年龄' : 'Age')}>
                  <input
                    type="number"
                    min={18}
                    max={45}
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="w-28 h-11 rounded-xl bg-white/[0.04] border border-white/10 px-3 text-sm outline-none"
                  />
                </Section>

                {/* Tagline */}
                <Section title={t('creator.tagline') || (zh ? '一句话人设' : 'Tagline')}>
                  <input
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder={t('creator.taglinePlaceholder') || (zh ? '深夜电台里的温柔声音…' : 'A soft voice on the late-night radio…')}
                    className="w-full h-11 rounded-xl bg-white/[0.04] border border-white/10 px-3 text-sm outline-none focus:border-[#FF2D78]/40"
                  />
                </Section>

                {/* Relationship */}
                <Section title={t('creator.relationship') || (zh ? '关系定位' : 'Relationship')}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {getOpts('relationship').map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRelationship(r.value)}
                        className={cn(
                          'rounded-xl border p-3 text-left',
                          relationship === r.value
                            ? 'border-[#FF2D78]/60 bg-[#FF2D78]/10'
                            : 'border-white/10 bg-white/[0.03]',
                        )}
                      >
                        <div className="text-sm font-semibold">{getLabel(r, locale)}</div>
                        <div className="text-[10px] text-white/40 mt-0.5">{getExtra(r, 'desc', locale)}</div>
                      </button>
                    ))}
                  </div>
                </Section>

                {/* Backstory */}
                <Section title={t('creator.backstory') || (zh ? '背景故事（可选）' : 'Backstory (optional)')}>
                  <textarea
                    value={backstory}
                    onChange={(e) => setBackstory(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-[#FF2D78]/40"
                  />
                </Section>

                {/* Starter Outfit */}
                {outfits.length > 0 && (
                  <Section title={t('creator.starterOutfit') || (zh ? '初始服装' : 'Starter Outfit')}>
                    <div className="flex flex-wrap gap-2">
                      {outfits.slice(0, 12).map((o) => (
                        <Pill
                          key={o.id}
                          active={selectedOutfit === o.id}
                          onClick={() => setSelectedOutfit(o.id)}
                        >
                          {o.name}
                        </Pill>
                      ))}
                    </div>
                  </Section>
                )}

                {error && <p className="text-sm text-red-400">{error}</p>}

                {/* Inline step navigation */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="h-11 min-w-[5.5rem] px-5 rounded-full border border-white/10 text-sm text-white/70 hover:bg-white/[0.04] flex items-center justify-center gap-1 touch-manipulation"
                  >
                    <ArrowLeft className="h-4 w-4" /> {t('creator.back') || (zh ? '上一步' : 'Back')}
                  </button>
                  <GamePrimaryButton
                    className="h-11 px-6 touch-manipulation"
                    disabled={!stepValid || saving}
                    onClick={handleSubmit}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t('creator.create') || (zh ? '创建' : 'Create')}
                  </GamePrimaryButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {error && step !== 2 && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {/* Bottom nav */}
      <div
        className="shrink-0 sticky bottom-0 z-30 flex items-center justify-between gap-3 border-t border-white/10 bg-[#0a0612]/96 backdrop-blur-xl px-4 py-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="h-11 min-w-[5.5rem] px-4 rounded-full border border-white/10 text-sm disabled:opacity-30 flex items-center justify-center gap-1 touch-manipulation"
        >
          <ArrowLeft className="h-4 w-4" /> {t('creator.back') || (zh ? '上一步' : 'Back')}
        </button>
        {step < 2 ? (
          step === 0 ? (
            <GamePrimaryButton
              className="h-11 px-6 touch-manipulation"
              onClick={() => setStep(1)}
            >
              {t('creator.skipToCustomize') || (zh ? '开始自定义' : 'Customize')} <ArrowRight className="h-4 w-4" />
            </GamePrimaryButton>
          ) : (
            <GamePrimaryButton
              className="h-11 px-6 touch-manipulation"
              disabled={!stepValid}
              onClick={() => setStep((s) => s + 1)}
            >
              {t('creator.next') || (zh ? '下一步' : 'Next')} <ArrowRight className="h-4 w-4" />
            </GamePrimaryButton>
          )
        ) : (
          <GamePrimaryButton
            className="h-11 px-6 touch-manipulation"
            disabled={!stepValid || saving}
            onClick={handleSubmit}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t('creator.create') || (zh ? '创建' : 'Create')}
          </GamePrimaryButton>
        )}
      </div>
    </GameShell>
  );
}
