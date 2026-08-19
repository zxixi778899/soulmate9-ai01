'use client';

import { useStudio } from '../StudioContext';
import { cn } from '@/lib/utils';
import { Image as ImageIcon, Crosshair } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Any } from '../StudioWorkbench.types';

export function AssetCarousel() {
  const { state, dispatch } = useStudio();
  const assets = state.companionAssets;

  if (assets.length === 0) return null;

  const setAsReference = (url: string) => {
    dispatch({ type: 'SET_INPUT_IMAGE', url });
    if (state.genMode === 'txt2img') dispatch({ type: 'SET_MODE', genMode: 'img2img' });
  };

  // Group by role
  const grouped: Record<string, Any[]> = {};
  for (const asset of assets) {
    const role = String(asset.asset_role || asset.role || 'other');
    if (!grouped[role]) grouped[role] = [];
    grouped[role].push(asset);
  }

  const ROLE_LABELS: Record<string, string> = {
    avatar_closeup: '头像',
    avatar_bust: '半身',
    full_body: '全身',
    portrait: '立绘',
    scene: '场景',
    other: '其他',
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          伴侣资产
        </h4>
        <Badge variant="outline" className="text-[9px] text-slate-500 border-white/10">
          {assets.length} 张
        </Badge>
      </div>

      <div className="mt-2 space-y-2.5 max-h-40 overflow-y-auto pr-1">
        {Object.entries(grouped).map(([role, items]) => (
          <div key={role}>
            <p className="mb-1 text-[9px] font-medium text-slate-600 uppercase">
              {ROLE_LABELS[role] || role}
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {items.slice(0, 12).map((asset) => {
                const url = String(asset.url || '');
                const isActive = state.inputImage === url;
                return (
                  <button
                    key={String(asset.id || url)}
                    onClick={() => setAsReference(url)}
                    className={cn(
                      'relative h-14 w-11 shrink-0 overflow-hidden rounded-md border transition',
                      isActive
                        ? 'border-violet-500 ring-1 ring-violet-500/30'
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
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
