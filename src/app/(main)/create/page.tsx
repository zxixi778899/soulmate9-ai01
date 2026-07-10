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

const VISUAL_STYLES = [
  { id: 'realistic' as const, label: '写实', desc: '照片级皮肤与神态' },
  { id: 'anime' as const, label: '二次元', desc: '动漫感大眼与线条' },
];
const ETHNICITIES = ['Caucasian', 'Asian', 'Latina', 'Ebony', 'Arab', 'Indian', 'Mixed', 'Slavic'];
const GENDERS = ['Female', 'Femme', 'Androgynous'];
const HAIR_STYLES = ['Straight', 'Wavy', 'Curly', 'Bob', 'Pixie Cut', 'Long Flowing', 'Ponytail', 'Twin Tails', 'Braided'];
const HAIR_COLORS = [
  { hex: '#000000', name: '黑' }, { hex: '#4a3728', name: '深棕' }, { hex: '#6b3a2a', name: '棕' },
  { hex: '#d4a574', name: '金' }, { hex: '#f5d742', name: '铂金' }, { hex: '#e84393', name: '粉' },
  { hex: '#d946ef', name: '玫红' }, { hex: '#8b5cf6', name: '紫' }, { hex: '#3b82f6', name: '蓝' },
  { hex: '#ef4444', name: '红' }, { hex: '#ffffff', name: '白' },
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
  { id: 'soft', label: '软糯' }, { id: 'sultry', label: '低沉' }, { id: 'cheerful', label: '明亮' },
  { id: 'mature', label: '成熟' }, { id: 'shy', label: '害羞' }, { id: 'confident', label: '自信' },
  { id: 'playful', label: '戏谑' }, { id: 'asmr', label: 'ASMR' },
];
const OCCUPATIONS = [
  'Student', 'Teacher', 'Nurse', 'Artist', 'Model', 'Streamer', 'Gamer',
  'Yoga Instructor', 'CEO', 'Bartender', 'Photographer', 'Athlete',
];
const RELATIONSHIPS = [
  { id: 'girlfriend', label: '女友', desc: '专属恋人' },
  { id: 'wife', label: '妻子', desc: '深情羁绊' },
  { id: 'stranger', label: '暧昧陌生人', desc: '刚刚相遇' },
  { id: 'bestie', label: '闺蜜', desc: '灵魂挚友' },
  { id: 'coworker', label: '同事', desc: '办公室暗流' },
  { id: 'roommate', label: '室友', desc: '共处一室' },
  { id: 'neighbor', label: '邻居', desc: '隔壁心动' },
  { id: 'maid', label: '女仆', desc: '忠诚侍奉' },
  { id: 'princess', label: '公主', desc: '皇室幻想' },
  { id: 'rival', label: '宿敌', desc: '张力拉满' },
];

const STEPS = ['捏脸外形', '性格声线', '身份关系'];

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
        const data = await res.json().catch(() => ({}));
        setError(data.error || '创建失败');
        return;
      }
      router.push('/chats');
    } catch (e) {
      logger.error(String(e));
      setError('网络错误');
    } finally {
      setSaving(false);
    }
  }, [
    name, age, shortDescription, selectedTags, hairStyle, hairColor, eyeColor, bodyType,
    fashionStyle, selectedOutfit, portraitUrl, visualStyle, ethnicity, gender, faceShape,
    voice, occupation, relationship, hobbies, backstory, appearancePrompt, router,
  ]);

  return (
    <GameShell className="flex h-full flex-col overflow-hidden pb-20 md:pb-0">
      <PageHeader
        eyebrow="CREATOR"
        title="捏脸工坊"
        subtitle="外形 · 性格 · 身份 · 顶栏可跳转其他页面"
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
              完成
            </GamePrimaryButton>
          ) : undefined
        }
      />

      {/* Stepper */}
      <div className="shrink-0 flex items-center justify-center gap-2 sm:gap-4 px-4 py-3 border-b border-white/[0.06]">
        {STEPS.map((label, idx) => {
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
              {idx < STEPS.length - 1 && (
                <div className={cn('h-px w-8 sm:w-14', done ? 'bg-[#FF2D78]/50' : 'bg-white/10')} />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Form */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
                  <Section title="画风">
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

                  <Section title="性别气质">
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
                  <Section title={`性格标签（${selectedTags.length}/8）`}>
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

        {/* Live preview panel */}
        <aside className="lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.06] p-4 sm:p-5 overflow-y-auto">
          <div className="creator-preview rounded-2xl p-4 sticky top-4">
            <div className="text-[10px] tracking-[0.25em] text-white/40 font-bold mb-3">LIVE PREVIEW</div>
            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-black/40 border border-white/10 mb-4">
              {portraitUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={portraitUrl} alt="preview" className="h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-2">
                  <User2 className="h-12 w-12" />
                  <span className="text-xs">生成预览头像</span>
                </div>
              )}
            </div>
            <div className="space-y-1.5 text-xs text-white/60 mb-4">
              <div><span className="text-white/35">画风</span> {visualStyle} · {gender}</div>
              <div><span className="text-white/35">种族</span> {ethnicity} · {faceShape}</div>
              <div><span className="text-white/35">发型</span> {hairStyle}</div>
              <div className="flex items-center gap-2">
                <span className="text-white/35">发色</span>
                <span className="h-3 w-3 rounded-full border border-white/20" style={{ background: hairColor }} />
                <span>{eyeColor} eyes · {bodyType}</span>
              </div>
              <div><span className="text-white/35">服饰</span> {fashionStyle}</div>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {selectedTags.map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">{t}</span>
                  ))}
                </div>
              )}
            </div>
            <GamePrimaryButton
              className="w-full h-11"
              disabled={generatingPortrait}
              onClick={handleGeneratePortrait}
            >
              {generatingPortrait ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              AI 生成头像
            </GamePrimaryButton>
          </div>
        </aside>
      </div>

      {/* Bottom nav steps */}
      <div className="shrink-0 border-t border-white/[0.06] px-4 py-3 flex items-center justify-between bg-[#0a0612]/95 backdrop-blur-xl">
        <button
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="h-10 px-4 rounded-full border border-white/10 text-sm disabled:opacity-30 flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> 上一步
        </button>
        {step < 2 ? (
          <GamePrimaryButton
            className="h-10 px-6"
            disabled={!stepValid}
            onClick={() => setStep((s) => s + 1)}
          >
            下一步 <ArrowRight className="h-4 w-4" />
          </GamePrimaryButton>
        ) : (
          <GamePrimaryButton
            className="h-10 px-6"
            disabled={!stepValid || saving}
            onClick={handleSubmit}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            开始养成
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
