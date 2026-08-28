'use client';

/**
 * Generate workbench — ourdream.ai/generate style console.
 *
 * Left drawer (fixed on xl): image/video mode toggle, create/edit sub-mode,
 * four preset slots (companion / pose / outfit / scene), custom prompt,
 * quantity + settings + generate pill.
 *
 * Main canvas: companion picker hero (when none selected) or the selected
 * companion's works feed with All / Images / Videos / Liked filters, plus a
 * live generation canvas with progress + candidate selection.
 *
 * All generations go through POST /api/gen/start (kind image / video) with
 * the selected girlfriend_id, so every work stays attached to the companion.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';
import { useGenJob } from '@/hooks/useGenJob';
import { GenJobProgress } from '@/components/common/GenJobProgress';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { ConsoleDrawer } from './ConsoleDrawer';
import { CompanionGrid } from './CompanionGrid';
import { WorksGallery } from './WorksGallery';
import { PresetSlotPicker } from './PresetSlotPicker';
import { ControlNetPreviewPanel } from './ControlNetPreviewPanel';
import {
  girlAvatarUrl,
  girlIdentityUrl,
  isCustomPresetSlug,
  type Candidate,
  type GenCustomPresetItem,
  type Girl,
  type GalleryFilter,
  type HistoryJob,
  type OutfitOption,
  type PersonalWork,
  type SlotKind,
  type WorkbenchMode,
  type WorkbenchPreset,
  type WorkbenchSubMode,
} from './types';

const LIKED_STORAGE_KEY = 'generate-workbench-liked';

/**
 * Quick-tool fragment for the one-tap undress helper. It injects explicit
 * intent into the free-text request; the pipeline still caps intensity by
 * the companion's intimacy policy server-side.
 */
const UNDRESS_FRAGMENT = 'she takes off all her clothes, fully nude';

/** One-tap HD prompt fragment — keep the uploaded photo faithful, only sharpen. */
const HD_FRAGMENT =
  'faithful high-resolution enhancement, same person same pose same outfit, crisp fine details';

function loadLikedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(LIKED_STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export default function GenerateWorkbench() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const isZh = String(locale || '').toLowerCase().startsWith('zh');

  // ── Membership (Pro+ gate for the whole workbench) ──
  const [tier, setTier] = useState<string | null>(null);
  const proLocked = tier !== null && !['pro', 'premium', 'unlimited'].includes(tier);
  // Video is a Premium/Unlimited surface — Pro members see a locked tab.
  const videoLocked = tier !== null && !['premium', 'unlimited', 'admin'].includes(tier);

  // ── Companions ──
  const [girls, setGirls] = useState<Girl[]>([]);
  const [girlsLoading, setGirlsLoading] = useState(true);
  const [selectedGirlId, setSelectedGirlId] = useState<string>('');
  const selectedGirl = useMemo(
    () => girls.find((g) => g.id === selectedGirlId) || null,
    [girls, selectedGirlId],
  );

  // ── Console state ──
  const [mode, setMode] = useState<WorkbenchMode>('image');
  const [subMode, setSubMode] = useState<WorkbenchSubMode>('create');
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(1);
  const [faceFix, setFaceFix] = useState(true);
  const [upscale, setUpscale] = useState(0);
  const [undressOn, setUndressOn] = useState(false);
  const [hdOn, setHdOn] = useState(false);
  const [identityOn, setIdentityOn] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);

  // ========== IP-Adapter Auto Detection ==========
  // (moved below — needs selectedPose/selectedOutfit to be declared first)

  // ── Preset slots ──
  const [posePresets, setPosePresets] = useState<WorkbenchPreset[]>([]);
  const [scenePresets, setScenePresets] = useState<WorkbenchPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [outfits, setOutfits] = useState<OutfitOption[]>([]);
  const [selectedPose, setSelectedPose] = useState<WorkbenchPreset | null>(null);
  const [selectedScene, setSelectedScene] = useState<WorkbenchPreset | null>(null);
  const [selectedOutfit, setSelectedOutfit] = useState<OutfitOption | null>(null);

  // Detect if any selected preset has identity image (IP-Adapter face)
  const hasPresetIdentity = Boolean(
    selectedPose?.ip_adapter_face ||
    selectedOutfit?.preview_url
  );
  const [slotPicker, setSlotPicker] = useState<SlotKind | null>(null);
  const [lockedHint, setLockedHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Admin-managed custom presets (pose / outfit / scene) ──
  const [customPresets, setCustomPresets] = useState<GenCustomPresetItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // ── Edit / video base image ──
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [uploadingBase, setUploadingBase] = useState(false);

  // ── Generation state ──
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { job: activeJob } = useGenJob(activeJobId, { pollMs: 2500 });

  // ── Works feed ──
  const [history, setHistory] = useState<HistoryJob[]>([]);
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const historyRefreshRef = useRef(0);

  const refreshHistory = useCallback(() => {
    historyRefreshRef.current += 1;
    const token = historyRefreshRef.current;
    authedFetch('/api/gen/jobs?limit=100')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (token !== historyRefreshRef.current) return;
        setHistory(Array.isArray(data?.jobs) ? data.jobs : []);
      })
      .catch(() => {});
  }, []);

  // Load companions + credit balance + outfit catalog once.
  useEffect(() => {
    const ctrl = new AbortController();
    authedFetch('/api/girlfriends', { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ctrl.signal.aborted) return;
        const list: Girl[] = Array.isArray(data?.girlfriends) ? data.girlfriends : [];
        setGirls(list);
        setGirlsLoading(false);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setGirlsLoading(false);
      });
    authedFetch('/api/shop/credits', { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ctrl.signal.aborted) return;
        const remaining = Number((data as { credits_remaining?: number } | null)?.credits_remaining);
        if (Number.isFinite(remaining)) setCredits(remaining);
      })
      .catch(() => {});
    authedFetch('/api/outfits', { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setOutfits(Array.isArray(data?.outfits) ? data.outfits : []);
      })
      .catch(() => {});
    authedFetch('/api/membership', { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ctrl.signal.aborted) return;
        const memberTier = typeof data?.tier === 'string' ? data.tier : '';
        if (memberTier) setTier(memberTier);
      })
      .catch(() => {});
    setLikedIds(loadLikedIds());
    return () => ctrl.abort();
  }, []);

  // Pose + scene preset catalogs. Companion is optional now — without one we
  // still load the base catalog (intimacy-gated scoping only with a girl).
  useEffect(() => {
    const ctrl = new AbortController();
    setPresetsLoading(true);
    const fetchCategory = async (category: 'pose' | 'scene') => {
      const qs = new URLSearchParams({ category });
      if (selectedGirlId) qs.set('girlfriend_id', selectedGirlId);
      const res = await authedFetch(`/api/gen-presets?${qs.toString()}`, { signal: ctrl.signal });
      const data = (await res.json().catch(() => null)) as { presets?: WorkbenchPreset[] } | null;
      return res.ok && Array.isArray(data?.presets) ? data.presets : [];
    };
    Promise.all([fetchCategory('pose'), fetchCategory('scene')])
      .then(([pose, scene]) => {
        if (ctrl.signal.aborted) return;
        setPosePresets(pose);
        setScenePresets(scene);
        setSelectedPose((prev) => (prev && !isCustomPresetSlug(prev.slug) ? null : prev));
        setSelectedScene((prev) => (prev && !isCustomPresetSlug(prev.slug) ? null : prev));
        setPresetsLoading(false);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setPresetsLoading(false);
      });
    return () => ctrl.abort();
  }, [selectedGirlId]);

  // Custom presets: public read for everyone; admin probe enables add/delete UI.
  const loadCustomPresets = useCallback(async (viaAdmin: boolean) => {
    try {
      const res = await authedFetch(
        viaAdmin ? '/api/admin/gen-custom-presets' : '/api/creator/gen-custom-presets',
      );
      if (!res.ok) return;
      if (viaAdmin) setIsAdmin(true);
      const data = (await res.json().catch(() => null)) as {
        presets?: Partial<Record<'pose' | 'outfit' | 'scene', GenCustomPresetItem[]>>;
      } | null;
      const merged: GenCustomPresetItem[] = [];
      for (const cat of ['pose', 'outfit', 'scene'] as const) {
        const list = data?.presets?.[cat];
        if (Array.isArray(list)) merged.push(...list);
      }
      setCustomPresets(merged);
    } catch {
      // keep whatever we had
    }
  }, []);

  useEffect(() => {
    // Probe the admin endpoint first; fall back to the public one for non-admins.
    void loadCustomPresets(true);
    void loadCustomPresets(false);
  }, [loadCustomPresets]);

  // Merge admin custom presets into the slot catalogs (custom- slug prefix).
  const customToPreset = useCallback(
    (c: GenCustomPresetItem): WorkbenchPreset => ({
      category: c.category,
      slug: c.slug,
      label_en: c.label_en,
      label_zh: c.label_zh,
      preview_url: c.preview_url,
      nsfw_level: 0,
      tier: 'free',
      locked: false,
      pose_reference: null,
      prompt_hint: c.prompt_hint,
    }),
    [],
  );

  const allPosePresets = useMemo(
    () => [...posePresets, ...customPresets.filter((c) => c.category === 'pose').map(customToPreset)],
    [posePresets, customPresets, customToPreset],
  );
  const allScenePresets = useMemo(
    () => [...scenePresets, ...customPresets.filter((c) => c.category === 'scene').map(customToPreset)],
    [scenePresets, customPresets, customToPreset],
  );
  const allOutfits = useMemo(
    () => [
      ...outfits,
      ...customPresets
        .filter((c) => c.category === 'outfit')
        .map((c): OutfitOption => ({
          id: c.slug,
          name: isZh ? c.label_zh || c.label_en : c.label_en,
          tier: 'free',
          category: 'custom',
          wear_prompt: c.prompt_hint,
          preview_url: c.preview_url,
        })),
    ],
    [outfits, customPresets, isZh],
  );

  // Admin create / delete for custom presets (picker overlay).
  const adminCreatePreset = useCallback(
    async (category: SlotKind, input: { label_en: string; label_zh: string; prompt_hint: string; file: File | null }) => {
      try {
        const form = new FormData();
        form.append('category', category);
        form.append('label_en', input.label_en);
        form.append('label_zh', input.label_zh);
        form.append('prompt_hint', input.prompt_hint);
        if (input.file) form.append('file', input.file);
        const res = await authedFetch('/api/admin/gen-custom-presets', { method: 'POST', body: form });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          logger.warn('[generate] admin preset create failed', { err: data?.error || String(res.status) });
          return;
        }
        await loadCustomPresets(true);
      } catch (e) {
        logger.warn('[generate] admin preset create failed', { err: String(e) });
      }
    },
    [loadCustomPresets],
  );

  const adminDeletePreset = useCallback(
    async (category: SlotKind, slug: string) => {
      try {
        const res = await authedFetch(
          `/api/admin/gen-custom-presets?category=${encodeURIComponent(category)}&slug=${encodeURIComponent(slug)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) return;
        await loadCustomPresets(true);
      } catch (e) {
        logger.warn('[generate] admin preset delete failed', { err: String(e) });
      }
    },
    [loadCustomPresets],
  );

  const adminEditPreset = useCallback(
    async (category: SlotKind, slug: string, input: { label_en?: string; label_zh?: string; prompt_hint?: string }) => {
      try {
        const body: Record<string, unknown> = { category, slug };
        if (input.label_en !== undefined) body.label_en = input.label_en;
        if (input.label_zh !== undefined) body.label_zh = input.label_zh;
        if (input.prompt_hint !== undefined) body.prompt_hint = input.prompt_hint;
        
        const res = await authedFetch('/api/admin/gen-custom-presets', { 
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: String(res.status) }));
          logger.warn('[generate] admin preset edit failed', { err: data?.error || String(res.status) });
          return;
        }
        await loadCustomPresets(true);
      } catch (e) {
        logger.warn('[generate] admin preset edit failed', { err: String(e) });
      }
    },
    [loadCustomPresets],
  );

  // Initial works feed load.
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
    if (typeof result.video_url === 'string' && result.video_url) {
      setVideoUrl(result.video_url);
      refreshHistory();
      return;
    }
    const resultCandidates = result.candidates;
    if (Array.isArray(resultCandidates) && resultCandidates.length > 0) {
      setCandidates(resultCandidates as Candidate[]);
      return;
    }
    const url = typeof result.image_url === 'string' ? result.image_url : '';
    if (url) {
      setResultImage(url);
      setBaseImage((prev) => prev || url);
      refreshHistory();
    }
  }, [activeJob, refreshHistory]);

  const toggleLike = useCallback((jobId: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      try {
        window.localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Storage full / private mode — likes stay in-memory only.
      }
      return next;
    });
  }, []);

  const handleBaseUpload = async (file: File) => {
    setUploadingBase(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'generate_edits');
      const res = await authedFetch('/api/upload', { method: 'POST', body: form });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && data?.url) setBaseImage(data.url);
      else setSubmitError(isZh ? '图片上传失败' : 'Image upload failed');
    } catch {
      setSubmitError(isZh ? '图片上传失败' : 'Image upload failed');
    } finally {
      setUploadingBase(false);
    }
  };

  const openSlotPicker = (slot: SlotKind) => {
    setSlotPicker(slot);
  };

  // Quick tools are upload-driven img2img — enabling one enters image edit
  // mode so the base-photo upload slot is immediately visible in the drawer.
  const activateToolContext = (): void => {
    setMode('image');
    setSubMode('edit');
  };

  const handleUndressToggle = (): void => {
    setUndressOn((v) => {
      if (!v) activateToolContext();
      return !v;
    });
  };

  // Quick tool: one-tap HD — dedicated 4x upscale pass (+ face fix).
  const handleHdToggle = (): void => {
    if (hdOn) {
      setHdOn(false);
    } else {
      setHdOn(true);
      setFaceFix(true);
      activateToolContext();
    }
  };

  const handleLockedPick = () => {
    setLockedHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setLockedHint(false), 2600);
  };

  const generate = async () => {
    if (busy) return;
    // Pro+ gate: non-members go to the pricing page instead of generating.
    if (proLocked) {
      router.push('/pricing');
      return;
    }
    // Video gate: Premium/Unlimited only — guide Pro members to upgrade.
    if (mode === 'video' && videoLocked) {
      router.push('/pricing');
      return;
    }
    if (mode === 'video' && !baseImage && !resultImage) {
      setSubmitError(t('generate.videoNeedsImage'));
      return;
    }
    // Quick tools are upload-driven: undress/HD need a source photo first.
    if (mode === 'image' && (undressOn || hdOn) && !baseImage) {
      setSubmitError(t('generate.toolNeedsImage'));
      return;
    }
    setBusy(true);
    setSubmitError(null);
    if (mode === 'image') {
      setResultImage(null);
      setCandidates([]);
      setVideoUrl(null);
    }

    try {
      const body: Record<string, unknown> = {
        locale,
        source: 'generate',
        idempotency_key: `generate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      // Companion is optional — without one the pipeline creates a brand-new character.
      if (selectedGirlId) body.girlfriend_id = selectedGirlId;

      if (mode === 'video') {
        body.kind = 'video';
        body.input_image = baseImage || resultImage;
        body.model = 'wan22';
        body.duration = 5;
        body.queue = true;
        if (prompt.trim()) body.user_request = prompt.trim();
      } else {
        body.kind = 'image';
        // One structured preset slot resolves server-side (scene wins over pose).
        // Admin custom presets carry no catalog slug — inject their prompt hint instead.
        const primary = selectedScene || selectedPose;
        const requestParts = [
          prompt.trim(),
          // Undress/HD intent contradicts an outfit prompt — the tool wins.
          undressOn || hdOn ? '' : selectedOutfit?.wear_prompt || '',
          undressOn ? UNDRESS_FRAGMENT : '',
          hdOn ? HD_FRAGMENT : '',
          primary && isCustomPresetSlug(primary.slug) ? primary.prompt_hint || '' : '',
        ].filter(Boolean);
        body.user_request = requestParts.join(', ') || 'a beautiful portrait';
        if (primary && !isCustomPresetSlug(primary.slug)) {
          body.preset_category = primary.category;
          body.preset_slug = primary.slug;
        }
        // Quick tools are upload-driven img2img and win over edit/pose control.
        if (undressOn && baseImage) {
          body.control = { type: 'depth', image: baseImage, strength: 0.62 };
        } else if (hdOn && baseImage) {
          body.control = { type: 'depth', image: baseImage, strength: 0.3 };
        } else if (subMode === 'edit' && baseImage) {
          body.control = { type: 'depth', image: baseImage, strength: 0.65 };
        } else if (selectedPose?.pose_reference) {
          body.control = { type: 'openpose', image: selectedPose.pose_reference, strength: 0.7 };
        }
        if (faceFix || hdOn) body.face_fix = true;
        if (hdOn) body.upscale = 4;
        else if (upscale > 1) body.upscale = upscale;
        const identityImage = girlIdentityUrl(selectedGirl);
        // HD enhances any uploaded photo — a companion identity lock would distort it.
        if (identityOn && identityImage && !hdOn) body.identity_image = identityImage;
        if (count > 1) {
          body.candidate = true;
          body.count = count;
        }
      }

      const res = await authedFetch('/api/gen/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        job_id?: string;
        image_url?: string;
        candidates?: Candidate[];
        error?: string;
        localized_error?: string;
        code?: string;
      } | null;
      if (!res.ok || !data) {
        // Membership-gated failures redirect to the upgrade page instead of
        // surfacing a raw error; credit shortfalls point to the shop.
        if (data?.code === 'membership_required' || data?.code === 'video_requires_premium') {
          router.push('/pricing');
          setBusy(false);
          return;
        }
        if (data?.code === 'insufficient_credits') {
          setSubmitError(t('generate.insufficientCreditsHint'));
          setBusy(false);
          return;
        }
        setSubmitError(data?.localized_error || data?.error || t('generate.failed'));
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
        setBaseImage((prev) => prev || data.image_url || null);
      }
      refreshHistory();
    } catch {
      setSubmitError(t('generate.networkError'));
    } finally {
      setBusy(false);
    }
  };

  const jobActive = Boolean(
    activeJobId &&
      activeJob &&
      activeJob.status !== 'completed' &&
      activeJob.status !== 'failed' &&
      activeJob.status !== 'cancelled',
  );

  // Works feed scoped to the selected companion.
  const companionWorks = useMemo(
    () => history.filter((job) => job.girlfriend_id === selectedGirlId),
    [history, selectedGirlId],
  );

  // Personal library: latest finished images across all companions (and stand-alone ones).
  const personalWorks = useMemo<PersonalWork[]>(() => {
    const items: PersonalWork[] = [];
    for (const job of history) {
      if (job.status !== 'completed' || !job.result || job.kind === 'video') continue;
      const url = typeof job.result.image_url === 'string' ? job.result.image_url : '';
      if (url) {
        items.push({ jobId: job.id, url });
        continue;
      }
      const cands = job.result.candidates;
      if (Array.isArray(cands)) {
        for (const c of cands as Array<{ image_url?: unknown }>) {
          if (typeof c?.image_url === 'string' && c.image_url) items.push({ jobId: job.id, url: c.image_url });
        }
      }
      if (items.length >= 12) break;
    }
    return items.slice(0, 12);
  }, [history]);

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      {proLocked ? (
        /* Membership redesign: free users get an upgrade wall instead of the
           workbench — forbidden surfaces guide to membership, never fail. */
        <div className="flex min-h-[80vh] items-center justify-center px-6">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-8 text-center shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FD5FC2]/60 to-transparent" />
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#FD5FC2] to-[#8b5cf6] shadow-[0_0_28px_rgba(253,95,194,0.5)]">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h2 className="mb-2 text-xl font-bold">{t('generate.freeWallTitle')}</h2>
            <p className="mb-6 text-sm leading-relaxed text-white/60">{t('generate.freeWallDesc')}</p>
            <button
              type="button"
              onClick={() => router.push('/pricing')}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FD5FC2] to-[#8b5cf6] text-sm font-semibold text-white shadow-[0_0_24px_rgba(253,95,194,0.35)] transition-transform hover:scale-[1.02]"
            >
              {t('create.upgradeNow')}
            </button>
          </div>
        </div>
      ) : (
        <>
      {/* ══ Left console drawer (fixed on xl, inline below) ══ */}
      <div className="xl:fixed xl:left-[264px] xl:top-4 xl:bottom-4 xl:z-30 xl:w-[360px] px-3 pt-4 xl:p-0">
        {/* ControlNet Multi-Unit Preview Panel */}
        <ControlNetPreviewPanel
          pose={selectedPose}
          outfit={selectedOutfit}
          scene={selectedScene}
          identityImage={identityOn ? girlIdentityUrl(selectedGirl) : null}
          presetIdentityImage={selectedPose?.ip_adapter_face || null} // Auto-detect from preset
        />
        
        <ConsoleDrawer
          mode={mode}
          onModeChange={(m) => {
            setMode(m);
            setSubmitError(null);
          }}
          videoLocked={videoLocked}
          onVideoLocked={() => router.push('/pricing')}
          subMode={subMode}
          onSubModeChange={setSubMode}
          girl={selectedGirl}
          girls={girls}
          onSelectGirl={setSelectedGirlId}
          onClearGirl={() => setSelectedGirlId('')}
          selectedPose={selectedPose}
          selectedScene={selectedScene}
          selectedOutfit={selectedOutfit}
          presetsLoading={presetsLoading}
          lockedHint={lockedHint}
          onOpenSlot={openSlotPicker}
          onClearPose={() => setSelectedPose(null)}
          onClearScene={() => setSelectedScene(null)}
          onClearOutfit={() => setSelectedOutfit(null)}
          // ========== ControlNet Multi-Unit Status ==========
          poseControlNetActive={Boolean(selectedPose?.openpose_json || selectedPose?.body_depth_url)}
          outfitControlNetActive={Boolean(selectedOutfit?.canny_edge_url || selectedOutfit?.person_mask_url)}
          sceneControlNetActive={Boolean(selectedScene?.body_depth_url || selectedScene?.canny_edge_url || selectedScene?.bg_mask_url)}
          identityControlNetActive={hasPresetIdentity}
          prompt={prompt}
          onPromptChange={setPrompt}
          count={count}
          onCountChange={setCount}
          faceFix={faceFix}
          onFaceFixChange={setFaceFix}
          upscale={upscale}
          onUpscaleChange={setUpscale}
          undressOn={undressOn}
          onUndressToggle={handleUndressToggle}
          hdOn={hdOn}
          onHdToggle={handleHdToggle}
          identityOn={identityOn}
          onIdentityChange={setIdentityOn}
          identityAvailable={Boolean(girlIdentityUrl(selectedGirl))}
          baseImage={baseImage}
          uploadingBase={uploadingBase}
          onBaseUpload={handleBaseUpload}
          onClearBase={() => setBaseImage(null)}
          credits={credits}
          busy={busy || jobActive}
          proLocked={proLocked}
          onGenerate={() => void generate()}
          submitError={submitError}
          activeJobId={activeJobId}
          isZh={isZh}
          personalWorks={personalWorks}
          onPickWork={(url) => {
            setBaseImage(url);
            setMode('image');
            setSubMode('edit');
          }}
          presetIdentityImage={selectedPose?.ip_adapter_face || null}
          hasControlNetResources={Boolean(
            selectedPose?.openpose_json || 
            selectedPose?.body_depth_url ||
            selectedOutfit?.canny_edge_url || 
            selectedOutfit?.person_mask_url ||
            selectedScene?.depth_url || 
            selectedScene?.canny_edge_url ||
            selectedScene?.bg_mask_url
          )}
        />
      </div>

      {/* ══ Main canvas ══ */}
      <div className="px-4 sm:px-6 pt-4 pb-16 xl:pl-[648px] xl:pr-8">
        {/* Active quick tool — upload-driven img2img panel on the right canvas */}
        {!slotPicker && (undressOn || hdOn) && (
          <ToolUploadPanel
            tool={undressOn ? 'undress' : 'hd'}
            baseImage={baseImage}
            uploading={uploadingBase}
            onPickFile={(file) => void handleBaseUpload(file)}
            onClose={() => {
              if (undressOn) setUndressOn(false);
              else setHdOn(false);
            }}
          />
        )}
        {slotPicker ? (
          /* Preset browser — inline right-canvas view, same layout as the companion hero */
          <PresetSlotPicker
            slot={slotPicker}
            posePresets={allPosePresets}
            scenePresets={allScenePresets}
            outfits={allOutfits}
            selectedPose={selectedPose}
            selectedScene={selectedScene}
            selectedOutfit={selectedOutfit}
            onPickPose={setSelectedPose}
            onPickScene={setSelectedScene}
            onPickOutfit={setSelectedOutfit}
            onLocked={handleLockedPick}
            isAdmin={isAdmin}
            onAdminCreate={adminCreatePreset}
            onAdminDelete={adminDeletePreset}
            onAdminEdit={adminEditPreset}
            onSwitchSlot={setSlotPicker}
            onClose={() => setSlotPicker(null)}
            isZh={isZh}
          />
        ) : selectedGirl ? (
          <>
            {/* Companion switch bar — stay on this page, swap companions anytime */}
            <div className="flex items-center gap-2 overflow-x-auto pb-4 -mx-1 px-1">
              <button
                type="button"
                onClick={() => setSelectedGirlId('')}
                className="shrink-0 h-8 px-3 rounded-full border border-white/15 text-[11px] font-semibold text-white/70 hover:text-white hover:border-white/30 transition-all"
              >
                {t('generate.allCompanions')}
              </button>
              {girls.map((g) => {
                const active = g.id === selectedGirl.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGirlId(g.id)}
                    className={cn(
                      'shrink-0 inline-flex items-center gap-1.5 h-8 pl-1 pr-3 rounded-full border text-[11px] font-semibold transition-all',
                      active
                        ? 'border-[#FD5FC2]/70 bg-[#FD5FC2]/15 text-white'
                        : 'border-white/10 text-white/60 hover:text-white hover:border-white/25',
                    )}
                  >
                    <span className="h-6 w-6 overflow-hidden rounded-full bg-white/[0.06]">
                      {girlAvatarUrl(g) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- dynamic companion avatar
                        <img src={girlAvatarUrl(g) || ''} alt={g.name} className="h-full w-full object-cover" />
                      ) : null}
                    </span>
                    {g.name}
                  </button>
                );
              })}
            </div>

            {/* Live generation canvas */}
            {(busy || jobActive || resultImage || videoUrl || candidates.length > 0) && (
              <section className="rounded-2xl border border-white/[0.08] bg-[#121212] p-4 mb-6">
                <div className="flex flex-col items-center justify-center min-h-[280px]">
                  {videoUrl ? (
                    <video src={videoUrl} controls autoPlay loop className="max-h-[440px] w-full max-w-md rounded-xl" />
                  ) : resultImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- dynamic generation output URL
                    <img
                      src={resultImage}
                      alt="Generated"
                      className="max-h-[440px] max-w-full rounded-xl object-contain shadow-[0_0_36px_rgba(255,28,172,0.25)]"
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
                              setBaseImage((prev) => prev || c.image_url);
                              setCandidates([]);
                            }
                          }}
                          className="relative aspect-[172/214] rounded-lg overflow-hidden border border-white/10 hover:border-[#FD5FC2]/70 transition-all"
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
                  ) : (
                    <div className="text-center text-white/50 space-y-3">
                      <p className="text-sm">{t('generate.generating')}</p>
                    </div>
                  )}
                </div>
                {(busy || activeJobId) && <GenJobProgress jobId={activeJobId} className="mt-3" />}
              </section>
            )}

            {/* Works feed for the selected companion */}
            <WorksGallery
              girl={selectedGirl}
              works={companionWorks}
              filter={filter}
              onFilterChange={setFilter}
              likedIds={likedIds}
              onToggleLike={toggleLike}
              onUseAsBase={(url) => {
                setBaseImage(url);
                setMode('image');
                setSubMode('edit');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onRefresh={refreshHistory}
              isZh={isZh}
            />
          </>
        ) : (
          <CompanionGrid girls={girls} loading={girlsLoading} onSelect={setSelectedGirlId} />
        )}
      </div>
        </>
      )}
    </div>
  );
}

/**
 * Right-canvas panel for an active quick tool — both undress and HD are
 * upload-driven img2img: pick a source photo here (or in the drawer), then
 * press Generate. Dismissed by toggling the tool off.
 */
function ToolUploadPanel({
  tool,
  baseImage,
  uploading,
  onPickFile,
  onClose,
}: {
  tool: 'undress' | 'hd';
  baseImage: string | null;
  uploading: boolean;
  onPickFile: (file: File) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isUndress = tool === 'undress';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) onPickFile(file);
    event.target.value = '';
  };

  return (
    <section className="mb-6 rounded-2xl border border-[#FD5FC2]/30 bg-gradient-to-r from-[#FD5FC2]/[0.09] via-[#141019] to-[#141019] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FD5FC2]/20 text-[#ff9ade]">
            {isUndress ? <Flame className="h-4.5 w-4.5" /> : <Sparkles className="h-4.5 w-4.5" />}
          </span>
          <div>
            <div className="text-sm font-bold text-white">{isUndress ? t('generate.toolUndress') : t('generate.toolHd')}</div>
            <div className="text-[10px] text-white/40">{isUndress ? t('generate.toolUndressDesc') : t('generate.toolHdDesc')}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Close tool"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {baseImage ? (
        <div className="mt-3 flex max-w-md flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={baseImage}
            alt=""
            className="max-h-64 w-full rounded-xl border border-[#FD5FC2]/45 bg-black/40 object-contain"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="self-start rounded-full border border-white/15 px-3 py-1 text-[10px] text-white/60 hover:text-white hover:border-[#FD5FC2]/50 transition-all disabled:opacity-50"
          >
            {uploading ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
            {t('generate.toolUploadCta')}
          </button>
          <p className="text-[11px] leading-relaxed text-[#ff9ade]/70">{t('generate.toolReadyHint')}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-3 flex h-36 w-full max-w-md items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 text-xs text-white/50 hover:border-[#FD5FC2]/50 hover:text-white transition-all disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {t('generate.toolUploadCta')}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <p className="mt-3 max-w-md text-[11px] leading-relaxed text-white/50">
        {isUndress ? t('generate.toolUndressHow') : t('generate.toolHdHow')}
      </p>
    </section>
  );
}
