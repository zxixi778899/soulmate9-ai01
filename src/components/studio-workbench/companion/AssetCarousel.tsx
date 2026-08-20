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

      <p className="mt-1 text-[9px] text-slate-600">点击设为参考图；悬停可见操作按钮</p>

      {/* 横向滚动容器 - 移除垂直滚动 */}
      <div className="mt-2 space-y-3">
        {Object.entries(grouped).map(([role, items]) => {
          // 只显示身份锚点和相册两个分类
          if (!["identity-anchor", "album"].includes(role)) return null;
          
          const LABELS: Record<string, string> = {
            'identity-anchor': '身份锚点（IP-Adapter 优先参考）',
            'album': '相册封面',
          };
          
          return (
            <div key={role}>
              <p className="mb-1.5 text-[9px] font-medium uppercase text-slate-600">
                {LABELS[role] || role}
              </p>
              {/* 横向滚动区域 */}
              <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
                {items.map((asset) => {
                  const url = String(asset.url || '');
                  const isActive = state.inputImage === url;
                  const isAvatar = currentAvatar && url === currentAvatar;
                  const isPortrait = currentPortrait && url === currentPortrait;
                  const isIpRef = ipAdapterRef && url === ipAdapterRef;
                  
                  return (
                    <div key={String(asset.id || url)} className="group relative shrink-0">
                      {/* 图片容器 */}
                      <div className="relative">
                        <button
                          onClick={() => setAsReference(url)}
                          className={cn(
                            'relative h-[168px] w-[144px] overflow-hidden rounded-lg border transition',
                            isActive
                              ? 'border-violet-500 ring-2 ring-violet-500/30'
                              : isIpRef
                                ? 'border-violet-500/50'
                                : 'border-white/10 hover:border-white/20',
                          )}
                        >
                          {url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-white/[0.03]">
                              <ImageIcon className="h-9 w-9 text-slate-700" />
                            </div>
                          )}
                          {isActive && (
                            <div className="absolute inset-0 flex items-center justify-center bg-violet-900/40 backdrop-blur-sm">
                              <Crosshair className="h-12 w-12 text-violet-300" />
                            </div>
                          )}
                        </button>
                        
                        {/* 顶部状态标签 */}
                        {(isAvatar || isPortrait || isIpRef) && (
                          <div className="absolute left-2 top-2 flex gap-1.5">
                            {isAvatar && <span className="rounded bg-violet-500 px-2 text-[10px] font-bold text-white shadow">头像</span>}
                            {isPortrait && <span className="rounded bg-cyan-500 px-2 text-[10px] font-bold text-white shadow">相册</span>}
                            {!isAvatar && isIpRef && <span className="rounded bg-fuchsia-500 px-2 text-[10px] font-bold text-white shadow">IP</span>}
                          </div>
                        )}
                      </div>
                      
                      {/* 底部固定功能栏 - 仅悬停显示 */}
                      <div className="mt-2 hidden items-center justify-center gap-1 rounded bg-black/80 py-1.5 px-2 group-hover:flex overflow-hidden">
                        <button
                          onClick={() => void patchGirlfriend(url, 'avatar_url')}
                          className="flex flex-col items-center gap-0.5 rounded p-1 text-white/70 hover:bg-white/10 hover:text-violet-300 transition min-w-[0]"
                          title="设为头像"
                        >
                          <UserRound className="h-3.5 w-3.5" />
                          <span className="truncate text-[7px] font-medium">头像</span>
                        </button>
                        <button
                          onClick={() => void patchGirlfriend(url, 'portrait_url')}
                          className="flex flex-col items-center gap-0.5 rounded p-1 text-white/70 hover:bg-white/10 hover:text-cyan-300 transition min-w-[0]"
                          title="设为相册封面"
                        >
                          <Images className="h-3.5 w-3.5" />
                          <span className="truncate text-[7px] font-medium">相册</span>
                        </button>
                        <button
                          onClick={() => void setAsIdentityAnchor(url)}
                          className="flex flex-col items-center gap-0.5 rounded p-1 text-white/70 hover:bg-white/10 hover:text-amber-300 transition min-w-[0]"
                          title="设为身份锚点"
                        >
                          <Anchor className="h-3.5 w-3.5" />
                          <span className="truncate text-[7px] font-medium">锚点</span>
                        </button>
                        {String(asset.id || '').trim() && (
                          <>
                            <div className="h-3 w-px bg-white/20 shrink-0" />
                            <button
                              onClick={() => void deleteAsset(String(asset.id))}
                              className="flex flex-col items-center gap-0.5 rounded p-1 text-white/70 hover:bg-white/10 hover:text-red-400 transition min-w-[0]"
                              title="删除资产"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="truncate text-[7px] font-medium">删除</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
