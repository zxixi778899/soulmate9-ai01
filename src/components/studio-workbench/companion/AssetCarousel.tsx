'use client';

import { useStudio } from '../StudioContext';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Image as ImageIcon, Crosshair, UserRound, Images, Anchor, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Any } from '../StudioWorkbench.types';
import { logger } from '@/lib/logger';

export function AssetCarousel() {
  const { state, dispatch, refreshAssets } = useStudio();
  const assets = state.companionAssets;

  if (assets.length === 0) return null;

  const girlfriend = state.scopedGirlfriend as Any | null;
  const currentAvatar = String(girlfriend?.avatar_url || '');
  const currentPortrait = String(girlfriend?.portrait_url || '');

  const roleOf = (asset: Any): string => String(asset.asset_role || asset.meta?.asset_role || asset.role || 'other');

  // 当前 IP-Adapter 参考图（与 StudioContext.generate 的解析顺序一致）
  const anchorAsset = assets.find((a) => roleOf(a) === 'identity-anchor' && a.url);
  const avatarCloseupAsset = assets.find((a) => roleOf(a) === 'avatar-closeup' && a.url);
  const ipAdapterRef = String(anchorAsset?.url || avatarCloseupAsset?.url || currentAvatar || currentPortrait || '');

  const setAsReference = (url: string) => {
    dispatch({ type: 'SET_INPUT_IMAGE', url });
    if (state.genMode === 'txt2img') dispatch({ type: 'SET_MODE', genMode: 'img2img' });
  };

  // 设为头像 / 相册（PATCH girlfriends 白名单字段）
  const patchGirlfriend = async (url: string, field: 'avatar_url' | 'portrait_url') => {
    if (!state.companionId) { toast.error('请先选择伴侣'); return; }
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
  };

  // 设为身份锚点（companion_assets 库写入 identity-anchor）
  const setAsIdentityAnchor = async (url: string) => {
    if (!state.companionId) { toast.error('请先选择伴侣'); return; }
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
  };

  // 删除资产（companion_assets + generation_assets 级联）
  const deleteAsset = async (assetId: string) => {
    if (!state.companionId) { toast.error('请先选择伴侣'); return; }
    if (!confirm('确定删除此资产吗？')) return;
    try {
      const res = await authedFetch(
        `/api/companion/${encodeURIComponent(state.companionId)}/assets?assetId=${encodeURIComponent(assetId)}`,
        { method: 'DELETE' },
      );
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok && data.error !== 'Asset not found') throw new Error(data.error || '删除失败');
      // Fallback: try deleting by URL in companion_assets if not found by id
      if (data.error === 'Asset not found' || !res.ok) {
        logger.warn('[AssetCarousel] asset not found by id, trying URL-based deletion');
      }
      await refreshAssets(state.companionId);
      toast.success('已删除');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  // Group by role
  const grouped: Record<string, Any[]> = {};
  for (const asset of assets) {
    const role = roleOf(asset);
    if (!grouped[role]) grouped[role] = [];
    grouped[role].push(asset);
  }

  const ROLE_LABELS: Record<string, string> = {
    'identity-anchor': '身份锚点',
    'avatar-closeup': '半身头像',
    character_art: '立绘',
    'character-art': '立绘',
    album: '相册',
    scene: '场景',
    portrait: '立绘',
    other: '其他',
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          伴侣资产
        </h4>
        <div className="flex items-center gap-1.5">
          {state.ipAdapter && ipAdapterRef && (
            <Badge variant="outline" className="border-violet-500/30 text-[9px] text-violet-300">
              IP-Adapter 参考已绑定
            </Badge>
          )}
          <Badge variant="outline" className="border-white/10 text-[9px] text-slate-500">
            {assets.length} 张
          </Badge>
        </div>
      </div>

      <p className="mt-1 text-[9px] text-slate-600">点击设为参考图；悬停可设为头像 / 相册 / 身份锚点</p>

      <div className="mt-2 max-h-44 space-y-2.5 overflow-y-auto pr-1">
        {Object.entries(grouped).map(([role, items]) => (
          <div key={role}>
            <p className="mb-1 text-[9px] font-medium uppercase text-slate-600">
              {ROLE_LABELS[role] || role}
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {items.slice(0, 16).map((asset) => {
                const url = String(asset.url || '');
                const isActive = state.inputImage === url;
                const isAvatar = currentAvatar && url === currentAvatar;
                const isPortrait = currentPortrait && url === currentPortrait;
                const isIpRef = ipAdapterRef && url === ipAdapterRef;
                return (
                  <div key={String(asset.id || url)} className="group relative h-14 w-11 shrink-0">
                    <button
                      onClick={() => setAsReference(url)}
                      className={cn(
                        'relative h-full w-full overflow-hidden rounded-md border transition',
                        isActive
                          ? 'border-violet-500 ring-1 ring-violet-500/30'
                          : isIpRef
                            ? 'border-violet-500/50'
                            : 'border-white/10 hover:border-white/20',
                      )}
                    >
                      {url ? (
                        // 资产缩略图 URL 为动态签名链接，不走 next/image 优化
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-white/[0.03]">
                          <ImageIcon className="h-3 w-3 text-slate-700" />
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute inset-0 flex items-center justify-center bg-violet-900/40">
                          <Crosshair className="h-3 w-3 text-violet-300" />
                        </div>
                      )}
                    </button>

                    {/* 状态标记 */}
                    {(isAvatar || isPortrait || isIpRef) && (
                      <div className="absolute left-0.5 top-0.5 flex gap-0.5">
                        {isAvatar && <span className="rounded bg-violet-500 px-0.5 text-[7px] font-bold text-white">头像</span>}
                        {isPortrait && <span className="rounded bg-cyan-500 px-0.5 text-[7px] font-bold text-white">相册</span>}
                        {!isAvatar && isIpRef && <span className="rounded bg-fuchsia-500 px-0.5 text-[7px] font-bold text-white">IP</span>}
                      </div>
                    )}

                    {/* 悬停操作：头像 / 相册 / 身份锚点 / 删除 */}
                    <div className="absolute inset-x-0 bottom-0 hidden items-center justify-between gap-0.5 bg-black/80 py-0.5 group-hover:flex">
                      <div className="flex gap-0.5">
                        <button
                          onClick={() => void patchGirlfriend(url, 'avatar_url')}
                          className="rounded p-0.5 text-white/70 hover:bg-white/10 hover:text-violet-300"
                          title="设为头像"
                        >
                          <UserRound className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={() => void patchGirlfriend(url, 'portrait_url')}
                          className="rounded p-0.5 text-white/70 hover:bg-white/10 hover:text-cyan-300"
                          title="设为相册封面"
                        >
                          <Images className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={() => void setAsIdentityAnchor(url)}
                          className="rounded p-0.5 text-white/70 hover:bg-white/10 hover:text-amber-300"
                          title="设为身份锚点（IP-Adapter 优先参考）"
                        >
                          <Anchor className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      {String(asset.id || '').trim() && (
                        <button
                          onClick={() => void deleteAsset(String(asset.id))}
                          className="rounded p-0.5 text-white/70 hover:bg-white/10 hover:text-red-400"
                          title="删除资产"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
