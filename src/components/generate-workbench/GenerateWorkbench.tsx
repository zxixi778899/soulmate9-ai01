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
import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';
import { useGenJob } from '@/hooks/useGenJob';
import { GenJobProgress } from '@/components/common/GenJobProgress';
import { ConsoleDrawer } from './ConsoleDrawer';
import { CompanionGrid } from './CompanionGrid';
import { WorksGallery } from './WorksGallery';
import { PresetSlotPicker } from './PresetSlotPicker';
import {
  girlIdentityUrl,
  type Candidate,
  type Girl,
  type GalleryFilter,
  type HistoryJob,
  type OutfitOption,
  type SlotKind,
  type WorkbenchMode,
  type WorkbenchPreset,
  type WorkbenchSubMode,
} from './types';

const LIKED_STORAGE_KEY = 'generate-workbench-liked';

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
  const isZh = String(locale || '').toLowerCase().startsWith('zh');

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
  const [identityOn, setIdentityOn] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);

  // ── Preset slots ──
  const [posePresets, setPosePresets] = useState<WorkbenchPreset[]>([]);
  const [scenePresets, setScenePresets] = useState<WorkbenchPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [outfits, setOutfits] = useState<OutfitOption[]>([]);
  const [selectedPose, setSelectedPose] = useState<WorkbenchPreset | null>(null);
  const [selectedScene, setSelectedScene] = useState<WorkbenchPreset | null>(null);
  const [selectedOutfit, setSelectedOutfit] = useState<OutfitOption | null>(null);
  const [slotPicker, setSlotPicker] = useState<SlotKind | null>(null);
  const [lockedHint, setLockedHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setLikedIds(loadLikedIds());
    return () => ctrl.abort();
  }, []);

  // Pose + scene preset catalogs, re-scoped per companion (intimacy-gated).
  useEffect(() => {
    if (!selectedGirlId) {
      setPosePresets([]);
      setScenePresets([]);
      return;
    }
    const ctrl = new AbortController();
    setPresetsLoading(true);
    const fetchCategory = async (category: 'pose' | 'scene') => {
      const qs = new URLSearchParams({ category, girlfriend_id: selectedGirlId });
      const res = await authedFetch(`/api/gen-presets?${qs.toString()}`, { signal: ctrl.signal });
      const data = (await res.json().catch(() => null)) as { presets?: WorkbenchPreset[] } | null;
      return res.ok && Array.isArray(data?.presets) ? data.presets : [];
    };
    Promise.all([fetchCategory('pose'), fetchCategory('scene')])
      .then(([pose, scene]) => {
        if (ctrl.signal.aborted) return;
        setPosePresets(pose);
        setScenePresets(scene);
        setSelectedPose(null);
        setSelectedScene(null);
        setPresetsLoading(false);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setPresetsLoading(false);
      });
    return () => ctrl.abort();
  }, [selectedGirlId]);

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

  const handleLockedPick = () => {
    setLockedHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setLockedHint(false), 2600);
  };

  const generate = async () => {
    if (busy || !selectedGirlId) return;
    if (mode === 'video' && !baseImage && !resultImage) {
      setSubmitError(t('generate.videoNeedsImage'));
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
        girlfriend_id: selectedGirlId,
        locale,
        source: 'generate',
        idempotency_key: `generate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };

      if (mode === 'video') {
        body.kind = 'video';
        body.input_image = baseImage || resultImage;
        body.model = 'wan22';
        body.duration = 5;
        body.queue = true;
        if (prompt.trim()) body.user_request = prompt.trim();
      } else {
        body.kind = 'image';
        const requestParts = [prompt.trim(), selectedOutfit?.wear_prompt || ''].filter(Boolean);
        body.user_request = requestParts.join(', ') || 'a beautiful portrait';
        // One structured preset slot resolves server-side (scene wins over pose).
        const primary = selectedScene || selectedPose;
        if (primary) {
          body.preset_category = primary.category;
          body.preset_slug = primary.slug;
        }
        // Edit sub-mode: depth-control keeps the base composition (img2img).
        if (subMode === 'edit' && baseImage) {
          body.control = { type: 'depth', image: baseImage, strength: 0.65 };
        } else if (selectedPose?.pose_reference) {
          body.control = { type: 'openpose', image: selectedPose.pose_reference, strength: 0.7 };
        }
        if (faceFix) body.face_fix = true;
        if (upscale > 1) body.upscale = upscale;
        const identityImage = girlIdentityUrl(selectedGirl);
        if (identityOn && identityImage) body.identity_image = identityImage;
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
      } | null;
      if (!res.ok || !data) {
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

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      {/* ══ Left console drawer (fixed on xl, inline below) ══ */}
      <div className="xl:fixed xl:left-[264px] xl:top-4 xl:bottom-4 xl:z-30 xl:w-[360px] px-3 pt-4 xl:p-0">
        <ConsoleDrawer
          mode={mode}
          onModeChange={(m) => {
            setMode(m);
            setSubmitError(null);
          }}
          subMode={subMode}
          onSubModeChange={setSubMode}
          girl={selectedGirl}
          girls={girls}
          onSelectGirl={setSelectedGirlId}
          selectedPose={selectedPose}
          selectedScene={selectedScene}
          selectedOutfit={selectedOutfit}
          presetsLoading={presetsLoading}
          lockedHint={lockedHint}
          onOpenSlot={openSlotPicker}
          onClearPose={() => setSelectedPose(null)}
          onClearScene={() => setSelectedScene(null)}
          onClearOutfit={() => setSelectedOutfit(null)}
          prompt={prompt}
          onPromptChange={setPrompt}
          count={count}
          onCountChange={setCount}
          faceFix={faceFix}
          onFaceFixChange={setFaceFix}
          upscale={upscale}
          onUpscaleChange={setUpscale}
          identityOn={identityOn}
          onIdentityChange={setIdentityOn}
          identityAvailable={Boolean(girlIdentityUrl(selectedGirl))}
          baseImage={baseImage}
          uploadingBase={uploadingBase}
          onBaseUpload={handleBaseUpload}
          onClearBase={() => setBaseImage(null)}
          credits={credits}
          busy={busy || jobActive}
          onGenerate={() => void generate()}
          submitError={submitError}
          activeJobId={activeJobId}
          isZh={isZh}
        />
      </div>

      {/* ══ Main canvas ══ */}
      <div className="px-4 sm:px-6 pt-4 pb-16 xl:pl-[648px] xl:pr-8">
        {selectedGirl ? (
          <>
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
              isZh={isZh}
            />
          </>
        ) : (
          <CompanionGrid girls={girls} loading={girlsLoading} onSelect={setSelectedGirlId} />
        )}
      </div>

      {/* ══ Preset slot picker modal ══ */}
      {slotPicker && (
        <PresetSlotPicker
          slot={slotPicker}
          posePresets={posePresets}
          scenePresets={scenePresets}
          outfits={outfits}
          selectedPose={selectedPose}
          selectedScene={selectedScene}
          selectedOutfit={selectedOutfit}
          onPickPose={setSelectedPose}
          onPickScene={setSelectedScene}
          onPickOutfit={setSelectedOutfit}
          onLocked={handleLockedPick}
          onClose={() => setSlotPicker(null)}
          isZh={isZh}
        />
      )}
    </div>
  );
}
