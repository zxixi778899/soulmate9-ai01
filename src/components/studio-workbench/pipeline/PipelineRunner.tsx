'use client';

import { useState, useRef, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw } from 'lucide-react';
import { PipelineStageCard } from './PipelineStageCard';
import {
  CHARACTER_PIPELINE_STAGES,
  generateStagePrompt,
  resolvePipelineLoras,
  resolveStageReference,
  buildStageGenerationParams,
  type PipelineStageResult,
  type PipelineContext,
} from '@/lib/character-production-pipeline';
import { selectBestCandidate } from '@/lib/face-quality-scorer';
import type { Any } from '../StudioWorkbench.types';

interface Props {
  companionId: string;
  companion: Any | null;
  animeStyle: 'realistic' | '2d' | '3d';
  nsfwIntensity: number;
  onComplete?: (assets: Record<string, string>) => void;
}

export function PipelineRunner({ companionId, companion, animeStyle, nsfwIntensity, onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<PipelineStageResult[]>([]);
  // 镜像 localAssets 供后续 UI 扩展使用（当前阶段仅用于跟踪）
  const [, setAssets] = useState<Record<string, string>>({});
  const cancelRef = useRef(false);

  const run = useCallback(async () => {
    if (!companionId || !companion) {
      toast.error('请先选择伴侣');
      return;
    }
    cancelRef.current = false;
    setRunning(true);
    setResults(CHARACTER_PIPELINE_STAGES.map((s) => ({ stageId: s.id, status: 'pending' as const })));
    setAssets({});

    const localAssets: Record<string, string> = {};
    const gender = String(companion.gender || '').toLowerCase();
    const ctx: PipelineContext = {
      companionId,
      companion: companion as Record<string, unknown>,
      category: gender.includes('trans') ? 'transgender' : gender.includes('male') && !gender.includes('female') ? 'male' : 'female',
      animeStyle,
      nsfwIntensity,
      existingAssets: localAssets,
    };

    for (const stage of CHARACTER_PIPELINE_STAGES) {
      if (cancelRef.current) {
        setResults((prev) => prev.map((r) => r.status === 'pending' ? { ...r, status: 'skipped' } : r));
        toast.info('管线已取消');
        break;
      }

      setResults((prev) => prev.map((r) => r.stageId === stage.id ? { ...r, status: 'running' } : r));

      try {
        const { prompt, negative } = await generateStagePrompt(stage, ctx);
        const loras = resolvePipelineLoras(stage, ctx);
        const refs = resolveStageReference(stage, ctx);
        const params = buildStageGenerationParams(stage, prompt, negative, loras, refs);

        if (stage.mode === 'img2video') {
          const videoRes = await authedFetch('/api/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'wan22',
              girlfriend_id: companionId,
              input_image: refs.inputImage || localAssets['avatar-closeup'] || '',
              prompt,
              negative_prompt: negative,
              duration: stage.video?.durationSeconds === 10 ? 10 : 5,
              fps: stage.video?.fps ?? 16,
              sync_poll_ms: 150000,
            }),
          });
          const videoData = await readResponseJson(videoRes).catch(() => ({} as Any));
          if (!videoRes.ok) throw new Error(videoData.error || '视频生成失败');

          let videoUrl = '';
          if (videoData.pending && videoData.job_id) {
            // WAN 2.2 can take 3–5 min for a 10s clip — the server-side
            // sync poll budget (150s) may expire before GPU finishes. Continue
            // polling from the client so we don't mark it "completed" with no
            // video_url (the original bug: "显示成功但无返回结构").
            const jobId = String(videoData.job_id);
            const endpointId = String(videoData.endpoint_id || '');
            const cost = Number(videoData.cost) || 0;
            const pollBudget = 60; // 60 × 5s = 5 min — covers 10s WAN
            for (let attempt = 0; attempt < pollBudget; attempt++) {
              if (cancelRef.current) throw new Error('管线已取消');
              await new Promise((r) => setTimeout(r, 5000));
              const statusRes = await authedFetch(
                `/api/runpod/status?job_id=${jobId}&kind=video${endpointId ? `&endpoint_id=${endpointId}` : ''}&girlfriend_id=${companionId}&cost=${cost}`,
              );
              const statusData = await readResponseJson(statusRes).catch(() => ({} as Any));
              if (statusData.status === 'COMPLETED' || statusData.status === 'completed') {
                videoUrl = String(statusData.video_url || '');
                break;
              }
              if (statusData.status === 'FAILED' || statusData.status === 'failed') {
                throw new Error(statusData.error || `${stage.shortLabel} 失败`);
              }
            }
            if (!videoUrl) throw new Error(`${stage.shortLabel} 超时`);
          } else {
            videoUrl = String(videoData.video_url || '');
          }
          if (videoUrl) localAssets[stage.assetRole] = videoUrl;
          setResults((prev) => prev.map((r) => r.stageId === stage.id ? { ...r, status: 'completed', prompt, negative, videoUrl, loras } : r));
        } else {
          const res = await authedFetch('/api/admin/comfy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'generate',
              girlfriend_id: companionId,
              prompt,
              negative,
              ...params,
              character_consistency: stage.id !== 'avatar',
              width: stage.width,
              height: stage.height,
              num_images: stage.numImages ?? 1,
            }),
          });
          const data = await readResponseJson(res).catch(() => ({} as Any));
          if (!res.ok) throw new Error(data.error || `${stage.shortLabel}生成失败`);

          if (data.pending && data.job_id) {
            const jobId = String(data.job_id);
            let imageUrls: string[] = [];
            for (let attempt = 0; attempt < 24; attempt++) {
              const statusRes = await authedFetch(`/api/runpod/status?job_id=${jobId}&admin_source=true&girlfriend_id=${companionId}&asset_role=${stage.assetRole}`);
              const statusData = await readResponseJson(statusRes).catch(() => ({} as Any));
              if (statusData.status === 'COMPLETED' || statusData.status === 'completed') {
                const images = statusData.images || statusData.output?.images || [];
                imageUrls = images.map((img: Any) => {
                  if (typeof img === 'string') return img;
                  return img?.url || img?.data || '';
                }).filter(Boolean);
                break;
              }
              if (statusData.status === 'FAILED' || statusData.status === 'failed') {
                throw new Error(statusData.error || `${stage.shortLabel} GPU 任务失败`);
              }
              await new Promise((r) => setTimeout(r, 5000));
            }
            if (imageUrls.length === 0) throw new Error(`${stage.shortLabel} 超时`);

            // Avatar stage: select best candidate by face quality
            let imageUrl = imageUrls[0];
            if (stage.id === 'avatar' && imageUrls.length > 1) {
              toast.info(`头像优选：评估 ${imageUrls.length} 张候选…`);
              const bestIdx = await selectBestCandidate(imageUrls);
              imageUrl = imageUrls[bestIdx];
              toast.success(`已选择最佳头像 (#${bestIdx + 1})`);
            }
            localAssets[stage.assetRole] = imageUrl;
            setResults((prev) => prev.map((r) => r.stageId === stage.id ? { ...r, status: 'completed', prompt, negative, imageUrl, jobId, loras } : r));
          } else {
            const images = data.images || data.assets || [];
            let imageUrls = images.map((img: Any) => {
              if (typeof img === 'string') return img;
              return img?.url || '';
            }).filter(Boolean);
            if (imageUrls.length === 0 && Array.isArray(data.images)) {
              imageUrls = data.images.filter(Boolean);
            }

            // Avatar stage: select best candidate by face quality
            let imageUrl = imageUrls[0] || '';
            if (stage.id === 'avatar' && imageUrls.length > 1) {
              toast.info(`头像优选：评估 ${imageUrls.length} 张候选…`);
              const bestIdx = await selectBestCandidate(imageUrls);
              imageUrl = imageUrls[bestIdx];
              toast.success(`已选择最佳头像 (#${bestIdx + 1})`);
            }
            if (imageUrl) localAssets[stage.assetRole] = imageUrl;
            setResults((prev) => prev.map((r) => r.stageId === stage.id ? { ...r, status: 'completed', prompt, negative, imageUrl, loras } : r));
          }
        }
        setAssets({ ...localAssets });
        ctx.existingAssets = { ...localAssets };
      } catch (error) {
        const msg = error instanceof Error ? error.message : '生成失败';
        setResults((prev) => prev.map((r) => r.stageId === stage.id ? { ...r, status: 'failed', error: msg } : r));
        toast.error(`${stage.shortLabel}：${msg}`);
        break;
      }
    }

    // Auto-bind avatar: save best avatar as identity-anchor in companion_assets
    if (localAssets['avatar-closeup']) {
      try {
        // Save as identity-anchor for IP-Adapter priority lookup
        await authedFetch(`/api/companion/${encodeURIComponent(companionId)}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'id_reference',
            url: localAssets['avatar-closeup'],
            meta: { asset_role: 'identity-anchor', quality_score: 85, source: 'pipeline-auto-select' },
          }),
        }).catch(() => { /* non-critical */ });
        // Also update girlfriend avatar_url
        await authedFetch('/api/admin/girlfriends', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: companionId, avatar_url: localAssets['avatar-closeup'] }),
        });
      } catch { /* non-critical */ }
    }

    setRunning(false);
    const completed = Object.keys(localAssets).length;
    if (completed > 0) {
      toast.success(`管线完成：生成 ${completed} 项资产`);
      onComplete?.(localAssets);
    }
  }, [companionId, companion, animeStyle, nsfwIntensity, onComplete]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const hasResults = results.length > 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">生产管线</h3>
          <p className="text-[10px] text-slate-500">头像 → 立绘 → 视频 · 全自动 3 阶段</p>
        </div>
        <div className="flex gap-1.5">
          {running ? (
            <Button size="sm" variant="outline" onClick={cancel} className="h-7 border-red-500/30 text-red-400 text-xs">
              <Square className="mr-1 h-3 w-3" /> 停止
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => void run()}
              className={cn(
                'h-7 text-xs font-medium',
                'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500',
              )}
            >
              {hasResults ? <RotateCcw className="mr-1 h-3 w-3" /> : <Play className="mr-1 h-3 w-3" />}
              {hasResults ? '重新运行' : '运行管线'}
            </Button>
          )}
        </div>
      </div>

      {/* Stage cards */}
      {hasResults && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {results.map((r) => (
            <PipelineStageCard key={r.stageId} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}
