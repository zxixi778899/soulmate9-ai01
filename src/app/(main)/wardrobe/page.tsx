'use client';

/**
 * 简单换装：女友图 + 服装 = 新形象
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authedFetch } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Loader2, Sparkles, ShoppingBag, User, Wand2, Shirt,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { OutfitCatalogItem } from '@/lib/outfit-catalog';

interface Girlfriend {
  id: string;
  name: string;
  portrait_url?: string | null;
  avatar_url?: string | null;
  image_url?: string | null;
  equipped_outfit_name?: string | null;
  equipped_outfit_id?: string | null;
}

export default function WardrobePage() {
  const router = useRouter();
  const [girls, setGirls] = useState<Girlfriend[]>([]);
  const [catalog, setCatalog] = useState<OutfitCatalogItem[]>([]);
  const [girlId, setGirlId] = useState<string | null>(null);
  const [outfitId, setOutfitId] = useState<string | null>(null);
  const [customOutfitUrl, setCustomOutfitUrl] = useState('');
  const [strength, setStrength] = useState(0.55);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const girl = useMemo(() => girls.find((g) => g.id === girlId) || null, [girls, girlId]);
  const outfit = useMemo(
    () => catalog.find((o) => o.id === outfitId) || null,
    [catalog, outfitId],
  );

  const girlImg = (g: Girlfriend) => g.image_url || g.portrait_url || g.avatar_url || '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, cRes] = await Promise.all([
        authedFetch('/api/girlfriends'),
        authedFetch('/api/wardrobe/try-on'),
      ]);
      const gData = await gRes.json();
      const cData = await cRes.json();
      const list = (gData.girlfriends || []) as Girlfriend[];
      setGirls(list);
      setCatalog(cData.catalog || []);
      if (!girlId && list[0]) setGirlId(list[0].id);
      if (!outfitId && cData.catalog?.[0]) setOutfitId(cData.catalog[0].id);
    } catch {
      toast.error('加载失败，请先登录');
    } finally {
      setLoading(false);
    }
  }, [girlId, outfitId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runTryOn = async () => {
    if (!girlId) {
      toast.error('请选择女友');
      return;
    }
    if (!outfitId && !customOutfitUrl.trim()) {
      toast.error('请选择服装或填写服装图链接');
      return;
    }
    if (girl && !girlImg(girl)) {
      toast.error('该女友还没有形象图，请先去生成/上传肖像');
      return;
    }

    setRunning(true);
    setResultUrl(null);
    try {
      const res = await authedFetch('/api/wardrobe/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          girlfriend_id: girlId,
          outfit_id: outfitId || undefined,
          outfit_image_url: customOutfitUrl.trim() || undefined,
          strength,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '换装失败');

      setResultUrl(data.portrait_url || null);
      toast.success('换装完成！');

      // refresh girl portrait in list
      setGirls((prev) =>
        prev.map((g) =>
          g.id === girlId
            ? {
                ...g,
                portrait_url: data.portrait_url,
                avatar_url: data.portrait_url,
                image_url: data.portrait_url,
                equipped_outfit_id: data.outfit?.id,
                equipped_outfit_name: data.outfit?.name,
              }
            : g,
        ),
      );
      if (data.warning) toast.message(data.warning);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '换装失败');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#08040e] text-white">
      <header className="border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold">一键换装</h1>
            <p className="text-[11px] text-white/45">
              工作流：<span className="text-[#ff6ba6]">女友图</span> +{' '}
              <span className="text-cyan-300">服装</span> ={' '}
              <span className="text-emerald-300">新形象</span>
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-white/15"
            onClick={() => router.push('/shop')}
          >
            <ShoppingBag className="mr-1 h-3.5 w-3.5" />
            商城
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
            <Skeleton className="aspect-[3/4] rounded-2xl bg-white/5" />
            <Skeleton className="aspect-[3/4] rounded-2xl bg-white/5" />
            <Skeleton className="aspect-[3/4] rounded-2xl bg-white/5" />
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Formula strip */}
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs">
              <span className="rounded-full bg-pink-500/20 px-3 py-1 text-pink-200">① 女友肖像</span>
              <span className="text-white/30">+</span>
              <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-cyan-200">② 服装</span>
              <span className="text-white/30">→</span>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-200">
                ③ FLUX 换装图
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Girl */}
              <section className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 text-[10px] font-bold tracking-wider text-pink-300/80">
                  ① 选女友
                </div>
                {girls.length === 0 ? (
                  <div className="flex aspect-[3/4] flex-col items-center justify-center text-xs text-white/40">
                    <User className="mb-2 h-8 w-8 opacity-40" />
                    还没有女友
                    <Button size="sm" className="mt-3" onClick={() => router.push('/create')}>
                      去创建
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-white/5">
                      {girl && girlImg(girl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={girlImg(girl)}
                          alt={girl.name}
                          className="h-full w-full object-cover object-top"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-white/30">
                          无肖像
                        </div>
                      )}
                    </div>
                    <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                      {girls.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setGirlId(g.id);
                            setResultUrl(null);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs',
                            g.id === girlId
                              ? 'border-[#ff2e88]/60 bg-[#ff2e88]/15'
                              : 'border-white/10 hover:border-white/25',
                          )}
                        >
                          <div className="h-8 w-8 overflow-hidden rounded-md bg-white/5">
                            {girlImg(g) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={girlImg(g)} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <span className="truncate font-medium">{g.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>

              {/* Outfit */}
              <section className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 text-[10px] font-bold tracking-wider text-cyan-300/80">
                  ② 选服装
                </div>
                <div className="relative mb-2 flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-3 text-center">
                  <div className="text-4xl">{outfit?.emoji || '👗'}</div>
                  <div className="mt-2 text-sm font-semibold">{outfit?.name || '自定义服装'}</div>
                  <p className="mt-1 line-clamp-3 text-[10px] text-white/45">
                    {outfit?.description || '可在下方粘贴服装图片链接'}
                  </p>
                  {outfit && (
                    <Badge className="mt-2 text-[9px]" variant="outline">
                      {outfit.tier}
                    </Badge>
                  )}
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {catalog.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        setOutfitId(o.id);
                        setResultUrl(null);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs',
                        o.id === outfitId
                          ? 'border-cyan-400/50 bg-cyan-500/10'
                          : 'border-white/10 hover:border-white/25',
                      )}
                    >
                      <span>{o.emoji || '👗'}</span>
                      <span className="min-w-0 flex-1 truncate">{o.name}</span>
                      {o.price_cents === 0 && (
                        <span className="text-[9px] text-emerald-400">免费</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <label className="text-[10px] text-white/40">可选：服装图 URL（更准）</label>
                  <Input
                    value={customOutfitUrl}
                    onChange={(e) => setCustomOutfitUrl(e.target.value)}
                    placeholder="https://... 服装预览图"
                    className="mt-1 h-8 border-white/15 bg-black/40 text-xs"
                  />
                </div>
              </section>

              {/* Result */}
              <section className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 text-[10px] font-bold tracking-wider text-emerald-300/80">
                  ③ 换装结果
                </div>
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-white/5">
                  {running ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-white/60">
                      <Loader2 className="h-8 w-8 animate-spin text-[#ff2e88]" />
                      正在把衣服穿到她身上…
                      <span className="text-[10px] text-white/35">约 30–90 秒</span>
                    </div>
                  ) : resultUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resultUrl}
                      alt="try-on result"
                      className="h-full w-full object-cover object-top"
                    />
                  ) : girl && girlImg(girl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={girlImg(girl)}
                      alt=""
                      className="h-full w-full object-cover object-top opacity-40"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-white/30">
                      <Shirt className="h-10 w-10" />
                    </div>
                  )}
                </div>
                {resultUrl && (
                  <p className="mt-2 text-center text-[10px] text-emerald-300/80">
                    已保存为该女友新肖像，聊天会按此服装描述
                  </p>
                )}
              </section>
            </div>

            {/* Controls */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-4">
                <div className="min-w-[180px] flex-1">
                  <div className="mb-1 flex justify-between text-[10px] text-white/45">
                    <span>换装强度（越低越像原脸，越高衣服变化大）</span>
                    <span className="font-mono text-white/70">{strength.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.35}
                    max={0.75}
                    step={0.05}
                    value={strength}
                    onChange={(e) => setStrength(Number(e.target.value))}
                    className="w-full accent-[#ff2e88]"
                  />
                </div>
              </div>
              <Button
                className="h-12 w-full gap-2 bg-gradient-to-r from-[#ff2e88] to-[#c026d3] text-sm font-bold"
                disabled={running || !girlId}
                onClick={runTryOn}
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    换装生成中…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    一键换装（女友图 + 服装）
                    <Sparkles className="h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="mt-2 text-center text-[10px] text-white/35">
                技术：FLUX img2img · 以女友肖像为底 · 服装目录描述驱动穿着效果
                {customOutfitUrl ? ' · 已附加服装图 URL 提示' : ''}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
