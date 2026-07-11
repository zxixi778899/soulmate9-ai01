'use client';

/**
 * Character Creator — game-style face sculpt / 捏脸系统
 * Steps: Body & Face → Personality → Identity
 */

import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Save, ArrowLeft, ArrowRight, Wand2, Loader2, Sparkles, Check, User2,
} from 'lucide-react';
import { GameShell, GamePrimaryButton } from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';

const VISUAL_STYLES = [
  { id: 'realistic' as const, label: 'Realistic', desc: 'Photo-like skin & lighting' },
  { id: 'anime' as const, label: 'Anime', desc: 'Big eyes & clean line art' },
];
const ETHNICITIES = ['Caucasian', 'Asian', 'Latina', 'Ebony', 'Arab', 'Indian', 'Mixed', 'Slavic'];
const GENDERS = ['Female', 'Femme', 'Androgynous'];
const HAIR_STYLES = ['Straight', 'Wavy', 'Curly', 'Bob', 'Pixie Cut', 'Long Flowing', 'Ponytail', 'Twin Tails', 'Braided'];
const HAIR_COLORS = [
  { hex: '#000000', name: 'Black' }, { hex: '#4a3728', name: 'Dark brown' }, { hex: '#6b3a2a', name: 'Brown' },
  { hex: '#d4a574', name: 'Blonde' }, { hex: '#f5d742', name: 'Gold' }, { hex: '#e84393', name: 'Pink' },
  { hex: '#d946ef', name: 'Magenta' }, { hex: '#8b5cf6', name: 'Purple' }, { hex: '#3b82f6', name: 'Blue' },
  { hex: '#ef4444', name: 'Red' }, { hex: '#ffffff', name: 'White' },
];
const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Hazel', 'Gray', 'Amber', 'Violet', 'Heterochromia'];
const FACE_SHAPES = ['Oval', 'Heart', 'Round', 'Diamond', 'Soft Square'];
const BODY_TYPES = ['Petite', 'Slim', 'Athletic', 'Curvy', 'Busty', 'Voluptuous', 'Tall'];
const FASHION_STYLES = ['Casual', 'Elegant', 'Gothic', 'Sporty', 'Romantic', 'Edgy', 'Bohemian', 'Cyberpunk'];
const PERSONALITY_TAGS = [
  'Romantic', 'Caring', 'Shy', 'Submissive', 'Dominant', 'Playful',
  'Tsundere', 'Yandere', 'Gentle', 'Passionate', 'Mysterious', 'Energetic',
  'Flirty', 'Innocent', 'Witty', 'Loyal', 'Adventurous', 'Jealous',
  'Nurturing', 'Bratty', 'Sensual', 'Cheerful', 'Confident', 'Mischievous',
];
const VOICES = [
  { id: 'soft', label: 'Soft' }, { id: 'sultry', label: 'Sultry' }, { id: 'cheerful', label: 'Cheerful' },
  { id: 'mature', label: 'Mature' }, { id: 'shy', label: 'Shy' }, { id: 'confident', label: 'Confident' },
  { id: 'playful', label: 'Playful' }, { id: 'asmr', label: 'ASMR' },
];
const OCCUPATIONS = [
  'Student', 'Teacher', 'Nurse', 'Artist', 'Model', 'Streamer', 'Gamer',
  'Yoga Instructor', 'CEO', 'Bartender', 'Photographer', 'Athlete',
];
const RELATIONSHIPS = [
  { id: 'girlfriend', label: 'Girlfriend', desc: 'Exclusive partner' },
  { id: 'wife', label: 'Wife', desc: 'Deep bond' },
  { id: 'stranger', label: 'Stranger', desc: 'Just met' },
  { id: 'bestie', label: 'Bestie', desc: 'Close friend' },
  { id: 'coworker', label: 'Coworker', desc: 'Office tension' },
  { id: 'roommate', label: 'Roommate', desc: 'Shared home' },
  { id: 'neighbor', label: 'Neighbor', desc: 'Next door spark' },
  { id: 'maid', label: 'Maid', desc: 'Devoted service' },
  { id: 'princess', label: 'Princess', desc: 'Royal fantasy' },
  { id: 'rival', label: 'Rival', desc: 'Competitive pull' },
];

const STEPS_EN = ['Look', 'Personality', 'Identity'] as const;
const STEPS_ZH = ['Look', 'Personality', 'Identity'] as const; // labels set below via locale

function Pill({
  active, onClick, children, className,
}: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
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

export default function CreatePage() {
  const router = useRouter();
  const { locale } = useTranslation();
  const stepLabels = locale === 'zh' ? ['外观', '性格', '身份'] : ['Look', 'Personality', 'Identity'];
  const [step, setStep] = useState(0);

  const [visualStyle, setVisualStyle] = useState<'realistic' | 'anime'>('realistic');
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

  useEffect(() => {
    authedFetch('/api/outfits')
      .then((r) => r.json())
      .then((data: { outfits?: { id: string; name: string; tier: string }[] }) => {
        setOutfits(data.outfits || []);
        if (data.outfits?.[0]) setSelectedOutfit(data.outfits[0].id);
      })
      .catch(() => {});
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length >= 8 ? prev : [...prev, tag],
    );
  }, []);

  const stepValid = useMemo(() => {
    if (step === 0) return Boolean(ethnicity && hairStyle && eyeColor && bodyType);
    if (step === 1) return selectedTags.length >= 1 && Boolean(voice && occupation);
    if (step === 2) return name.trim().length >= 2 && age >= 18 && Boolean(relationship);
    return false;
  }, [step, ethnicity, hairStyle, eyeColor, bodyType, selectedTags, voice, occupation, name, age, relationship]);

  const handleGeneratePortrait = useCallback(async () => {
    setGeneratingPortrait(true);
    setError(null);
    try {
      const res = await authedFetch('/api/girlfriends/generate-portrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visual_style: visualStyle,
          ethnicity,
          gender,
          face_shape: faceShape,
          hair_style: hairStyle,
          hair_color: hairColor,
          eye_color: eyeColor,
          body_type: bodyType,
          fashion_style: fashionStyle,
          appearance_prompt: appearancePrompt,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.portrait_url || data.url) setPortraitUrl(data.portrait_url || data.url);
      }
    } catch (e) {
      logger.error(String(e));
    } finally {
      setGeneratingPortrait(false);
    }
  }, [visualStyle, ethnicity, gender, faceShape, hairStyle, hairColor, eyeColor, bodyType, fashionStyle, appearancePrompt]);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const relMeta = RELATIONSHIPS.find((r) => r.id === relationship);
      const fullCharacterCard = [
        `Visual style: ${visualStyle}. Gender presentation: ${gender}. Face: ${faceShape}.`,
        `Ethnicity: ${ethnicity}.`,
        `Occupation: ${occupation}.`,
        `Voice: ${voice}.`,
        relMeta ? `Relationship: ${relMeta.label} — ${relMeta.desc}.` : '',
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
          tags: [...selectedTags, ethnicity, occupation, relMeta?.label || 'Girlfriend'],
          outfit_id: selectedOutfit,
          portrait_url: portraitUrl || undefined,
          meta: {
            visual_style: visualStyle,
            ethnicity,
            gender,
            face_shape: faceShape,
            voice,
            occupation,
            relationship,
            hobbies,
            appearance_prompt: appearancePrompt,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string; code?: string }));
        if ((data as { code?: string }).code === 'SEAT_LIMIT') {
          setError('Friend seats full — buy more seats in Shop or upgrade plan');
          return;
        }
        setError(data.error || 'Create failed');
        return;
      }

      router.push('/chats');
    } catch (e) {
      logger.error(String(e));
      setError(locale === 'zh' ? '网络错误' : 'Network error');
    } finally {
      setSaving(false);
    }
  }, [
    name, age, shortDescription, selectedTags, hairStyle, hairColor, eyeColor, bodyType,
    fashionStyle, selectedOutfit, portraitUrl, visualStyle, ethnicity, gender, faceShape,
    voice, occupation, relationship, hobbies, backstory, appearancePrompt, router,
  ]);

  return (
    <GameShell className="flex min-h-[100dvh] flex-col overflow-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <PageHeader
        eyebrow="CREATOR"
        title={locale === 'zh' ? '捏脸创建' : 'Create Companion'}
        subtitle={locale === 'zh' ? '外观 · 性格 · 身份' : 'Look · Personality · Identity'}
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
              {locale === 'zh' ? '完成' : 'Finish'}
            </GamePrimaryButton>
          ) : undefined
        }
      />

      {/* Stepper */}
      <div className="shrink-0 flex items-center justify-center gap-2 sm:gap-4 px-4 py-3 border-b border-white/[0.06]">
        {stepLabels.map((label, idx) => {
          const active = idx === step;
          const done = idx < step;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold',
                  active && 'bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white shadow-[0_0_16px_rgba(255,45,120,0.4)]',
                  done && 'bg-[#FF2D78]/80 text-white',
                  !active && !done && 'bg-white/5 text-white/40',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              <span className={cn('hidden sm:block text-xs font-medium', active ? 'text-white' : 'text-white/40')}>
                {label}
              </span>
              {idx < stepLabels.length - 1 && (
                <div className={cn('h-px w-8 sm:w-14', done ? 'bg-[#FF2D78]/50' : 'bg-white/10')} />
              )}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-b border-white/[0.06] px-3 sm:px-5 py-3">
        <div className="mx-auto max-w-4xl grid grid-cols-[minmax(0,42%)_1fr] sm:grid-cols-[200px_1fr] gap-3 sm:gap-4 items-stretch">
          <div className="relative aspect-[3/4] max-h-[220px] sm:max-h-[260px] rounded-xl overflow-hidden bg-black/40 border border-white/10">
            {portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portraitUrl} alt="preview" className="h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-2 p-2">
                <User2 className="h-10 w-10" />
                <span className="text-[11px] text-center">{locale === 'zh' ? '生成预览头像' : 'Preview portrait'}</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex flex-col justify-between gap-2 py-0.5">
            <div>
              <div className="text-[10px] tracking-[0.25em] text-white/40 font-bold mb-1.5">
                {locale === 'zh' ? '已选数据' : 'SELECTED'}
              </div>
              <div className="space-y-1 text-xs text-white/70">
                <div className="truncate"><span className="text-white/35">{locale === 'zh' ? '画风' : 'Style'}</span> {visualStyle} · {gender}</div>
                <div className="truncate"><span className="text-white/35">{locale === 'zh' ? '种族' : 'Ethnicity'}</span> {ethnicity} · {faceShape}</div>
                <div className="truncate"><span className="text-white/35">{locale === 'zh' ? '发型' : 'Hair'}</span> {hairStyle}</div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-white/35 shrink-0">{locale === 'zh' ? '发色' : 'Color'}</span>
                  <span className="h-3 w-3 rounded-full border border-white/20 shrink-0" style={{ background: hairColor }} />
                  <span className="truncate">{eyeColor} · {bodyType}</span>
                </div>
                <div className="truncate"><span className="text-white/35">{locale === 'zh' ? '风格' : 'Fashion'}</span> {fashionStyle}</div>
                {name ? (
                  <div className="truncate"><span className="text-white/35">{locale === 'zh' ? '名字' : 'Name'}</span> {name} · {age}</div>
                ) : null}
              </div>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2 max-h-14 overflow-hidden">
                  {selectedTags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">{tag}</span>
                  ))}
                </div>
              )}
            </div>
            <GamePrimaryButton
              className="w-full h-10 text-xs"
              disabled={generatingPortrait}
              onClick={handleGeneratePortrait}
            >
              {generatingPortrait ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {locale === 'zh' ? 'AI 生成头像' : 'AI Generate Portrait'}
            </GamePrimaryButton>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Form */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 pb-36">
          <div className="mx-auto max-w-2xl space-y-6">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="s0"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  className="space-y-6"
                >
                  <Section title={locale === 'zh' ? '画风' : 'Visual Style'}>
                    <div className="grid grid-cols-2 gap-2">
                      {VISUAL_STYLES.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setVisualStyle(v.id)}
                          className={cn(
                            'rounded-xl border p-3 text-left transition-all',
                            visualStyle === v.id
                              ? 'border-[#FF2D78]/60 bg-[#FF2D78]/10'
                              : 'border-white/10 bg-white/[0.03]',
                          )}
                        >
                          <div className="font-semibold text-sm">{v.label}</div>
                          <div className="text-[11px] text-white/40 mt-0.5">{v.desc}</div>
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section title={locale === 'zh' ? '性别气质' : 'Gender'}>
                    <div className="flex flex-wrap gap-2">
                      {GENDERS.map((g) => (
                        <Pill key={g} active={gender === g} onClick={() => setGender(g)}>{g}</Pill>
                      ))}
                    </div>
                  </Section>

                  <Section title="种族 / 血统">
                    <div className="flex flex-wrap gap-2">
                      {ETHNICITIES.map((e) => (
                        <Pill key={e} active={ethnicity === e} onClick={() => setEthnicity(e)}>{e}</Pill>
                      ))}
                    </div>
                  </Section>

                  <Section title="脸型">
                    <div className="flex flex-wrap gap-2">
                      {FACE_SHAPES.map((f) => (
                        <Pill key={f} active={faceShape === f} onClick={() => setFaceShape(f)}>{f}</Pill>
                      ))}
                    </div>
                  </Section>

                  <Section title="体型">
                    <div className="flex flex-wrap gap-2">
                      {BODY_TYPES.map((b) => (
                        <Pill key={b} active={bodyType === b} onClick={() => setBodyType(b)}>{b}</Pill>
                      ))}
                    </div>
                  </Section>

                  <Section title="发型">
                    <div className="flex flex-wrap gap-2">
                      {HAIR_STYLES.map((h) => (
                        <Pill key={h} active={hairStyle === h} onClick={() => setHairStyle(h)}>{h}</Pill>
                      ))}
                    </div>
                  </Section>

                  <Section title="发色">
                    <div className="flex flex-wrap gap-2">
                      {HAIR_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          title={c.name}
                          onClick={() => setHairColor(c.hex)}
                          className={cn(
                            'h-9 w-9 rounded-full border-2 transition-transform',
                            hairColor === c.hex ? 'border-white scale-110 ring-2 ring-[#FF2D78]' : 'border-white/20',
                          )}
                          style={{ background: c.hex }}
                        />
                      ))}
                    </div>
                  </Section>

                  <Section title="瞳色 / 五官强调">
                    <div className="flex flex-wrap gap-2">
                      {EYE_COLORS.map((e) => (
                        <Pill key={e} active={eyeColor === e} onClick={() => setEyeColor(e)}>{e}</Pill>
                      ))}
                    </div>
                  </Section>

                  <Section title="服饰风格">
                    <div className="flex flex-wrap gap-2">
                      {FASHION_STYLES.map((f) => (
                        <Pill key={f} active={fashionStyle === f} onClick={() => setFashionStyle(f)}>{f}</Pill>
                      ))}
                    </div>
                  </Section>

                  <Section title="补充描述（可选）">
                    <textarea
                      value={appearancePrompt}
                      onChange={(e) => setAppearancePrompt(e.target.value)}
                      placeholder="例如：酒窝、右眼泪痣、猫耳…"
                      rows={2}
                      className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-[#FF2D78]/40"
                    />
                  </Section>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="s1"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  className="space-y-6"
                >
                  <Section title={locale === 'zh' ? `性格标签（${selectedTags.length}/8）` : `Personality (${selectedTags.length}/8)`}>
                    <div className="flex flex-wrap gap-2">
                      {PERSONALITY_TAGS.map((tag) => (
                        <Pill key={tag} active={selectedTags.includes(tag)} onClick={() => toggleTag(tag)}>
                          {tag}
                        </Pill>
                      ))}
                    </div>
                  </Section>
                  <Section title="声线">
                    <div className="flex flex-wrap gap-2">
                      {VOICES.map((v) => (
                        <Pill key={v.id} active={voice === v.id} onClick={() => setVoice(v.id)}>{v.label}</Pill>
                      ))}
                    </div>
                  </Section>
                  <Section title="职业">
                    <div className="flex flex-wrap gap-2">
                      {OCCUPATIONS.map((o) => (
                        <Pill key={o} active={occupation === o} onClick={() => setOccupation(o)}>{o}</Pill>
                      ))}
                    </div>
                  </Section>
                  <Section title="兴趣爱好">
                    <input
                      value={hobbies}
                      onChange={(e) => setHobbies(e.target.value)}
                      placeholder="咖啡、摄影、深夜电台…"
                      className="w-full h-11 rounded-xl bg-white/[0.04] border border-white/10 px-3 text-sm outline-none focus:border-[#FF2D78]/40"
                    />
                  </Section>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="s2"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  className="space-y-6"
                >
                  <Section title="名字 *">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="她的名字"
                      className="w-full h-11 rounded-xl bg-white/[0.04] border border-white/10 px-3 text-sm outline-none focus:border-[#FF2D78]/40"
                    />
                  </Section>
                  <Section title="年龄">
                    <input
                      type="number"
                      min={18}
                      max={45}
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value))}
                      className="w-28 h-11 rounded-xl bg-white/[0.04] border border-white/10 px-3 text-sm outline-none"
                    />
                  </Section>
                  <Section title="一句话人设">
                    <input
                      value={shortDescription}
                      onChange={(e) => setShortDescription(e.target.value)}
                      placeholder="深夜电台里的温柔声线…"
                      className="w-full h-11 rounded-xl bg-white/[0.04] border border-white/10 px-3 text-sm outline-none focus:border-[#FF2D78]/40"
                    />
                  </Section>
                  <Section title="关系定位">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {RELATIONSHIPS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setRelationship(r.id)}
                          className={cn(
                            'rounded-xl border p-3 text-left',
                            relationship === r.id
                              ? 'border-[#FF2D78]/60 bg-[#FF2D78]/10'
                              : 'border-white/10 bg-white/[0.03]',
                          )}
                        >
                          <div className="text-sm font-semibold">{r.label}</div>
                          <div className="text-[10px] text-white/40 mt-0.5">{r.desc}</div>
                        </button>
                      ))}
                    </div>
                  </Section>
                  <Section title="背景故事（可选）">
                    <textarea
                      value={backstory}
                      onChange={(e) => setBackstory(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-[#FF2D78]/40"
                    />
                  </Section>
                  {outfits.length > 0 && (
                    <Section title="初始服饰">
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        
      </div>

      {/* Bottom nav steps */}
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
          <ArrowLeft className="h-4 w-4" /> {locale === 'zh' ? '上一步' : 'Back'}
        </button>
        {step < 2 ? (
          <GamePrimaryButton
            className="h-11 px-6 touch-manipulation"
            disabled={!stepValid}
            onClick={() => setStep((s) => s + 1)}
          >
            {locale === 'zh' ? '下一步' : 'Next'} <ArrowRight className="h-4 w-4" />
          </GamePrimaryButton>
        ) : (
          <GamePrimaryButton
            className="h-11 px-6 touch-manipulation"
            disabled={!stepValid || saving}
            onClick={handleSubmit}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {locale === 'zh' ? '创建' : 'Create'}
          </GamePrimaryButton>
        )}
      </div>
    </GameShell>
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
