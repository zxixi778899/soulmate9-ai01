'use client';

/**
 * Studio — unified creative console for the matrix generation stack.
 *
 * Left column: subject (female / male / trans) + style family (realistic /
 * anime) filters feeding the scene preset grid (single source of truth:
 * /api/gen-presets, same catalog as the chat PresetPicker; NSFW presets stay
 * blurred + locked under the intimacy cap).
 *
 * Right column: enhancement controls — pose reference (upload → ControlNet
 * openpose), one-tap outfit (wear_prompt), face fix, upscale, identity lock
 * (IP-Adapter from the companion portrait) and candidate count.
 *
 * Center: result canvas with GenJobProgress, candidate selection and the
 * WAN 2.2 image→video bridge, plus the recent job history.
 *
 * All generations go through POST /api/gen/start (kind 'image'); capability
 * flags (control / face_fix / upscale / identity_image) are normalized by
 * gen-hub and consumed by the delegated pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Film, ImagePlus, Loader2, Lock, Sparkles, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';
import { GenJobProgress } from '@/components/common/GenJobProgress';
import { useGenJob } from '@/hooks/useGenJob';

type Girl = {
  id: string;
  name: string;
  portrait_url: string | null;
  avatar_url: string | null;
  image_url: string | null;
};

type StudioPreset = {
  category: string;
  slug: string;
  label_en: string;
  label_zh: string;
  preview_url: string | null;
  nsfw_level: number;
  tier: string;
  locked: boolean;
  pose_reference?: string | null;
  workflow_flags?: { face_fix?: boolean; upscale?: number } | null;
};

type OutfitOption = {
  id: string;
  name: string;
  tier: string;
  category: string;
  wear_prompt: string;
  emoji?: string;
};

type HistoryJob = {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
};

type Candidate = { job_id: string | null; image_url: string | null; status: string };

const GENDERS = ['female', 'male', 'trans'] as const;
const STYLES = ['realistic', 'anime'] as const;
const UPSCALE_OPTIONS = [0, 2, 4] as const;
const COUNT_OPTIONS = [1, 2, 3, 4] as const;

function girlIdentityUrl(girl: Girl | null): string | null {
  if (!girl) return null;
  return girl.portrait_url || girl.image_url || girl.avatar_url || null;
}

export default function StudioPage() {
  const { t, locale } = useTranslation();
  const isZh = String(locale || '').toLowerCase().startsWith('zh');

  // ── Companions ──
  const [girls, setGirls] = useState<Girl[]>([]);
  const [selectedGirlId, setSelectedGirlId] = useState<string>('');
  const selectedGirl = useMemo(
    () => girls.find((g) => g.id === selectedGirlId) || null,
    [girls, selectedGirlId],
  );

  // ── Preset matrix filters ──
  const [gender, setGender] = useState<(typeof GENDERS)[number]>('female');
  const [styleFamily, setStyleFamily] = useState<(typeof STYLES)[number] | ''>('');
  const [presets, setPresets] = useState<StudioPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<StudioPreset | null>(null);
  const [lockedHint, setLockedHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Right column controls ──
  const [prompt, setPrompt] = useState('');
  const [outfits, setOutfits] = useState<OutfitOption[]>([]);
  const [outfitId, setOutfitId] = useState('');
  const [poseUrl, setPoseUrl] = useState<string | null>(null);
  const [poseStrength, setPoseStrength] = useState(0.7);
  const [uploadingPose, setUploadingPose] = useState(false);
  const [faceFix, setFaceFix] = useState(true);
  const [upscale, setUpscale] = useState<(typeof UPSCALE_OPTIONS)[number]>(0);
  const [identityOn, setIdentityOn] = useState(true);
  const [count, setCount] = useState<(typeof COUNT_OPTIONS)[number]>(1);

  // ── Generation state ──
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { job: activeJob } = useGenJob(activeJobId, { pollMs: 2500 });

  // ── Video bridge ──
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRunRef = useRef(0);

  // ── History ──
  const [history, setHistory] = useState<HistoryJob[]>([]);
  const historyRefreshRef = useRef(0);

  const refreshHistory = useCallback(() => {
    historyRefreshRef.current += 1;
    const token = historyRefreshRef.current;
    authedFetch('/api/gen/jobs?limit=12')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (token !== historyRefreshRef.current) return;
        setHistory(Array.isArray(data?.jobs) ? data.jobs : []);
      })
      .catch(() => {});
  }, []);

  // Load companions once.
  useEffect(() => {
    const ctrl = new AbortController();
    authedFetch('/api/girlfriends', { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ctrl.signal.aborted) return;
        const list: Girl[] = Array.isArray(data?.girlfriends) ? data.girlfriends : [];
        setGirls(list);
        setSelectedGirlId((prev) => prev || list[0]?.id || '');
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Load the outfit catalog once (one-tap outfit control).
  useEffect(() => {
    const ctrl = new AbortController();
    authedFetch('/api/outfits', { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setOutfits(Array.isArray(data?.outfits) ? data.outfits : []);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Preset grid: category=scene + matrix filters + intimacy-gated locks.
  useEffect(() => {
    const ctrl = new AbortController();
    setPresetsLoading(true);
    const qs = new URLSearchParams({ category: 'scene', gender });
    if (styleFamily) qs.set('style_family', styleFamily);
    if (selectedGirlId) qs.set('girlfriend_id', selectedGirlId);
    authedFetch(`/api/gen-presets?${qs.toString()}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setPresets(Array.isArray(data?.presets) ? data.presets : []);
        setPresetsLoading(false);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setPresetsLoading(false);
      });
    return () => ctrl.abort();
  }, [gender, styleFamily, selectedGirlId]);

  // Initial history load.
  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  // Mirror the finished job result onto the canvas.
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'completed' || !activeJob.result) return;
    const result = activeJob.result;
    const resultCandidates = result.candidates;
    if (Array.isArray(resultCandidates) && resultCandidates.length > 0) {
      setCandidates(resultCandidates as Candidate[]);
      return;
    }
    const url = typeof result.image_url === 'string' ? result.image_url : '';
    if (url) {
      setResultImage(url);
      refreshHistory();
    }
  }, [activeJob, refreshHistory]);

  const handlePickPreset = (preset: StudioPreset) => {
    if (preset.locked) {
      setLockedHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setLockedHint(false), 2600);
      return;
    }
    setSelectedPreset((prev) =>
      prev?.category === preset.category && prev?.slug === preset.slug ? null : preset,
    );
  };

  const handlePoseUpload = async (file: File) => {
    setUploadingPose(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'studio_poses');
      const res = await authedFetch('/api/upload', { method: 'POST', body: form });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && data?.url) {
        setPoseUrl(data.url);
      } else {
        setSubmitError(isZh ? '姿势图上传失败' : 'Pose upload failed');
      }
    } catch {
      setSubmitError(isZh ? '姿势图上传失败' : 'Pose upload failed');
    } finally {
      setUploadingPose(false);
    }
  };

  const generate = async () => {
    if (busy || !selectedGirlId) return;
    setBusy(true);
    setSubmitError(null);
    setResultImage(null);
    setCandidates([]);
    setVideoUrl(null);
    setVideoError(null);

    const outfit = outfits.find((o) => o.id === outfitId);
    const requestParts = [
      prompt.trim(),
      outfit?.wear_prompt || '',
      selectedPreset?.pose_reference || '',
    ].filter(Boolean);

    const body: Record<string, unknown> = {
      kind: 'image',
      girlfriend_id: selectedGirlId,
      user_request: requestParts.join(', ') || 'a beautiful portrait',
      locale,
      source: 'studio',
      idempotency_key: `studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    if (selectedPreset) {
      body.preset_category = selectedPreset.category;
      body.preset_slug = selectedPreset.slug;
    }
    if (faceFix) body.face_fix = true;
    if (upscale > 1) body.upscale = upscale;
    const identityImage = girlIdentityUrl(selectedGirl);
    if (identityOn && identityImage) body.identity_image = identityImage;
    if (poseUrl) {
      body.control = { type: 'openpose', image: poseUrl, strength: poseStrength };
    }
    if (count > 1) {
      body.candidate = true;
      body.count = count;
    }

    try {
      const res = await authedFetch('/api/gen/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        job_id?: string;
        image_url?: string;
        candidate?: boolean;
        candidates?: Candidate[];
        error?: string;
        localized_error?: string;
      } | null;
      if (!res.ok || !data) {
        setSubmitError(data?.localized_error || data?.error || (isZh ? '生成失败' : 'Generation failed'));
        setBusy(false);
        return;
      }
      if (Array.isArray(data.candidates) && data.candidates.length > 0) {
        setCandidates(data.candidates);
      }
      if (data.job_id) {
        setActiveJobId(data.job_id);
      } else if (data.image_url) {
        setResultImage(data.image_url);
      }
      refreshHistory();
    } catch {
      setSubmitError(isZh ? '网络异常，请重试' : 'Network error, please retry');
    } finally {
      setBusy(false);
    }
  };

  const generateVideo = async () => {
    if (videoBusy || !resultImage) return;
    const runToken = Date.now();
    videoRunRef.current = runToken;
    setVideoBusy(true);
    setVideoError(null);
    setVideoUrl(null);
    try {
      const res = await authedFetch('/api/generate-video', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input_image: resultImage,
          girlfriend_id: selectedGirlId || undefined,
          model: 'wan22',
          duration: 5,
          queue: true,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        job_id?: string;
        provider_job_id?: string;
        endpoint_id?: string;
        video_url?: string;
        error?: string;
      } | null;
      if (!res.ok || !data) {
        setVideoError(data?.error || (isZh ? '视频生成失败' : 'Video generation failed'));
        setVideoBusy(false);
        return;
      }
      if (data.video_url) {
        setVideoUrl(data.video_url);
        setVideoBusy(false);
        return;
      }
      const providerJobId = data.provider_job_id || data.job_id || '';
      const endpointId = data.endpoint_id || '';
      if (!providerJobId) {
        setVideoError(isZh ? '视频任务创建失败' : 'Video job was not created');
        setVideoBusy(false);
        return;
      }
      // Queue mode: poll the unified status adapter until WAN returns a clip.
      const deadline = Date.now() + 240_000;
      while (Date.now() < deadline && videoRunRef.current === runToken) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const qs = new URLSearchParams({ job_id: providerJobId, kind: 'video' });
          if (endpointId) qs.set('endpoint_id', endpointId);
          if (selectedGirlId) qs.set('girlfriend_id', selectedGirlId);
          const pollRes = await authedFetch(`/api/ai/status?${qs.toString()}`);
          const st = (await pollRes.json().catch(() => null)) as {
            video_url?: string;
            status?: string;
            error?: string;
          } | null;
          if (st?.video_url) {
            setVideoUrl(st.video_url);
            setVideoBusy(false);
            refreshHistory();
            return;
          }
          if (st?.status === 'FAILED' || st?.error) {
            setVideoError(st.error || (isZh ? '视频生成失败' : 'Video generation failed'));
            setVideoBusy(false);
            return;
          }
        } catch {
          // Network hiccup — keep polling until the deadline.
        }
      }
      setVideoError(isZh ? '视频生成超时，请稍后在历史中查看' : 'Video timed out; check history later');
      setVideoBusy(false);
    } catch {
      setVideoError(isZh ? '网络异常，请重试' : 'Network error, please retry');
      setVideoBusy(false);
    }
  };

  const identityImage = girlIdentityUrl(selectedGirl);
  const jobActive = Boolean(activeJobId && activeJob && activeJob.status !== 'completed' && activeJob.status !== 'failed' && activeJob.status !== 'cancelled');

  const sectionTitle = 'text-[10px] uppercase tracking-wider text-white/40 mb-2';
  const panelClass = 'rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-4';

  return (
    <div className="min-h-screen text-white pb-16" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      {/* ── Header + companion strip ── */}
      <section className="pt-6 px-4 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#00e5ff]">
              <Sparkles className="h-3 w-3" /> {t('studio.tagline') || 'Studio · Generate · Create'}
            </div>
            <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-[#00e5ff] via-[#3b82f6] to-[#ff2e88] bg-clip-text text-transparent">
                {t('studio.title') || (isZh ? '创作台' : 'Creator Studio')}
              </span>
            </h1>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide max-w-full">
            {girls.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGirlId(g.id)}
                className={cn(
                  'shrink-0 flex flex-col items-center gap-1 group',
                  selectedGirlId === g.id ? '' : 'opacity-70 hover:opacity-100',
                )}
                title={g.name}
              >
                <span
                  className={cn(
                    'h-12 w-12 rounded-full overflow-hidden border-2 transition-all',
                    selectedGirlId === g.id
                      ? 'border-[#ff2e88] shadow-[0_0_16px_rgba(255,46,136,0.5)]'
                      : 'border-white/10 group-hover:border-white/30',
                  )}
                >
                  {g.avatar_url || g.portrait_url || g.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- dynamic storage URL
                    <img
                      src={g.avatar_url || g.portrait_url || g.image_url || ''}
                      alt={g.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-white/[0.06] text-xs">
                      {g.name.slice(0, 1)}
                    </span>
                  )}
                </span>
                <span className="text-[9px] text-white/50 max-w-14 truncate">{g.name}</span>
              </button>
            ))}
            {girls.length === 0 && (
              <span className="text-xs text-white/35">
                {t('studio.noGirls') || (isZh ? '先去创建你的伴侣 →' : 'Create your companion first →')}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Three-column console ── */}
      <section className="mt-6 px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px] gap-4">
        {/* ══ Left: preset matrix ══ */}
        <div className={panelClass}>
          <div className={sectionTitle}>{t('studio.subject') || (isZh ? '题材' : 'Subject')}</div>
          <div className="flex flex-wrap gap-1.5">
            {GENDERS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setGender(key)}
                className={cn(
                  'h-7 px-3 rounded-full border text-[11px] transition-all',
                  gender === key
                    ? 'border-[#ff2e88]/60 bg-[#ff2e88]/15 text-white'
                    : 'border-white/10 text-white/50 hover:text-white',
                )}
              >
                {key === 'female'
                  ? t('studio.genderFemale') || (isZh ? '女性' : 'Female')
                  : key === 'male'
                    ? t('studio.genderMale') || (isZh ? '男性' : 'Male')
                    : t('studio.genderTrans') || (isZh ? '跨性别' : 'Trans')}
              </button>
            ))}
          </div>

          <div className={cn(sectionTitle, 'mt-4')}>{t('studio.style') || (isZh ? '风格' : 'Style')}</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStyleFamily('')}
              className={cn(
                'h-7 px-3 rounded-full border text-[11px] transition-all',
                styleFamily === ''
                  ? 'border-[#ff2e88]/60 bg-[#ff2e88]/15 text-white'
                  : 'border-white/10 text-white/50 hover:text-white',
              )}
            >
              {t('studio.styleAll') || (isZh ? '全部' : 'All')}
            </button>
            {STYLES.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStyleFamily(key)}
                className={cn(
                  'h-7 px-3 rounded-full border text-[11px] transition-all',
                  styleFamily === key
                    ? 'border-[#ff2e88]/60 bg-[#ff2e88]/15 text-white'
                    : 'border-white/10 text-white/50 hover:text-white',
                )}
              >
                {key === 'realistic'
                  ? t('studio.styleRealistic') || (isZh ? '写实' : 'Realistic')
                  : t('studio.styleAnime') || (isZh ? '二次元' : 'Anime')}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className={cn(sectionTitle, 'mb-0')}>
              {t('studio.presets') || (isZh ? '场景预设' : 'Scene presets')}
            </div>
            {lockedHint && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[#ffb3cd]">
                <Lock className="h-3 w-3" />
                {t('chat.presetLocked') || (isZh ? '亲密度提升后解锁' : 'Unlocks as intimacy grows')}
              </span>
            )}
          </div>
          {presetsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[#ff6ba6]" />
            </div>
          ) : presets.length === 0 ? (
            <p className="text-[11px] text-white/35 text-center py-8">
              {isZh ? '暂无预设' : 'No presets yet'}
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-1.5 max-h-[420px] overflow-y-auto overscroll-contain pr-0.5">
              {presets.map((preset) => {
                const active =
                  selectedPreset?.category === preset.category && selectedPreset?.slug === preset.slug;
                const label = isZh ? preset.label_zh || preset.label_en : preset.label_en || preset.label_zh;
                return (
                  <button
                    key={`${preset.category}-${preset.slug}`}
                    type="button"
                    onClick={() => handlePickPreset(preset)}
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

        {/* ══ Center: canvas + progress + history ══ */}
        <div className={cn(panelClass, 'flex flex-col')}>
          <div className="flex-1 flex flex-col items-center justify-center min-h-[380px]">
            {videoUrl ? (
              <video src={videoUrl} controls autoPlay loop className="max-h-[440px] w-full max-w-md rounded-2xl border border-[#ff2e88]/50" />
            ) : resultImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic generation output URL
              <img
                src={resultImage}
                alt="Generated"
                className="max-h-[440px] max-w-full rounded-2xl border border-[#ff2e88]/50 shadow-[0_0_36px_rgba(255,46,136,0.25)] object-contain"
              />
            ) : candidates.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                {candidates.map((c, i) => (
                  <button
                    key={c.job_id || i}
                    type="button"
                    onClick={() => {
                      if (c.image_url) {
                        setResultImage(c.image_url);
                        setCandidates([]);
                      }
                    }}
                    className="relative aspect-[3/4] rounded-xl overflow-hidden border border-white/10 hover:border-[#FF2D78]/60 transition-all"
                  >
                    {c.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- dynamic candidate URL
                      <img src={c.image_url} alt={`Candidate ${i + 1}`} className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-white/30 text-[10px]">
                        {c.status || 'PENDING'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : busy || jobActive ? (
              <div className="text-center text-white/50 space-y-3 w-full max-w-sm">
                <Loader2 className="h-10 w-10 mx-auto animate-spin text-[#ff6ba6]" />
                <p className="text-sm">{t('studio.generating') || (isZh ? '正在生成…' : 'Generating…')}</p>
              </div>
            ) : (
              <div className="text-center text-white/35">
                <Sparkles className="h-12 w-12 mx-auto text-white/15" />
                <p className="mt-3 text-sm">
                  {t('studio.canvasEmpty') || (isZh ? '选择预设与控件后开始生成' : 'Pick a preset and start generating')}
                </p>
              </div>
            )}
          </div>

          {(busy || activeJobId) && <GenJobProgress jobId={activeJobId} className="mt-4" />}
          {submitError && <p className="mt-2 text-xs text-red-300">{submitError}</p>}
          {videoError && <p className="mt-2 text-xs text-red-300">{videoError}</p>}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void generate()}
              disabled={busy || jobActive || !selectedGirlId}
              className="flex-1 h-12 rounded-2xl font-bold tracking-wider text-white text-sm disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #ff2e88, #c026d3)', boxShadow: '0 0 24px rgba(255,46,136,0.35)' }}
            >
              {busy || jobActive
                ? t('studio.generating') || (isZh ? '正在生成…' : 'GENERATING…')
                : t('studio.generate') || (isZh ? '生成图片' : 'GENERATE')}
            </button>
            <button
              type="button"
              onClick={() => void generateVideo()}
              disabled={videoBusy || !resultImage}
              className={cn(
                'h-12 px-4 rounded-2xl inline-flex items-center gap-2 text-sm font-semibold border transition-all disabled:opacity-40',
                'border-[#fbbf24]/40 text-[#fbbf24] hover:bg-[#fbbf24]/10',
              )}
              title={t('studio.makeVideo') || (isZh ? '把这张图生成 5 秒视频 (WAN 2.2)' : 'Animate this image (WAN 2.2)')}
            >
              {videoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
              {t('studio.video') || (isZh ? '生成视频' : 'Video')}
            </button>
          </div>

          {/* History */}
          <div className="mt-5">
            <div className={sectionTitle}>{t('studio.history') || (isZh ? '最近作品' : 'Recent works')}</div>
            {history.length === 0 ? (
              <p className="text-[11px] text-white/30">{isZh ? '还没有作品' : 'Nothing here yet'}</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {history.map((item) => {
                  const thumb =
                    typeof item.result?.image_url === 'string'
                      ? item.result.image_url
                      : typeof item.result?.video_url === 'string'
                        ? item.result.video_url
                        : null;
                  const failed = item.status === 'failed';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (typeof item.result?.video_url === 'string') {
                          setVideoUrl(item.result.video_url);
                          setResultImage(null);
                        } else if (typeof item.result?.image_url === 'string') {
                          setResultImage(item.result.image_url);
                          setVideoUrl(null);
                        }
                      }}
                      className={cn(
                        'shrink-0 h-16 w-16 rounded-xl overflow-hidden border transition-all',
                        failed ? 'border-red-500/30' : 'border-white/10 hover:border-[#ff2e88]/50',
                      )}
                      title={failed ? item.error || 'failed' : item.kind}
                    >
                      {thumb && (thumb as string).startsWith('http') ? (
                        thumb.endsWith('.mp4') || typeof item.result?.video_url === 'string' ? (
                          <span className="flex h-full w-full items-center justify-center bg-white/[0.05]">
                            <Film className="h-5 w-5 text-white/50" />
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- dynamic history thumbnail
                          <img src={thumb} alt={item.kind} loading="lazy" className="h-full w-full object-cover" />
                        )
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-white/[0.05] text-[9px] text-white/40">
                          {failed ? <X className="h-4 w-4 text-red-400/70" /> : item.kind}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══ Right: enhancement controls ══ */}
        <div className={cn(panelClass, 'space-y-5')}>
          {/* Prompt */}
          <div>
            <div className={sectionTitle}>{t('studio.prompt') || (isZh ? '描述' : 'Prompt')}</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={isZh ? '描述场景、服装、氛围…' : 'Describe the scene, outfit, mood…'}
              className="w-full h-20 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:border-[#ff2e88]/40 outline-none resize-none"
            />
          </div>

          {/* Pose control */}
          <div>
            <div className={sectionTitle}>{t('studio.pose') || (isZh ? '姿势控制 (ControlNet)' : 'Pose control (ControlNet)')}</div>
            {poseUrl ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded pose reference */}
                <img src={poseUrl} alt="Pose" className="h-14 w-14 rounded-lg object-cover border border-white/10" />
                <div className="flex-1">
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={poseStrength}
                    onChange={(e) => setPoseStrength(Number(e.target.value))}
                    className="w-full accent-[#ff2e88]"
                  />
                  <div className="text-[10px] text-white/40">
                    {t('studio.poseStrength') || 'Strength'}: {poseStrength.toFixed(2)}
                  </div>
                </div>
                <button type="button" onClick={() => setPoseUrl(null)} className="text-white/40 hover:text-red-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 h-12 rounded-xl border border-dashed border-white/15 text-xs text-white/50 hover:border-[#ff2e88]/40 hover:text-white cursor-pointer transition-all">
                {uploadingPose ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {t('studio.uploadPose') || (isZh ? '上传姿势参考图' : 'Upload pose reference')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePoseUpload(file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          {/* One-tap outfit */}
          <div>
            <div className={sectionTitle}>{t('studio.outfit') || (isZh ? '一键换装' : 'One-tap outfit')}</div>
            <select
              value={outfitId}
              onChange={(e) => setOutfitId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-[#ff2e88]/40"
            >
              <option value="" className="bg-[#12121a]">
                {t('studio.outfitNone') || (isZh ? '不换装（按描述生成）' : 'No outfit (prompt only)')}
              </option>
              {outfits.map((o) => (
                <option key={o.id} value={o.id} className="bg-[#12121a]">
                  {o.emoji || ''} {o.name}
                  {o.tier === 'premium' ? ' · VIP' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Enhancements */}
          <div>
            <div className={sectionTitle}>{t('studio.enhance') || (isZh ? '画质增强' : 'Enhancements')}</div>
            <div className="space-y-2">
              <label className="flex items-center justify-between text-xs text-white/70 cursor-pointer">
                <span>{t('studio.faceFix') || (isZh ? '面部修复 (ADetailer)' : 'Face fix (ADetailer)')}</span>
                <input type="checkbox" checked={faceFix} onChange={(e) => setFaceFix(e.target.checked)} className="accent-[#ff2e88]" />
              </label>
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>{t('studio.upscale') || (isZh ? '高清放大' : 'Upscale')}</span>
                <div className="flex gap-1">
                  {UPSCALE_OPTIONS.map((factor) => (
                    <button
                      key={factor}
                      type="button"
                      onClick={() => setUpscale(factor)}
                      className={cn(
                        'h-6 px-2 rounded-md border text-[10px] transition-all',
                        upscale === factor
                          ? 'border-[#ff2e88]/60 bg-[#ff2e88]/15 text-white'
                          : 'border-white/10 text-white/50 hover:text-white',
                      )}
                    >
                      {factor === 0 ? 'Off' : `${factor}x`}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between text-xs text-white/70 cursor-pointer">
                <span className="inline-flex items-center gap-1.5">
                  <Wand2 className="h-3 w-3 text-[#ff6ba6]" />
                  {t('studio.identity') || (isZh ? '身份一致性 (IP-Adapter)' : 'Identity lock (IP-Adapter)')}
                </span>
                <input type="checkbox" checked={identityOn && Boolean(identityImage)} disabled={!identityImage} onChange={(e) => setIdentityOn(e.target.checked)} className="accent-[#ff2e88]" />
              </label>
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>{t('studio.count') || (isZh ? '候选数量' : 'Candidates')}</span>
                <div className="flex gap-1">
                  {COUNT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      className={cn(
                        'h-6 w-6 rounded-md border text-[10px] transition-all',
                        count === n
                          ? 'border-[#ff2e88]/60 bg-[#ff2e88]/15 text-white'
                          : 'border-white/10 text-white/50 hover:text-white',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
