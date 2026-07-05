'use client';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Save,
  ArrowLeft,
  ArrowRight,
  Wand2,
  Loader2,
  Sparkles,
  Heart,
  User2,
  Mic,
  Check,
} from 'lucide-react';

/* =========================================================
   Option Banks ( goloveai.com  3 )
   ========================================================= */
const VISUAL_STYLES: Array<{ id: 'realistic' | 'anime'; label: string; desc: string }> = [
  { id: 'realistic', label: 'Realistic', desc: 'Photorealistic, lifelike skin & expressions' },
  { id: 'anime', label: 'Anime', desc: 'Vibrant anime-inspired, bold colors & dynamic style' },
];

const ETHNICITIES = [
  'Caucasian', 'Asian', 'Latina', 'Ebony', 'Arab', 'Indian', 'Mixed', 'Slavic',
];

const HAIR_STYLES = ['Straight', 'Wavy', 'Curly', 'Bob', 'Pixie Cut', 'Long Flowing', 'Ponytail', 'Twin Tails', 'Braided'];
const HAIR_COLORS = [
  { hex: '#000000', name: 'Black' },
  { hex: '#4a3728', name: 'Dark Brown' },
  { hex: '#6b3a2a', name: 'Brown' },
  { hex: '#d4a574', name: 'Blonde' },
  { hex: '#f5d742', name: 'Platinum' },
  { hex: '#e84393', name: 'Pink' },
  { hex: '#d946ef', name: 'Magenta' },
  { hex: '#8b5cf6', name: 'Purple' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#10b981', name: 'Green' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#ffffff', name: 'White' },
];
const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Hazel', 'Gray', 'Amber', 'Violet', 'Heterochromia'];
const BODY_TYPES = ['Petite', 'Slim', 'Athletic', 'Curvy', 'Busty', 'Voluptuous', 'Tall'];
const FASHION_STYLES = ['Casual', 'Elegant', 'Gothic', 'Sporty', 'Romantic', 'Edgy', 'Bohemian', 'Cyberpunk'];

const PERSONALITY_TAGS = [
  'Romantic', 'Caring', 'Shy', 'Submissive', 'Dominant', 'Playful',
  'Tsundere', 'Yandere', 'Gentle', 'Passionate', 'Mysterious', 'Energetic',
  'Flirty', 'Innocent', 'Witty', 'Loyal', 'Adventurous', 'Jealous',
  'Nurturing', 'Bratty', 'Doting', 'Independent', 'Possessive', 'Affectionate',
  'Confident', 'Mischievous', 'Sweet', 'Bold', 'Reserved', 'Curious',
  'Sarcastic', 'Optimistic', 'Sensual', 'Honest', 'Protective', 'Cheerful',
  'Sophisticated', 'Carefree', 'Ambitious', 'Naive',
];

const VOICES = [
  { id: 'soft', label: 'Soft & Sweet' },
  { id: 'sultry', label: 'Sultry & Low' },
  { id: 'cheerful', label: 'Cheerful & Bright' },
  { id: 'mature', label: 'Mature & Calm' },
  { id: 'shy', label: 'Shy & Whispery' },
  { id: 'confident', label: 'Confident & Bold' },
  { id: 'playful', label: 'Playful & Teasing' },
  { id: 'asmr', label: 'ASMR Whisper' },
];

const OCCUPATIONS = [
  'Student', 'Teacher', 'Nurse', 'Doctor', 'Engineer', 'Artist',
  'Model', 'Influencer', 'Streamer', 'Gamer', 'Yoga Instructor', 'Personal Trainer',
  'Bartender', 'Photographer', 'Chef', 'CEO', 'Lawyer', 'Athlete',
];

const RELATIONSHIPS = [
  { id: 'girlfriend', label: 'Girlfriend', desc: 'Devoted romantic partner' },
  { id: 'wife', label: 'Wife', desc: 'Married, deep bond' },
  { id: 'stranger', label: 'Flirty Stranger', desc: 'You just met, sparks flying' },
  { id: 'bestie', label: 'Best Friend', desc: 'Lifelong loyal bond' },
  { id: 'coworker', label: 'Coworker', desc: 'Secret office crush' },
  { id: 'tutor', label: 'Tutor', desc: 'Private lessons, late nights' },
  { id: 'roommate', label: 'Roommate', desc: 'Sharing space, drawing closer' },
  { id: 'neighbor', label: 'Neighbor', desc: 'Friendly girl next door' },
  { id: 'boss', label: 'Boss', desc: 'Powerful & demanding' },
  { id: 'maid', label: 'Maid', desc: 'Loyal & attentive' },
  { id: 'princess', label: 'Princess', desc: 'Royal romance fantasy' },
  { id: 'rival', label: 'Rival', desc: 'Tension turns to passion' },
];

interface Outfit {
  id: string;
  name: string;
  description?: string;
  tier: string;
  category: string;
}

/* =========================================================
   Stepper Component
   ========================================================= */
function Stepper({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 px-4 py-5 border-b border-white/[0.06] bg-[#0E0E1A]/95 backdrop-blur-xl sticky top-0 z-10">
      {steps.map((label, idx) => {
        const isActive = idx === current;
        const isDone = idx < current;
        return (
          <div key={label} className="flex items-center gap-2 sm:gap-3">
            <div
              className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-xs sm:text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white shadow-[0_0_20px_rgba(255,45,120,0.4)]'
                  : isDone
                    ? 'bg-[#FF2D78]/80 text-white'
                    : 'bg-white/[0.06] text-[#8B8BA3]'
              }`}
            >
              {isDone ? <Check className="h-4 w-4" /> : idx + 1}
            </div>
            <span
              className={`hidden sm:block text-sm font-medium transition-colors ${
                isActive ? 'text-white' : 'text-[#8B8BA3]'
              }`}
            >
              {label}
            </span>
            {idx < steps.length - 1 && (
              <span className={`h-px w-6 sm:w-12 transition-colors ${isDone ? 'bg-[#FF2D78]/60' : 'bg-white/[0.08]'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Pill option button */
function OptionPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-all ${
        active
          ? 'bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white border-transparent shadow-[0_0_16px_rgba(255,45,120,0.3)]'
          : 'bg-white/[0.04] border-white/[0.08] text-[#8B8BA3] hover:border-[#FF2D78]/40 hover:text-white backdrop-blur-sm'
      }`}
    >
      {children}
    </button>
  );
}

/* Card option (for visual style / ethnicity / relationship) */
function OptionCard({
  active,
  onClick,
  title,
  description,
  emoji,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  emoji?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
        active
          ? 'border-[#FF2D78]/60 bg-[#FF2D78]/5 ring-2 ring-[#FF2D78]/30 shadow-[0_0_24px_rgba(255,45,120,0.12)]'
          : 'border-white/[0.08] bg-white/[0.03] backdrop-blur-sm hover:border-[#FF2D78]/40 hover:bg-white/[0.06]'
      }`}
    >
      {active && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#FF2D78] text-white">
          <Check className="h-3 w-3" />
        </span>
      )}
      {emoji && <span className="text-2xl">{emoji}</span>}
      <span className="font-semibold text-white text-sm sm:text-base">{title}</span>
      {description && <span className="text-[11px] sm:text-xs text-[#8B8BA3] leading-relaxed">{description}</span>}
    </button>
  );
}

/* =========================================================
   Main Page
   ========================================================= */
export default function CreatePage() {
  const router = useRouter();

  // Stepper
  const [step, setStep] = useState(0);

  // Step 1  Look
  const [visualStyle, setVisualStyle] = useState<'realistic' | 'anime'>('realistic');
  const [ethnicity, setEthnicity] = useState('Caucasian');
  const [hairStyle, setHairStyle] = useState('Long Flowing');
  const [hairColor, setHairColor] = useState('#d4a574');
  const [eyeColor, setEyeColor] = useState('Blue');
  const [bodyType, setBodyType] = useState('Slim');
  const [fashionStyle, setFashionStyle] = useState('Casual');
  const [appearancePrompt, setAppearancePrompt] = useState('');

  // Step 2  Personality
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [voice, setVoice] = useState('soft');
  const [occupation, setOccupation] = useState('Student');
  const [hobbies, setHobbies] = useState('');

  // Step 3  Identity & Relationship
  const [name, setName] = useState('');
  const [age, setAge] = useState(22);
  const [shortDescription, setShortDescription] = useState('');
  const [relationship, setRelationship] = useState('girlfriend');
  const [backstory, setBackstory] = useState('');
  const [selectedOutfit, setSelectedOutfit] = useState<string | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [generatingPortrait, setGeneratingPortrait] = useState(false);

  // Outfits
  const [outfits, setOutfits] = useState<Outfit[]>([]);

  // Submit
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch('/api/outfits')
      .then((r) => r.json())
      .then((data: { outfits?: Outfit[] }) => {
        setOutfits(data.outfits || []);
        if (data.outfits && data.outfits.length > 0) setSelectedOutfit(data.outfits[0].id);
      })
      .catch(() => {});
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length >= 8 ? prev : [...prev, tag]
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
  }, [visualStyle, ethnicity, hairStyle, hairColor, eyeColor, bodyType, fashionStyle, appearancePrompt]);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const relMeta = RELATIONSHIPS.find((r) => r.id === relationship);
      const fullCharacterCard = [
        `Visual style: ${visualStyle}.`,
        `Ethnicity: ${ethnicity}.`,
        `Occupation: ${occupation}.`,
        `Voice: ${voice}.`,
        relMeta ? `Relationship to user: ${relMeta.label}  ${relMeta.desc}.` : '',
        hobbies ? `Hobbies & interests: ${hobbies}.` : '',
        backstory ? `Backstory: ${backstory}` : '',
      ]
        .filter(Boolean)
        .join('\n');

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
          tags: [...selectedTags, ethnicity, occupation, relMeta?.label || 'Girlfriend'],
          outfit_id: selectedOutfit,
          portrait_url: portraitUrl || undefined,
          meta: {
            visual_style: visualStyle,
            ethnicity,
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
        setError(data.error || 'Failed to create');
        return;
      }
      router.push('/');
    } catch (e) {
      logger.error(String(e));
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }, [
    name, age, shortDescription, selectedTags, hairStyle, hairColor, eyeColor, bodyType,
    fashionStyle, selectedOutfit, portraitUrl, visualStyle, ethnicity, voice, occupation,
    relationship, hobbies, backstory, appearancePrompt, router,
  ]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold italic gradient-text">Create Your Girlfriend</h1>
            <p className="text-xs text-[#8B8BA3]">Design your perfect companion in 3 steps</p>
          </div>
        </div>
        {step === 2 && (
          <Button
            onClick={handleSubmit}
            disabled={!stepValid || saving}
            className="gap-2 bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white shadow-[0_0_20px_rgba(255,45,120,0.3)] hover:opacity-90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Create
          </Button>
        )}
      </div>

      {/* Stepper */}
      <Stepper current={step} steps={['Look', 'Personality', 'Identity']} />

      {/* Body  2 columns: form + preview */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* Left: form */}
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl p-4 sm:p-6 space-y-8">
            {/* ============ STEP 1 ============ */}
            {step === 0 && (
              <>
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                    <Sparkles className="h-4 w-4 text-rose-400" /> Visual Style
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    {VISUAL_STYLES.map((v) => (
                      <OptionCard
                        key={v.id}
                        active={visualStyle === v.id}
                        onClick={() => setVisualStyle(v.id)}
                        title={v.label}
                        description={v.desc}
                        emoji={v.id === 'realistic' ? '' : ''}
                      />
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className="mb-3 text-base font-semibold">Ethnicity</h2>
                  <div className="flex flex-wrap gap-2">
                    {ETHNICITIES.map((e) => (
                      <OptionPill key={e} active={ethnicity === e} onClick={() => setEthnicity(e)}>
                        {e}
                      </OptionPill>
                    ))}
                  </div>
                </section>

                <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <h2 className="mb-3 text-base font-semibold">Hair Style</h2>
                    <div className="flex flex-wrap gap-2">
                      {HAIR_STYLES.map((h) => (
                        <OptionPill key={h} active={hairStyle === h} onClick={() => setHairStyle(h)}>
                          {h}
                        </OptionPill>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h2 className="mb-3 text-base font-semibold">Eye Color</h2>
                    <div className="flex flex-wrap gap-2">
                      {EYE_COLORS.map((e) => (
                        <OptionPill key={e} active={eyeColor === e} onClick={() => setEyeColor(e)}>
                          {e}
                        </OptionPill>
                      ))}
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="mb-3 text-base font-semibold">Hair Color</h2>
                  <div className="flex flex-wrap gap-3">
                    {HAIR_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setHairColor(c.hex)}
                        title={c.name}
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                          hairColor === c.hex
                            ? 'border-[#FF2D78] ring-2 ring-[#FF2D78]/30 scale-110'
                            : 'border-white/[0.08] hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {hairColor === c.hex && <Check className="h-4 w-4" style={{ color: c.hex === '#ffffff' ? '#000' : '#fff' }} />}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <h2 className="mb-3 text-base font-semibold">Body Type</h2>
                    <div className="flex flex-wrap gap-2">
                      {BODY_TYPES.map((b) => (
                        <OptionPill key={b} active={bodyType === b} onClick={() => setBodyType(b)}>
                          {b}
                        </OptionPill>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h2 className="mb-3 text-base font-semibold">Fashion Style</h2>
                    <div className="flex flex-wrap gap-2">
                      {FASHION_STYLES.map((f) => (
                        <OptionPill key={f} active={fashionStyle === f} onClick={() => setFashionStyle(f)}>
                          {f}
                        </OptionPill>
                      ))}
                    </div>
                  </div>
                </section>

                <section>
                  <Label className="mb-2 block text-sm">Custom Appearance Prompt (Optional)</Label>
                  <Textarea
                    rows={3}
                    placeholder="e.g. freckles on cheeks, dimples when smiling, small mole near lips..."
                    value={appearancePrompt}
                    onChange={(e) => setAppearancePrompt(e.target.value)}
                    className="resize-none"
                  />
                </section>
              </>
            )}

            {/* ============ STEP 2 ============ */}
            {step === 1 && (
              <>
                <section>
                  <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
                    <Heart className="h-4 w-4 text-rose-400" /> Personality Traits
                  </h2>
                  <p className="mb-3 text-xs text-[#8B8BA3]">Pick 18 traits ({selectedTags.length}/8)</p>
                  <div className="flex flex-wrap gap-2">
                    {PERSONALITY_TAGS.map((tag) => (
                      <OptionPill key={tag} active={selectedTags.includes(tag)} onClick={() => toggleTag(tag)}>
                        {tag}
                      </OptionPill>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                    <Mic className="h-4 w-4 text-rose-400" /> Voice
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {VOICES.map((v) => (
                      <OptionPill key={v.id} active={voice === v.id} onClick={() => setVoice(v.id)}>
                        {v.label}
                      </OptionPill>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className="mb-3 text-base font-semibold">Occupation</h2>
                  <div className="flex flex-wrap gap-2">
                    {OCCUPATIONS.map((o) => (
                      <OptionPill key={o} active={occupation === o} onClick={() => setOccupation(o)}>
                        {o}
                      </OptionPill>
                    ))}
                  </div>
                </section>

                <section>
                  <Label className="mb-2 block text-sm">Hobbies & Interests (Optional)</Label>
                  <Textarea
                    rows={3}
                    placeholder="e.g. loves vintage films, plays acoustic guitar, into yoga and matcha..."
                    value={hobbies}
                    onChange={(e) => setHobbies(e.target.value)}
                    className="resize-none"
                  />
                </section>
              </>
            )}

            {/* ============ STEP 3 ============ */}
            {step === 2 && (
              <>
                <section className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="mb-2 block text-sm">Name <span className="text-rose-400">*</span></Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Sophia"
                      maxLength={32}
                    />
                  </div>
                  <div>
                    <Label htmlFor="age" className="mb-2 block text-sm">Age (18+) <span className="text-rose-400">*</span></Label>
                    <Input
                      id="age"
                      type="number"
                      min={18}
                      max={99}
                      value={age}
                      onChange={(e) => setAge(parseInt(e.target.value) || 18)}
                    />
                  </div>
                </section>

                <section>
                  <Label className="mb-2 block text-sm">Tagline (Optional)</Label>
                  <Input
                    placeholder="e.g. Bookstore owner with secrets  and a quiet smile"
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    maxLength={120}
                  />
                </section>

                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                    <User2 className="h-4 w-4 text-rose-400" /> Relationship Type
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {RELATIONSHIPS.map((r) => (
                      <OptionCard
                        key={r.id}
                        active={relationship === r.id}
                        onClick={() => setRelationship(r.id)}
                        title={r.label}
                        description={r.desc}
                      />
                    ))}
                  </div>
                </section>

                <section>
                  <Label className="mb-2 block text-sm">Backstory (Optional)</Label>
                  <Textarea
                    rows={4}
                    placeholder="A short story about her past, her dreams, why she's the way she is..."
                    value={backstory}
                    onChange={(e) => setBackstory(e.target.value)}
                    className="resize-none"
                  />
                </section>

                {outfits.length > 0 && (
                  <section>
                    <h2 className="mb-3 text-base font-semibold">Starter Outfit</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {outfits.slice(0, 6).map((o) => (
                        <OptionCard
                          key={o.id}
                          active={selectedOutfit === o.id}
                          onClick={() => setSelectedOutfit(o.id)}
                          title={o.name}
                          description={o.tier === 'free' ? 'Free' : o.tier.toUpperCase()}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {error && (
                  <div className="rounded-lg border border-[#FF2D78]/40 bg-[#FF2D78]/10 px-4 py-3 text-sm text-[#FF6BA6]">
                    {error}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Right: live preview */}
        <aside className="hidden lg:block w-[340px] border-l border-white/[0.06] bg-white/[0.04] overflow-y-auto">
          <div className="p-5 space-y-4">
            <p className="text-xs uppercase tracking-wide text-[#8B8BA3]">Live Preview</p>
            <Card className="overflow-hidden border-white/[0.08]">
              <div className="aspect-[3/4] bg-gradient-to-br from-[#FF2D78]/40 via-[#8b5cf6]/30 to-[#6d28d9]/40 relative flex items-center justify-center">
                {portraitUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={portraitUrl} alt="preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="text-center px-4 space-y-3">
                    <div
                      className="mx-auto h-20 w-20 rounded-full border-4 border-white/20"
                      style={{ backgroundColor: hairColor }}
                    />
                    <p className="text-xs text-white/70">No portrait yet</p>
                  </div>
                )}
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{name || 'Unnamed'}, {age}</span>
                  <span className="text-xs text-[#8B8BA3] capitalize">{visualStyle}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[ethnicity, bodyType, fashionStyle, ...selectedTags.slice(0, 3)].map((t) => (
                    <span key={t} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/80">
                      {t}
                    </span>
                  ))}
                </div>
                {shortDescription && (
                  <p className="text-xs text-[#8B8BA3] line-clamp-3">{shortDescription}</p>
                )}
              </div>
            </Card>

            <Button
              onClick={handleGeneratePortrait}
              disabled={generatingPortrait}
              variant="outline"
              className="w-full gap-2"
            >
              {generatingPortrait ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {portraitUrl ? 'Regenerate Portrait' : 'Generate Portrait'}
            </Button>

            <div className="rounded-lg bg-white/[0.03] p-3 text-[11px] text-[#8B8BA3] leading-relaxed">
              <p className="font-semibold text-white mb-1">Tips</p>
              <ul className="space-y-1 list-disc pl-4">
                <li>Portrait costs 1 credit  first one free</li>
                <li>You can edit her anytime after creation</li>
                <li>NSFW mode unlocks after intimacy Lv 3</li>
              </ul>
            </div>
          </div>
        </aside>
      </div>

      {/* Footer Nav */}
      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 sm:px-6 py-4 bg-background/95 backdrop-blur">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <span className="text-xs text-[#8B8BA3]">Step {step + 1} of 3</span>
        {step < 2 ? (
          <Button
            onClick={() => setStep((s) => Math.min(2, s + 1))}
            disabled={!stepValid}
            className="gap-2 bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white shadow-[0_0_20px_rgba(255,45,120,0.3)] hover:opacity-90"
          >
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!stepValid || saving}
            className="gap-2 bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white shadow-[0_0_20px_rgba(255,45,120,0.3)] hover:opacity-90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Create Girlfriend
          </Button>
        )}
      </div>
    </div>
  );
}
