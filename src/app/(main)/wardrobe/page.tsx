'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { notifyDataChange } from '@/hooks/useDataSync';
import { useRouter } from 'next/navigation';
import { authedFetch } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Check, Film, Loader2, RefreshCw, Shirt, Sparkles, UserRound } from 'lucide-react';

type Girlfriend = {
  id: string;
  name: string;
  portrait_url?: string | null;
  avatar_url?: string | null;
  image_url?: string | null;
  portrait_video_url?: string | null;
};

type InventoryOutfit = {
  id: string;
  asset_id: string;
  asset_payload?: { video_url?: string; wear_prompt?: string };
  product?: {
    name: string;
    description?: string;
    preview_url?: string;
    rarity?: string;
    virtual_meta?: { video_url?: string; asset_id?: string };
  };
};

function girlImage(girl?: Girlfriend): string {
  return girl?.image_url || girl?.portrait_url || girl?.avatar_url || '';
}

export default function WardrobePage() {
  const router = useRouter();
  const [girls, setGirls] = useState<Girlfriend[]>([]);
  const [outfits, setOutfits] = useState<InventoryOutfit[]>([]);
  const [girlId, setGirlId] = useState('');
  const [outfitId, setOutfitId] = useState('');
  const [loading, setLoading] = useState(true);
  const [equipping, setEquipping] = useState(false);

  const selectedGirl = useMemo(() => girls.find((girl) => girl.id === girlId), [girls, girlId]);
  const selectedOutfit = useMemo(() => outfits.find((item) => item.asset_id === outfitId), [outfits, outfitId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [girlsResponse, inventoryResponse] = await Promise.all([
        authedFetch('/api/girlfriends'),
        authedFetch('/api/shop/v2/inventory?asset_type=outfit'),
      ]);
      const girlsData = await girlsResponse.json() as { girlfriends?: Girlfriend[]; error?: string };
      const inventoryData = await inventoryResponse.json() as { items?: InventoryOutfit[]; error?: string };
      if (!girlsResponse.ok) throw new Error(girlsData.error || '女友加载失败');
      if (!inventoryResponse.ok) throw new Error(inventoryData.error || '衣柜加载失败');
      const nextGirls = girlsData.girlfriends || [];
      const nextOutfits = inventoryData.items || [];
      setGirls(nextGirls);
      setOutfits(nextOutfits);
      setGirlId((current) => current || nextGirls[0]?.id || '');
      setOutfitId((current) => current || nextOutfits[0]?.asset_id || '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '衣柜加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useAutoRefresh(load);

  const equip = async () => {
    if (!girlId || !outfitId) {
      toast.error('请先选择女友和服装');
      return;
    }
    setEquipping(true);
    try {
      const response = await authedFetch('/api/shop/v2/outfits/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ girlfriend_id: girlId, outfit_asset_id: outfitId, action: 'equip', regenerate: true }),
      });
      const data = await response.json() as { portrait_url?: string; portrait_video_url?: string; warning?: string; error?: string };
      if (!response.ok) throw new Error(data.error || '换装失败');
      setGirls((current) => current.map((girl) => girl.id === girlId ? {
        ...girl,
        portrait_url: data.portrait_url || girl.portrait_url,
        image_url: data.portrait_url || girl.image_url,
        portrait_video_url: data.portrait_video_url || girl.portrait_video_url,
      } : girl));
      toast.success(data.portrait_url ? '换装完成，新立绘已保存' : '服装已穿戴');
      notifyDataChange('wardrobe');
      notifyDataChange('girlfriends');
      if (data.warning) toast.warning(data.warning);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '换装失败');
    } finally {
      setEquipping(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#08080d] p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><Button size="icon" variant="ghost" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Shirt className="text-pink-400" />女友衣柜</h1><p className="mt-1 text-sm text-zinc-500">已购买和收到的服装会永久保存在这里，可随时为任意个人女友更换。</p></div></div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新衣柜</Button>
        </header>

        {loading ? <div className="flex justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-pink-400" /></div> : <div className="grid gap-6 lg:grid-cols-[280px_1fr_360px]">
          <section className="space-y-3"><h2 className="text-xs font-semibold uppercase tracking-[.2em] text-zinc-500">1. 选择女友</h2>{girls.map((girl) => <button type="button" key={girl.id} onClick={() => setGirlId(girl.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${girlId === girl.id ? 'border-pink-400 bg-pink-400/10' : 'border-white/10 bg-white/[.03]'}`}>{girlImage(girl) ? <img src={girlImage(girl)} alt={girl.name} className="h-12 w-12 rounded-xl object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900"><UserRound className="h-5 w-5" /></div>}<span className="flex-1 font-medium">{girl.name}</span>{girlId === girl.id && <Check className="h-4 w-4 text-pink-400" />}</button>)}{girls.length === 0 && <Empty text="还没有个人女友" />}</section>

          <section><h2 className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-zinc-500">2. 选择服装</h2>{outfits.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{outfits.map((item) => { const selected = item.asset_id === outfitId; const product = item.product; const video = item.asset_payload?.video_url || product?.virtual_meta?.video_url; return <button type="button" key={item.id} onClick={() => setOutfitId(item.asset_id)} className={`group overflow-hidden rounded-2xl border text-left ${selected ? 'border-fuchsia-400 ring-2 ring-fuchsia-400/20' : 'border-white/10 bg-white/[.03]'}`}><div className="relative aspect-[3/4] bg-zinc-900">{product?.preview_url ? <img src={product.preview_url} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Shirt className="h-10 w-10 text-zinc-700" /></div>}{video && <Badge className="absolute right-2 top-2 bg-black/70"><Film className="mr-1 h-3 w-3" />视频</Badge>}{selected && <span className="absolute inset-0 flex items-center justify-center bg-fuchsia-500/15"><Check className="h-10 w-10 rounded-full bg-fuchsia-500 p-2" /></span>}</div><div className="p-3"><p className="font-medium">{product?.name || '服装'}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{product?.description}</p></div></button>; })}</div> : <Empty text="衣柜还是空的，请先去商城购买或赠送服装" />}</section>

          <aside className="h-fit rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(236,72,153,.18),transparent_45%),#101018] p-4 lg:sticky lg:top-6"><h2 className="mb-4 flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-pink-400" />换装预览</h2><div className="overflow-hidden rounded-2xl bg-black/40">{girlImage(selectedGirl) ? <img src={girlImage(selectedGirl)} alt={selectedGirl?.name || '女友'} className="aspect-[3/4] w-full object-cover" /> : <div className="flex aspect-[3/4] items-center justify-center"><UserRound className="h-12 w-12 text-zinc-700" /></div>}</div><div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm"><p className="text-zinc-500">即将为</p><p className="mt-1 font-medium">{selectedGirl?.name || '未选择'} · {selectedOutfit?.product?.name || '未选择服装'}</p></div><Button className="mt-4 w-full bg-gradient-to-r from-pink-500 to-fuchsia-600" size="lg" onClick={() => void equip()} disabled={equipping || !selectedGirl || !selectedOutfit}>{equipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{equipping ? '正在保持人物一致性并换装…' : '换装并生成新立绘'}</Button><p className="mt-3 text-center text-xs leading-5 text-zinc-500">保留女友脸型、发色、眼睛和身材特征。商品附带视频时会同步到她的个人视频。</p></aside>
        </div>}
      </div>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-zinc-500">{text}</div>;
}
