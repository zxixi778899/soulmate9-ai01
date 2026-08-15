'use client';

/**
 * PresetPicker — visual preset panel for the chat input bar.
 *
 * Loads the unified gen_preset_catalog via /api/gen-presets and lets the
 * user tap a scene/outfit/mood thumbnail. The selection travels with the
 * next generation as structured params (preset_category/preset_slug) to
 * /api/gen/start, replacing free-text guessing.
 *
 * NSFW blur lock: presets above the caller's intimacy cap are listed but
 * blurred with a lock badge until unlocked (compliant preview, per plan).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Lock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';

export type PickedPreset = {
  category: string;
  slug: string;
  label: string;
};

type ApiPreset = {
  category: string;
  slug: string;
  label_en: string;
  label_zh: string;
  preview_url: string | null;
  nsfw_level: number;
  tier: string;
  locked: boolean;
};

const TABS = ['scene', 'outfit', 'mood'] as const;
type TabKey = (typeof TABS)[number];

export function PresetPicker(props: {
  girlfriendId?: string;
  selected?: PickedPreset | null;
  onSelect: (preset: PickedPreset | null) => void;
}) {
  const { girlfriendId, selected, onSelect } = props;
  const { t, locale } = useTranslation();
  const isZh = String(locale || '').toLowerCase().startsWith('zh');

  const [tab, setTab] = useState<TabKey>('scene');
  const [presets, setPresets] = useState<ApiPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [lockedHint, setLockedHint] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    const qs = new URLSearchParams({ category: tab });
    if (girlfriendId) qs.set('girlfriend_id', girlfriendId);
    authedFetch(`/api/gen-presets?${qs.toString()}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setPresets(Array.isArray(data?.presets) ? data.presets : []);
        setLoading(false);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [tab, girlfriendId]);

  useEffect(() => {
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  const tabLabel = useCallback(
    (key: TabKey): string => {
      if (key === 'scene') return t('chat.presetCatScene') || (isZh ? '场景' : 'Scene');
      if (key === 'outfit') return t('chat.presetCatOutfit') || (isZh ? '服装' : 'Outfit');
      return t('chat.presetCatMood') || (isZh ? '氛围' : 'Mood');
    },
    [t, isZh],
  );

  const handlePick = (preset: ApiPreset) => {
    if (preset.locked) {
      setLockedHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setLockedHint(false), 2600);
      return;
    }
    const label = isZh ? preset.label_zh || preset.label_en : preset.label_en || preset.label_zh;
    const isSame =
      selected?.category === preset.category && selected?.slug === preset.slug;
    onSelect(isSame ? null : { category: preset.category, slug: preset.slug, label });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-[11px] transition-all active:scale-95',
                tab === key
                  ? 'glass-btn !rounded-full !h-auto !px-2.5 !py-1 text-white border-[#FF2D78]/40'
                  : 'glass text-[#8B8BA3] hover:text-white',
              )}
            >
              {tabLabel(key)}
            </button>
          ))}
        </div>
        {lockedHint && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[#ffb3cd] animate-in fade-in duration-150">
            <Lock className="h-3 w-3" />
            {t('chat.presetLocked') || (isZh ? '亲密度提升后解锁' : 'Unlocks as intimacy grows')}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[#FF2D78]/60" />
        </div>
      ) : presets.length === 0 ? (
        <p className="text-[11px] text-white/35 text-center py-4">
          {isZh ? '暂无预设' : 'No presets yet'}
        </p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-44 overflow-y-auto overscroll-contain pr-0.5">
          {presets.map((preset) => {
            const active =
              selected?.category === preset.category && selected?.slug === preset.slug;
            const label = isZh
              ? preset.label_zh || preset.label_en
              : preset.label_en || preset.label_zh;
            return (
              <button
                key={`${preset.category}-${preset.slug}`}
                type="button"
                onClick={() => handlePick(preset)}
                className={cn(
                  'relative aspect-[3/4] rounded-xl overflow-hidden border transition-all active:scale-95 text-left',
                  active
                    ? 'border-[#FF2D78] shadow-[0_0_14px_rgba(255,45,120,0.4)] ring-1 ring-[#FF2D78]/60'
                    : 'border-white/10 hover:border-[#FF2D78]/45',
                )}
                title={label}
              >
                {preset.preview_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- dynamic catalog thumbnail URL
                  <img
                    src={preset.preview_url}
                    alt={label}
                    loading="lazy"
                    className={cn(
                      'absolute inset-0 h-full w-full object-cover',
                      preset.locked && 'blur-md scale-110 opacity-70',
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      'absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#2a0f22] to-[#12081a]',
                      preset.locked && 'blur-[2px] opacity-80',
                    )}
                  >
                    <Sparkles className="h-5 w-5 text-[#ff6ba6]/60" />
                  </span>
                )}
                {preset.locked && (
                  <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center">
                    <Lock className="h-3 w-3 text-[#ffb3cd]" />
                  </span>
                )}
                {preset.tier === 'premium' && !preset.locked && (
                  <span className="absolute top-1 left-1 text-[8px] uppercase tracking-wide px-1 rounded bg-black/50 text-amber-300">
                    VIP
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-[9px] leading-tight text-white bg-gradient-to-t from-black/75 to-transparent truncate">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
