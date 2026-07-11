'use client';

/**
 * 视频管理 — 为女友卡上传肖像/头像循环视频
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { uploadGirlfriendVideo, type VideoField } from '@/lib/admin-video-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Film,
  Upload,
  RefreshCw,
  Search,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

type GfRow = {
  id: string;
  name: string;
  slug?: string | null;
  portrait_url?: string | null;
  avatar_url?: string | null;
  portrait_video_url?: string | null;
  avatar_video_url?: string | null;
  is_public?: boolean;
  review_status?: string;
};

export default function AdminVideosPage() {
  const [list, setList] = useState<GfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [phase, setPhase] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    id: string;
    field: VideoField;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/girlfriends?limit=100&sort=created_at&order=desc');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setList((data.girlfriends || []) as GfRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = list.filter((g) => {
    const name = (g.name || '').toLowerCase();
    if (q && !name.includes(q.toLowerCase()) && !(g.slug || '').includes(q.toLowerCase())) {
      return false;
    }
    const hasVideo = !!(g.portrait_video_url || g.avatar_video_url);
    if (filter === 'with') return hasVideo;
    if (filter === 'without') return !hasVideo;
    return true;
  });

  const pickUpload = (id: string, field: VideoField) => {
    setPending({ id, field });
    fileRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pending) return;
    const { id, field } = pending;
    setPending(null);
    setUploadingId(id);
    setPhase('准备…');
    try {
      const result = await uploadGirlfriendVideo({
        file,
        field,
        girlfriendId: id,
        onProgress: (p) => {
          setPhase(
            p === 'sign' ? '签名…' : p === 'put' ? '上传中…' : '写入档案…',
          );
        },
      });
      setList((prev) =>
        prev.map((g) =>
          g.id === id
            ? {
                ...g,
                [field]: result.url,
              }
            : g,
        ),
      );
      toast.success(
        result.bound
          ? `已上传并绑定：${field === 'portrait_video_url' ? '肖像视频' : '头像视频'}`
          : '已上传（请到女友编辑页确认）',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploadingId(null);
      setPhase('');
    }
  };

  const clearVideo = async (id: string, field: VideoField) => {
    if (!confirm('清除该视频字段？不会删除存储文件。')) return;
    try {
      const res = await authedFetch('/api/admin/girlfriends', {
        method: 'PATCH',
        body: JSON.stringify({ id, [field]: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '清除失败');
      setList((prev) =>
        prev.map((g) => (g.id === id ? { ...g, [field]: null } : g)),
      );
      toast.success('已清除');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '清除失败');
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
        className="hidden"
        onChange={onFile}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Film className="h-5 w-5 text-[#FF2D78]" />
            视频管理
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            上传竖版循环短视频（mp4/webm，建议 &lt; 5MB）到女友卡。直传存储，不受 Vercel 4.5MB 限制。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="搜索名称 / slug"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="with">已有视频</SelectItem>
            <SelectItem value="without">缺少视频</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          没有匹配的女友
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => {
            const busy = uploadingId === g.id;
            const video = g.portrait_video_url || g.avatar_video_url;
            return (
              <div
                key={g.id}
                className="overflow-hidden rounded-xl border border-border/50 bg-card/40"
              >
                <div className="relative aspect-[3/4] bg-muted/30">
                  {video ? (
                    <video
                      src={video}
                      poster={g.portrait_url || g.avatar_url || undefined}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      playsInline
                      autoPlay
                    />
                  ) : g.portrait_url || g.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.portrait_url || g.avatar_url || ''}
                      alt={g.name}
                      className="h-full w-full object-cover opacity-80"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl font-black text-muted-foreground/40">
                      {g.name?.charAt(0) || '?'}
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex gap-1">
                    {g.portrait_video_url && (
                      <Badge className="bg-[#FF2D78]/90 text-[10px]">肖像视频</Badge>
                    )}
                    {g.avatar_video_url && (
                      <Badge variant="secondary" className="text-[10px]">
                        头像视频
                      </Badge>
                    )}
                    {!video && (
                      <Badge variant="outline" className="bg-black/40 text-[10px] text-white">
                        无视频
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{g.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {g.slug || g.id.slice(0, 8)}
                      </div>
                    </div>
                    {busy && (
                      <span className="flex items-center gap-1 text-[11px] text-[#FF2D78]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {phase}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      className="h-8 flex-1"
                      disabled={busy}
                      onClick={() => pickUpload(g.id, 'portrait_video_url')}
                    >
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      肖像视频
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1"
                      disabled={busy}
                      onClick={() => pickUpload(g.id, 'avatar_video_url')}
                    >
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      头像视频
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.portrait_video_url && (
                      <>
                        <a
                          href={g.portrait_video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] hover:bg-muted"
                        >
                          <ExternalLink className="h-3 w-3" /> 打开肖像视频
                        </a>
                        <button
                          type="button"
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-red-500/30 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                          onClick={() => clearVideo(g.id, 'portrait_video_url')}
                        >
                          <Trash2 className="h-3 w-3" /> 清除肖像
                        </button>
                      </>
                    )}
                    {g.avatar_video_url && (
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-red-500/30 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                        onClick={() => clearVideo(g.id, 'avatar_video_url')}
                      >
                        <Trash2 className="h-3 w-3" /> 清除头像
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-dashed p-3 text-[11px] text-muted-foreground">
        <Label className="text-xs font-medium text-foreground">上传说明</Label>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>格式：mp4 / webm / mov；建议竖版 9:16、2–6 秒循环、静音、H.264</li>
          <li>体积：尽量 &lt; 5MB（上限 50MB，过大易卡顿）</li>
          <li>流程：浏览器 → Supabase Storage 直传，不经 Vercel 函数体</li>
        </ul>
      </div>
    </div>
  );
}
