'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authedFetch } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Check, Shirt, Loader2, Sparkles, ShoppingBag, User, Wand2,
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
  equipped_outfit_id?: string | null;
  equipped_outfit_name?: string | null;
  appearance_style?: string | null;
  base_portrait_url?: string | null;
}

type CatalogRow = OutfitCatalogItem & { owned?: boolean; equipped?: boolean };

export default function WardrobePage() {
  const router = useRouter();
  const [girlfriends, setGirlfriends] = useState<Girlfriend[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const selected = useMemo(
    () => girlfriends.find((g) => g.id === selectedId) || null,
    [girlfriends, selectedId],
  );

  const portraitOf = (g: Girlfriend) =>
    g.image_url || g.portrait_url || g.avatar_url || '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const girlsRes = await authedFetch('/api/girlfriends');
      const girlsData = await girlsRes.json();
      const list = (girlsData.girlfriends || []) as Girlfriend[];
      setGirlfriends(list);
      const sid = selectedId && list.some((g) => g.id === selectedId)
        ? selectedId
        : list[0]?.id || null;
      setSelectedId(sid);

      if (sid) {
        const eqRes = await authedFetch(`/api/wardrobe/equip?girlfriend_id=${sid}`);
        const eqData = await eqRes.json();
        setCatalog(eqData.catalog || []);
        // sync equipped fields onto selected girl
        setGirlfriends((prev) =>
          prev.map((g) =>
            g.id === sid
              ? {
                  ...g,
                  equipped_outfit_id: eqData.equipped_outfit_id || g.equipped_outfit_id,
                }
              : g,
          ),
        );
      } else {
        const eqRes = await authedFetch('/api/wardrobe/equip');
        const eqData = await eqRes.json();
        setCatalog(eqData.catalog || []);
      }
    } catch {
      toast.error('加载衣柜失败');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectGirl = async (id: string) => {
    setSelectedId(id);
    try {
      const eqRes = await authedFetch(`/api/wardrobe/equip?girlfriend_id=${id}`);
      const eqData = await eqRes.json();
      setCatalog(eqData.catalog || []);
      setGirlfriends((prev) =>
        prev.map((g) =>
          g.id === id
            ? { ...g, equipped_outfit_id: eqData.equipped_outfit_id }
            : g,
        ),
      );
    } catch {
      toast.error('加载服装失败');
    }
  };

  const equip = async (outfitId: string, regenerate: boolean) => {
    if (!selectedId) {
      toast.error('请先选择一位女友');
      return;
    }
    setBusyId(outfitId + (regenerate ? ':gen' : ''));
    try {
      const res = await authedFetch('/api/wardrobe/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          girlfriend_id: selectedId,
          outfit_id: outfitId,
          regenerate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '换装失败');

      toast.success(
        regenerate
          ? data.regenerated
            ? '已换装并生成新形象'
            : '已换装（肖像生成未完成，聊天中已生效服装描述）'
          : `已换上 ${data.outfit?.name || '服装'}`,
      );

      // Update local girl portrait / outfit
      setGirlfriends((prev) =>
        prev.map((g) => {
          if (g.id !== selectedId) return g;
          return {
            ...g,
            equipped_outfit_id: data.outfit?.id || outfitId,
            equipped_outfit_name: data.outfit?.name,
            appearance_style: data.girlfriend?.appearance_style || g.appearance_style,
            portrait_url: data.portrait_url || data.girlfriend?.portrait_url || g.portrait_url,
            avatar_url: data.portrait_url || data.girlfriend?.avatar_url || g.avatar_url,
            image_url: data.portrait_url || g.image_url,
          };
        }),
      );
      setCatalog((prev) =>
        prev.map((o) => ({
          ...o,
          equipped: o.id === outfitId,
          owned: o.owned || o.id === outfitId || o.tier === 'free',
        })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '换装失败');
    } finally {
      setBusyId(null);
    }
  };

  const unequip = async () => {
    if (!selectedId) return;
    setBusyId('unequip');
    try {
      const res = await authedFetch('/api/wardrobe/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          girlfriend_id: selectedId,
          action: 'unequip',
          restore_portrait: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '脱下失败');
      toast.success('已脱下服装');
      setGirlfriends((prev) =>
        prev.map((g) =>
          g.id === selectedId
            ? {
                ...g,
                equipped_outfit_id: null,
                equipped_outfit_name: null,
                portrait_url: data.girlfriend?.portrait_url || g.base_portrait_url || g.portrait_url,
                avatar_url: data.girlfriend?.avatar_url || g.avatar_url,
              }
            : g,
        ),
      );
      setCatalog((prev) => prev.map((o) => ({ ...o, equipped: false })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '脱下失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#08040e]">
      {/* Header */}
      <div className="border-b border-white/[0.08] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70"
            onClick={() => router.push('/shop')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-white">换装衣柜</h1>
            <p className="text-[11px] text-white/45">
              选择女友 → 点「穿上」改聊天形象 · 「生成形象」把衣服画到身上
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={() => router.push('/shop')}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            商城
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Girl list */}
        <aside className="border-b border-white/[0.08] lg:w-56 lg:border-b-0 lg:border-r lg:overflow-y-auto">
          <div className="p-3 text-[10px] font-bold tracking-wider text-white/40 uppercase">
            我的女友
          </div>
          {loading ? (
            <div className="space-y-2 px-3 pb-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl bg-white/5" />
              ))}
            </div>
          ) : girlfriends.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-white/40">
              <User className="mx-auto mb-2 h-8 w-8 opacity-40" />
              还没有女友
              <Button size="sm" className="mt-3 w-full" onClick={() => router.push('/create')}>
                去创建
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-x-visible">
              {girlfriends.map((g) => {
                const active = g.id === selectedId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => selectGirl(g.id)}
                    className={cn(
                      'flex min-w-[140px] items-center gap-2 rounded-xl border p-2 text-left transition-all lg:min-w-0',
                      active
                        ? 'border-[#ff2e88]/60 bg-[#ff2e88]/10'
                        : 'border-white/[0.06] bg-white/[0.03] hover:border-white/20',
                    )}
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5">
                      {portraitOf(g) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={portraitOf(g)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-white/30">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white">{g.name}</div>
                      <div className="truncate text-[10px] text-white/40">
                        {g.equipped_outfit_name || g.equipped_outfit_id || '未换装'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Main: preview + outfits */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {!selected ? (
            <div className="flex h-64 flex-col items-center justify-center text-sm text-white/40">
              选择左侧女友开始换装
            </div>
          ) : (
            <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[280px_1fr]">
              {/* Preview */}
              <div className="space-y-3">
                <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                  {portraitOf(selected) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={portraitOf(selected)}
                      alt={selected.name}
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-white/30">
                      <Shirt className="h-12 w-12" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                    <div className="text-base font-bold text-white">{selected.name}</div>
                    <div className="text-[11px] text-white/60">
                      {selected.equipped_outfit_name ||
                        selected.appearance_style ||
                        '当前未装备特殊服装'}
                    </div>
                  </div>
                </div>
                {selected.equipped_outfit_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    disabled={busyId === 'unequip'}
                    onClick={unequip}
                  >
                    {busyId === 'unequip' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      '脱下并恢复原肖像'
                    )}
                  </Button>
                )}
                <p className="text-[10px] leading-relaxed text-white/40">
                  <b className="text-white/60">穿上</b>：立刻写入角色设定，聊天里她会按这套衣服说话/描述。
                  <br />
                  <b className="text-white/60">生成形象</b>：用 FLUX 参考当前脸，生成穿着该服装的新肖像（需 RunPod）。
                </p>
              </div>

              {/* Outfit grid */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">
                    服装库
                  </h2>
                  <span className="text-[10px] text-white/35">{catalog.length} 套</span>
                </div>
                {loading ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <Skeleton key={i} className="h-40 rounded-xl bg-white/5" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {catalog.map((o) => {
                      const equipped = o.equipped || selected.equipped_outfit_id === o.id;
                      const canWear = o.owned !== false;
                      const wearing = busyId === o.id;
                      const generating = busyId === o.id + ':gen';
                      return (
                        <div
                          key={o.id}
                          className={cn(
                            'rounded-xl border p-3 transition-all',
                            equipped
                              ? 'border-[#ff2e88]/70 bg-[#ff2e88]/10 shadow-[0_0_20px_rgba(255,46,136,0.2)]'
                              : 'border-white/[0.08] bg-white/[0.03]',
                          )}
                        >
                          <div className="mb-2 flex items-start justify-between gap-1">
                            <div className="text-2xl">{o.emoji || '👗'}</div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge
                                variant="outline"
                                className="text-[9px] border-white/15 text-white/60"
                              >
                                {o.tier}
                              </Badge>
                              {equipped && (
                                <Badge className="bg-[#ff2e88] text-[9px]">穿着中</Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-xs font-semibold text-white leading-tight">
                            {o.name}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[10px] text-white/45">
                            {o.description}
                          </p>
                          {o.intimacy_boost > 0 && (
                            <p className="mt-1 text-[10px] text-pink-300/70">
                              +{o.intimacy_boost} 亲密加成
                            </p>
                          )}
                          <div className="mt-2 flex flex-col gap-1.5">
                            <Button
                              size="sm"
                              className={cn(
                                'h-8 w-full gap-1 text-[11px]',
                                equipped
                                  ? 'bg-emerald-600 hover:bg-emerald-500'
                                  : 'bg-gradient-to-r from-[#ff2e88] to-[#c026d3]',
                              )}
                              disabled={!canWear || wearing || generating || equipped}
                              onClick={() => equip(o.id, false)}
                            >
                              {wearing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : equipped ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Shirt className="h-3 w-3" />
                              )}
                              {equipped ? '已穿上' : canWear ? '穿上' : '未拥有'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-full gap-1 border-white/15 text-[11px] text-white/80"
                              disabled={!canWear || wearing || generating}
                              onClick={() => equip(o.id, true)}
                            >
                              {generating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Wand2 className="h-3 w-3" />
                              )}
                              生成形象
                            </Button>
                          </div>
                          {!canWear && (
                            <button
                              type="button"
                              className="mt-1.5 w-full text-center text-[10px] text-[#ff6ba6] underline"
                              onClick={() => router.push('/shop')}
                            >
                              去商城购买
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
