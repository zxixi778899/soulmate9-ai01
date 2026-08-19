'use client';

import { useState, useCallback } from 'react';
import { useStudio } from '../StudioContext';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { cn } from '@/lib/utils';
import { Copy, Check, ImagePlay, Video, Maximize2, Anchor, UserRound, Images } from 'lucide-react';
import { toast } from 'sonner';
import type { Any } from '../StudioWorkbench.types';

export function OutputGrid() {
  const { state, dispatch, refreshAssets } = useStudio();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyUrl = useCallback((url: string, id: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      toast.success('URL 已复制');
      setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);

  const setAsReference = useCallback((url: string) => {
    dispatch({ type: 'SET_INPUT_IMAGE', url });
    if (state.genMode === 'txt2img') dispatch({ type: 'SET_MODE', genMode: 'img2img' });
    toast.success('已设为参考图');
  }, [dispatch, state.genMode]);

  const switchToVideo = useCallback((url: string) => {
    dispatch({ type: 'SET_INPUT_IMAGE', url });
    dispatch({ type: 'SET_MODE', genMode: 'img2video' });
    toast.success('已切换到图生视频模式');
  }, [dispatch]);

  // 设为身份锚点：写入 companion_assets（identity-anchor），作为 IP-Adapter 优先参考
  const setAsIdentityAnchor = useCallback(async (url: string) => {
    if (!state.companionId) {
      toast.error('请先选择伴侣');
      return;
    }
    try {
      const res = await authedFetch(`/api/companion/${encodeURIComponent(state.companionId)}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'id_reference',
          url,
          meta: { asset_role: 'identity-anchor', source: 'manual-anchor-set' },
        }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '保存失败');
      await refreshAssets(state.companionId);
      toast.success('已设为身份锚点（IP-Adapter 优先参考）');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '设为身份锚点失败');
    }
  }, [state.companionId, refreshAssets]);

  // 设为头像 / 相册（PATCH girlfriends 白名单字段）
  const patchGirlfriend = useCallback(async (url: string, field: 'avatar_url' | 'portrait_url') => {
    if (!state.companionId) {
      toast.error('请先选择伴侣');
      return;
    }
    try {
      const res = await authedFetch('/api/admin/girlfriends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: state.companionId, [field]: url }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '保存失败');
      dispatch({ type: 'PATCH_COMPANION', patch: { [field]: url } });
      toast.success(field === 'avatar_url' ? '已设为头像（IP-Adapter 参考）' : '已设为相册封面');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  }, [state.companionId, dispatch]);

  if (state.lastResult.length === 0) return null;

  return (
    <>
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="大图" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {state.lastResult.map((asset: Any, index: number) => {
          const url = String(asset.url || '');
          const isVideo = asset.media_type === 'video' || url.endsWith('.mp4') || url.endsWith('.webm');
          const id = String(asset.id || index);

          return (
            <div key={id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#0d0d15]">
              {/* Media */}
              {isVideo ? (
                <video
                  src={url}
                  controls
                  loop
                  className="aspect-[3/4] w-full object-cover"
                />
              ) : (
                <button
                  onClick={() => setLightboxUrl(url)}
                  className="block aspect-[3/4] w-full overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`生成结果 ${index + 1}`} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                </button>
              )}

              {/* Action bar */}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-0.5 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={() => copyUrl(url, id)}
                  className={cn(
                    'rounded p-1.5 transition',
                    copiedId === id ? 'text-green-400' : 'text-white/70 hover:bg-white/10 hover:text-white',
                  )}
                  title="复制 URL"
                >
                  {copiedId === id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                {!isVideo && (
                  <>
                    <button
                      onClick={() => setAsReference(url)}
                      className="rounded p-1.5 text-white/70 transition hover:bg-white/10 hover:text-cyan-300"
                      title="设为参考图"
                    >
                      <ImagePlay className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => switchToVideo(url)}
                      className="rounded p-1.5 text-white/70 transition hover:bg-white/10 hover:text-violet-300"
                      title="生成视频"
                    >
                      <Video className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => void setAsIdentityAnchor(url)}
                      className="rounded p-1.5 text-white/70 transition hover:bg-white/10 hover:text-amber-300"
                      title="设为身份锚点"
                    >
                      <Anchor className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => void patchGirlfriend(url, 'avatar_url')}
                      className="rounded p-1.5 text-white/70 transition hover:bg-white/10 hover:text-violet-300"
                      title="设为头像"
                    >
                      <UserRound className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => void patchGirlfriend(url, 'portrait_url')}
                      className="rounded p-1.5 text-white/70 transition hover:bg-white/10 hover:text-cyan-300"
                      title="设为相册封面"
                    >
                      <Images className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setLightboxUrl(url)}
                  className="rounded p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
                  title="查看大图"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
