'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Plus,
  Search,
  Sparkles,
  ImageOff,
  Film,
  Mic2,
  Star,
  Flame,
  Upload,
  Trash2,
  RefreshCw,
  Heart,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { uploadGirlfriendVideo, type VideoField } from '@/lib/admin-video-upload';
import { logger } from '@/lib/logger';
import {
  traitLabelFor,
  randomizeGirlfriendTraits,
} from '@/lib/girlfriend-traits';

type AccessStatus = 'open' | 'locked' | 'closed';
type RarityTier = 'N' | 'R' | 'SR' | 'SSR';
type MediaFilter =
  | 'all'
  | 'has_image'
  | 'no_image'
  | 'has_video'
  | 'no_video'
  | 'has_audio'
  | 'no_audio';
type PlaceFilter = 'all' | 'featured' | 'hot';

type Girlfriend = {
  id: string;
  name: string;
  age: number;
  gender?: string | null;
  slug?: string | null;
  personality?: string | null;
  tags?: string[] | string | null;
  short_description?: string | null;
  backstory?: string | null;
  occupation?: string | null;
  hobbies?: string | string[] | null;
  portrait_url?: string | null;
  avatar_url?: string | null;
  card_url?: string | null;
  portrait_video_url?: string | null;
  avatar_video_url?: string | null;
  voice?: string | null;
  appearance_hair?: string | null;
  appearance_hair_color?: string | null;
  appearance_eyes?: string | null;
  appearance_body?: string | null;
  appearance_style?: string | null;
  appearance_race?: string | null;
  image_prompt?: string | null;
  negative_prompt?: string | null;
  is_public?: boolean;
  review_status?: string | null;
  rarity?: RarityTier | string | null;
  access_status?: AccessStatus | string | null;
  unlock_price_tokens?: number | null;
  base_intimacy?: number | null;
  base_desire?: number | null;
  base_development?: number | null;
  base_kink?: number | null;
  is_hot?: boolean | null;
  is_featured?: boolean | null;
  hot_score?: number | null;
  sort_order?: number | null;
  created_at?: string | null;
};

type FormState = {
  name: string;
  age: number;
  slug: string;
  gender: 'Female' | 'Male' | 'Transgender';
  personality: string;
  tags: string;
  short_description: string;
  backstory: string;
  occupation: string;
  hobbies: string;
  portrait_url: string;
  avatar_url: string;
  card_url: string;
  portrait_video_url: string;
  avatar_video_url: string;
  voice: string;
  appearance_hair: string;
  appearance_hair_color: string;
  appearance_eyes: string;
  appearance_body: string;
  appearance_style: string;
  appearance_race: string;
  image_prompt: string;
  negative_prompt: string;
  is_public: boolean;
  review_status: string;
  rarity: RarityTier;
  access_status: AccessStatus;
  unlock_price_tokens: number;
  base_intimacy: number;
  base_desire: number;
  base_development: number;
  base_kink: number;
  is_hot: boolean;
  is_featured: boolean;
  hot_score: number;
  sort_order: number;
};

function emptyForm(): FormState {
  const rnd = randomizeGirlfriendTraits();
  return {
    name: '',
    age: rnd.age,
    gender: 'Female',
    slug: '',
    personality: '',
    tags: '',
    short_description: '',
    backstory: '',
    occupation: rnd.occupation || '',
    hobbies: rnd.hobbies || '',
    portrait_url: '',
    avatar_url: '',
    card_url: '',
    portrait_video_url: '',
    avatar_video_url: '',
    voice: '',
    appearance_hair: '',
    appearance_hair_color: '',
    appearance_eyes: '',
    appearance_body: '',
    appearance_style: '',
    appearance_race: '',
    image_prompt: '',
    negative_prompt: '',
    is_public: true,
    review_status: 'approved',
    rarity: 'R',
    access_status: 'open',
    unlock_price_tokens: 0,
    base_intimacy: rnd.base_intimacy,
    base_desire: rnd.base_desire,
    base_development: rnd.base_development,
    base_kink: rnd.base_kink,
    is_hot: false,
    is_featured: false,
    hot_score: 0,
    sort_order: 0,
  };
}

function tagsToString(tags: Girlfriend['tags']): string {
  if (Array.isArray(tags)) return tags.join(', ');
  return String(tags || '');
}

function hobbiesToString(h: Girlfriend['hobbies']): string {
  if (Array.isArray(h)) return h.join(', ');
  return String(h || '');
}

function toForm(g: Girlfriend): FormState {
  return {
    name: g.name || '',
    age: Number(g.age || 22),
    gender: (['Female', 'Male', 'Transgender'].includes(String(g.gender)) ? String(g.gender) : 'Female') as FormState['gender'],
    slug: g.slug || '',
    personality: g.personality || '',
    tags: tagsToString(g.tags),
    short_description: g.short_description || '',
    backstory: g.backstory || '',
    occupation: String(g.occupation || ''),
    hobbies: hobbiesToString(g.hobbies),
    portrait_url: g.portrait_url || '',
    avatar_url: g.avatar_url || '',
    card_url: g.card_url || '',
    portrait_video_url: g.portrait_video_url || '',
    avatar_video_url: g.avatar_video_url || '',
    voice: g.voice || '',
    appearance_hair: g.appearance_hair || '',
    appearance_hair_color: g.appearance_hair_color || '',
    appearance_eyes: g.appearance_eyes || '',
    appearance_body: g.appearance_body || '',
    appearance_style: g.appearance_style || '',
    appearance_race: g.appearance_race || '',
    image_prompt: g.image_prompt || '',
    negative_prompt: g.negative_prompt || '',
    is_public: Boolean(g.is_public),
    review_status: g.review_status || 'approved',
    rarity: (String(g.rarity || 'R').toUpperCase() as RarityTier) || 'R',
    access_status: (String(g.access_status || 'open') as AccessStatus) || 'open',
    unlock_price_tokens: Number(g.unlock_price_tokens || 0),
    base_intimacy: Number(g.base_intimacy || 0),
    base_desire: Number(g.base_desire || 60),
    base_development: Number(g.base_development || 60),
    base_kink: Number(g.base_kink || 55),
    is_hot: Boolean(g.is_hot),
    is_featured: Boolean(g.is_featured),
    hot_score: Number(g.hot_score || 0),
    sort_order: Number(g.sort_order || 0),
  };
}

function hasImage(g: Girlfriend): boolean {
  return Boolean(g.portrait_url || g.avatar_url || g.card_url);
}
function hasVideo(g: Girlfriend): boolean {
  return Boolean(g.portrait_video_url || g.avatar_video_url);
}
function hasAudio(g: Girlfriend): boolean {
  return Boolean(g.voice);
}
function coverOf(g: Girlfriend): string | null {
  return g.portrait_url || g.avatar_url || g.card_url || null;
}
function parseTags(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
}
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function AdminGirlfriendsMediaPageInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Girlfriend[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 60;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [media, setMedia] = useState<MediaFilter>('all');
  const [place, setPlace] = useState<PlaceFilter>('all');
  const [selected, setSelected] = useState<Girlfriend | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [randomizing, setRandomizing] = useState(false);
  const [randomizeConfirmOpen, setRandomizeConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [videoUploading, setVideoUploading] = useState<VideoField | null>(null);
  const [imageUploading, setImageUploading] = useState<'portrait' | 'avatar' | 'card' | null>(null);
  const [audioUploading, setAudioUploading] = useState(false);
  const [assetPickerField, setAssetPickerField] = useState<'portrait_url' | 'avatar_url' | 'card_url' | null>(null);
  const [girlfriendAssets, setGirlfriendAssets] = useState<Array<{ id?: string; url?: string; preview_url?: string; storage_key?: string }>>([]);
  const [girlfriendAssetsLoading, setGirlfriendAssetsLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Batch create state
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchCount, setBatchCount] = useState(5);
  const [batchGender, setBatchGender] = useState<'Female' | 'Male' | 'Transgender' | 'random'>('random');
  const [batchMode, setBatchMode] = useState<'random' | 'llm'>('random');
  const [batchLoading, setBatchLoading] = useState(false);

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f === 'featured') setPlace('featured');
    if (f === 'hot') setPlace('hot');
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: 'created_at',
        order: 'desc',
      });
      if (status !== 'all') params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      const res = await authedFetch(`/api/admin/girlfriends?${params.toString()}`);
      const data = await readResponseJson<{
        girlfriends?: Girlfriend[];
        total?: number;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || '加载失败');
      setItems(data.girlfriends || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, status, q]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const filtered = useMemo(() => {
    return items.filter((g) => {
      if (rarity !== 'all' && String(g.rarity || 'R').toUpperCase() !== rarity) return false;
      if (place === 'featured' && !g.is_featured) return false;
      if (place === 'hot' && !(g.is_hot || Number(g.hot_score || 0) > 0)) return false;
      if (media === 'has_image') return hasImage(g);
      if (media === 'no_image') return !hasImage(g);
      if (media === 'has_video') return hasVideo(g);
      if (media === 'no_video') return !hasVideo(g);
      if (media === 'has_audio') return hasAudio(g);
      if (media === 'no_audio') return !hasAudio(g);
      return true;
    });
  }, [items, rarity, place, media]);

  const openCreate = () => {
    setCreating(true);
    setSelected(null);
    setForm(emptyForm());
  };

  const openEdit = (g: Girlfriend) => {
    setCreating(false);
    setSelected(g);
    setForm(toForm(g));
  };

  const closeDialog = () => {
    setCreating(false);
    setSelected(null);
    setForm(emptyForm());
    setAssetPickerField(null);
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const buildPayload = () => {
    const tags = parseTags(form.tags);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      age: Math.max(18, Number(form.age) || 18),
      gender: form.gender,
      slug: form.slug.trim() || undefined,
      personality: form.personality.trim() || null,
      tags,
      short_description: form.short_description.trim() || null,
      backstory: form.backstory.trim() || null,
      occupation: form.occupation.trim() || null,
      hobbies: form.hobbies.trim() || null,
      portrait_url: form.portrait_url.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
      card_url: form.card_url.trim() || null,
      portrait_video_url: form.portrait_video_url.trim() || null,
      avatar_video_url: form.avatar_video_url.trim() || null,
      voice: form.voice.trim() || null,
      appearance_hair: form.appearance_hair.trim() || null,
      appearance_hair_color: form.appearance_hair_color.trim() || null,
      appearance_eyes: form.appearance_eyes.trim() || null,
      appearance_body: form.appearance_body.trim() || null,
      appearance_style: form.appearance_style.trim() || null,
      appearance_race: form.appearance_race.trim() || null,
      image_prompt: form.image_prompt.trim() || null,
      negative_prompt: form.negative_prompt.trim() || null,
      is_public: form.is_public,
      review_status: form.review_status,
      rarity: form.rarity,
      access_status: form.access_status,
      unlock_price_tokens: Number(form.unlock_price_tokens) || 0,
      base_intimacy: Number(form.base_intimacy) || 0,
      base_desire: Number(form.base_desire) || 0,
      base_development: Number(form.base_development) || 0,
      base_kink: Number(form.base_kink) || 0,
      is_hot: form.is_hot,
      is_featured: form.is_featured,
      hot_score: Number(form.hot_score) || 0,
      sort_order: Number(form.sort_order) || 0,
    };
    return payload;
  };

  const handleRandomizeAll = async () => {
    setRandomizeConfirmOpen(false);
    setRandomizing(true);
    try {
      const res = await authedFetch('/api/admin/girlfriends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'randomize_traits' }),
      });
      const data = await readResponseJson<{
        error?: string;
        updated?: number;
        total?: number;
        errors?: string[];
        message?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || '随机分配失败');
      if ((data.errors?.length ?? 0) > 0) {
        toast.warning(`已更新 ${data.updated ?? 0}/${data.total ?? 0} 位，部分记录失败`);
      } else {
        toast.success(data.message || `已更新 ${data.updated ?? 0} 位女友`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '随机分配失败');
    } finally {
      setRandomizing(false);
    }
  };

  const randomizeCurrentForm = () => {
    const rnd = randomizeGirlfriendTraits();
    setForm((f) => ({
      ...f,
      age: rnd.age,
      occupation: rnd.occupation || f.occupation,
      hobbies: rnd.hobbies || f.hobbies,
      base_intimacy: rnd.base_intimacy,
      base_desire: rnd.base_desire,
      base_development: rnd.base_development,
      base_kink: rnd.base_kink,
    }));
    toast.message('已为本卡随机生成基础参数（保存后生效）');
  };

  const handleBatchCreate = async () => {
    setBatchLoading(true);
    try {
      let res: Response;
      if (batchMode === 'llm') {
        // LLM-powered batch create
        res = await authedFetch('/api/admin/girlfriends', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batch: true,
            count: batchCount,
            gender: batchGender === 'random' ? 'Female' : batchGender,
          }),
        });
      } else {
        // Random data pool batch create
        res = await authedFetch('/api/v2/admin/girlfriends/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            count: batchCount,
            gender: batchGender,
          }),
        });
      }
      const data = await readResponseJson<{ error?: string; count?: number; success?: boolean }>(res);
      if (!res.ok) throw new Error(data.error || '批量新建失败');
      toast.success(`成功批量新建 ${data.count || batchCount} 个角色`);
      setBatchOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '批量新建失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('请填写名字');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (selected?.id) {
        const res = await authedFetch('/api/admin/girlfriends', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selected.id, ...payload }),
        });
        const data = await readResponseJson<{ error?: string; girlfriend?: Girlfriend; skipped_fields?: string[] }>(res);
        if (!res.ok) throw new Error(data.error || '保存失败');
        if (data.skipped_fields?.length) {
          toast.warning(`主体资料已保存；当前数据库缺少字段：${data.skipped_fields.join('、')}`);
        } else {
          toast.success('已保存，前端展示已同步');
        }
        if (data.girlfriend) {
          setSelected(data.girlfriend);
          setForm(toForm(data.girlfriend));
        }
      } else {
        const res = await authedFetch('/api/admin/girlfriends', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await readResponseJson<{ error?: string; girlfriend?: Girlfriend }>(res);
        if (!res.ok) throw new Error(data.error || '创建失败');
        toast.success('已创建');
        closeDialog();
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected?.id) return;
    if (!window.confirm(`确定删除「${selected.name}」？此操作不可恢复。`)) return;
    setDeleting(true);
    try {
      const res = await authedFetch(`/api/admin/girlfriends?id=${selected.id}`, { method: 'DELETE' });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || '删除失败');
      toast.success('已删除');
      closeDialog();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const quickToggle = async (g: Girlfriend, field: 'is_featured' | 'is_hot', value: boolean) => {
    try {
      const body: Record<string, unknown> = { id: g.id, [field]: value };
      if (field === 'is_hot' && value && !Number(g.hot_score || 0)) body.hot_score = 50;
      const res = await authedFetch('/api/admin/girlfriends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readResponseJson<{ error?: string; girlfriend?: Girlfriend }>(res);
      if (!res.ok) throw new Error(data.error || '更新失败');
      toast.success(field === 'is_featured' ? (value ? '已设为推荐' : '已取消推荐') : value ? '已设为热门' : '已取消热门');
      setItems((list) =>
        list.map((x) =>
          x.id === g.id
            ? {
                ...x,
                ...body,
                ...(data.girlfriend || {}),
              }
            : x,
        ),
      );
      if (selected?.id === g.id) {
        const next = { ...g, ...body, ...(data.girlfriend || {}) } as Girlfriend;
        setSelected(next);
        setForm(toForm(next));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    }
  };

  const uploadImageField = async (
    field: 'portrait_url' | 'avatar_url' | 'card_url',
    file?: File,
  ) => {
    if (!file || !selected) return;
    const key =
      field === 'portrait_url' ? 'portrait' : field === 'avatar_url' ? 'avatar' : 'card';
    setImageUploading(key);
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error('图片请小于 12MB');
      if (!/^image\//.test(file.type)) throw new Error('请上传图片文件（png/jpg/webp）');
      let url = '';

      // 1) Prefer girlfriend-scoped asset library (comfy / generation_assets)
      try {
        const fd = new FormData();
        fd.append('action', 'upload_assets');
        fd.append('kind', 'girlfriend');
        fd.append('girlfriend_id', selected.id);
        fd.append('files', file);
        const res = await authedFetch('/api/admin/comfy', { method: 'POST', body: fd });
        const data = await readResponseJson<{
          assets?: Array<{ url?: string; storage_key?: string }>;
          error?: string;
        }>(res);
        if (res.ok) {
          url = String(data.assets?.[0]?.url || '').trim();
        } else {
          logger.warn('comfy upload rejected', { error: data.error });
        }
      } catch (err) {
        logger.warn('comfy upload fallback', { err: err instanceof Error ? err.message : String(err) });
      }

      // 2) Generic upload API (storage) so media still binds if comfy path fails
      if (!url) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', `girlfriends/${selected.id}`);
        const res = await authedFetch('/api/upload', { method: 'POST', body: fd });
        const data = await readResponseJson<{ url?: string; key?: string; error?: string }>(res);
        if (!res.ok || !data.url) {
          throw new Error(data.error || '图片上传失败');
        }
        url = data.url;
      }

      // 3) Persist URL onto girlfriend row (also revalidates public surfaces)
      const res = await authedFetch('/api/admin/girlfriends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, [field]: url }),
      });
      const data = await readResponseJson<{
        error?: string;
        girlfriend?: Girlfriend;
        skipped_fields?: string[];
      }>(res);
      if (!res.ok) throw new Error(data.error || '绑定图片失败');
      if (data.skipped_fields?.includes(field)) {
        throw new Error(`数据库缺少字段 ${field}，图片未写入`);
      }

      const next = data.girlfriend || ({ ...selected, [field]: url } as Girlfriend);
      setForm((f) => ({ ...f, [field]: String(next[field] || url) }));
      setSelected(next);
      setItems((list) => list.map((x) => (x.id === selected.id ? { ...x, ...next, [field]: url } : x)));
      toast.success('图片已保存并同步到前端');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '图片上传失败');
    } finally {
      setImageUploading(null);
    }
  };

  const handleVideoFile = async (field: VideoField, file?: File) => {
    if (!file || !selected) return;
    setVideoUploading(field);
    try {
      const result = await uploadGirlfriendVideo({
        file,
        field,
        girlfriendId: selected.id,
      });
      const res = await authedFetch('/api/admin/girlfriends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, [field]: result.url }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || '绑定视频失败');
      setForm((f) => ({ ...f, [field]: result.url }));
      setSelected((s) => (s ? { ...s, [field]: result.url } : s));
      setItems((list) => list.map((x) => (x.id === selected.id ? { ...x, [field]: result.url } : x)));
      toast.success(field === 'portrait_video_url' ? '肖像视频已绑' : '头像视频已绑');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '视频上传失败');
    } finally {
      setVideoUploading(null);
    }
  };

  const handleAudioFile = async (file?: File) => {
    if (!file || !selected) return;
    setAudioUploading(true);
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('音频请小于 8MB');
      let url = '';
      try {
        const fd = new FormData();
        fd.append('action', 'upload_assets');
        fd.append('kind', 'audio');
        fd.append('girlfriend_id', selected.id);
        fd.append('files', file);
        const res = await authedFetch('/api/admin/comfy', { method: 'POST', body: fd });
        const data = await readResponseJson<{ assets?: Array<{ url?: string }> }>(res);
        if (res.ok && data.assets?.[0]?.url) url = data.assets[0].url;
      } catch {
        /* ignore */
      }
      if (!url) {
        const dataUrl = await fileToDataUrl(file);
        if (dataUrl.length > 2_000_000) throw new Error('音频过大，请换更小文件');
        url = dataUrl;
      }
      const patchRes = await authedFetch('/api/admin/girlfriends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, voice: url }),
      });
      if (!patchRes.ok) {
        const err = await readResponseJson<{ error?: string }>(patchRes);
        throw new Error(err.error || '绑定音频失败');
      }
      setForm((f) => ({ ...f, voice: url }));
      setSelected((s) => (s ? { ...s, voice: url } : s));
      toast.success('音频已绑定');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '音频上传失败');
    } finally {
      setAudioUploading(false);
    }
  };

  const dialogOpen = creating || Boolean(selected);

  useEffect(() => {
    if (!dialogOpen || !selected?.id) {
      setGirlfriendAssets([]);
      return;
    }
    let cancelled = false;
    setGirlfriendAssetsLoading(true);
    void authedFetch(`/api/admin/comfy?view=assets&girlfriend_id=${encodeURIComponent(selected.id)}&limit=80`)
      .then((response) => readResponseJson<{ assets?: Array<{ id?: string; url?: string; preview_url?: string; storage_key?: string }> }>(response))
      .then((data) => { if (!cancelled) setGirlfriendAssets(data.assets || []); })
      .catch(() => { if (!cancelled) setGirlfriendAssets([]); })
      .finally(() => { if (!cancelled) setGirlfriendAssetsLoading(false); });
    return () => { cancelled = true; };
  }, [dialogOpen, selected?.id]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="min-h-screen bg-[#0b0b12] text-slate-100">
      <div className="border-b border-white/10 bg-gradient-to-r from-rose-950/50 via-slate-950 to-violet-950/40 px-4 py-5 md:px-6">
        <div className="mx-auto max-w-[1920px]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-300/80">站内 CMS</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">女友与媒体</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">
                管理女友基础档案（年龄/亲密/职业/爱好/热情·开发·变态）与媒体。参数同步到前台卡片与对话人设。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-white/15 bg-white/5" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} /> 刷新
              </Button>
              <Button
                variant="outline"
                className="border-amber-400/40 bg-amber-500/10 text-amber-100"
                onClick={() => setRandomizeConfirmOpen(true)}
                disabled={randomizing}
              >
                {randomizing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                随机分配全部数值
              </Button>
              <Button className="bg-rose-600 hover:bg-rose-500" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> 新建女友
              </Button>
              <Button variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-100" onClick={() => setBatchOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> 批量新建
              </Button>
              <Link href="/admin/studio">
                <Button variant="outline" className="border-violet-400/40 bg-violet-500/10 text-violet-100">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> 公共创作台
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <Input
                value={q}
                onChange={(e) => { setPage(1); setQ(e.target.value); }}
                placeholder="搜索名字 / slug"
                className="h-9 border-white/10 bg-black/30 pl-8 text-sm"
              />
            </div>
            <Select value={status} onValueChange={(v) => { setPage(1); setStatus(v); }}>
              <SelectTrigger className="h-9 w-[130px] border-white/10 bg-black/30"><SelectValue placeholder="状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="approved">已通过</SelectItem>
                <SelectItem value="pending">待审</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
                <SelectItem value="rejected">驳回</SelectItem>
              </SelectContent>
            </Select>
            <Select value={rarity} onValueChange={setRarity}>
              <SelectTrigger className="h-9 w-[110px] border-white/10 bg-black/30"><SelectValue placeholder="稀有" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部稀有</SelectItem>
                {(['N', 'R', 'SR', 'SSR'] as const).map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={media} onValueChange={(v) => setMedia(v as MediaFilter)}>
              <SelectTrigger className="h-9 w-[140px] border-white/10 bg-black/30"><SelectValue placeholder="媒体" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部媒体</SelectItem>
                <SelectItem value="has_image">有图片</SelectItem>
                <SelectItem value="no_image">无图片</SelectItem>
                <SelectItem value="has_video">有视频</SelectItem>
                <SelectItem value="no_video">无视频</SelectItem>
                <SelectItem value="has_audio">有音频</SelectItem>
                <SelectItem value="no_audio">无音频</SelectItem>
              </SelectContent>
            </Select>
            <Select value={place} onValueChange={(v) => setPlace(v as PlaceFilter)}>
              <SelectTrigger className="h-9 w-[120px] border-white/10 bg-black/30"><SelectValue placeholder="运营" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部运营</SelectItem>
                <SelectItem value="featured">推荐</SelectItem>
                <SelectItem value="hot">热门</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="mt-2 text-xs text-slate-500">共 {total} 条 · 本页筛选后 {filtered.length} 张</p>
        </div>
      </div>

      <div className="mx-auto max-w-[1920px] px-3 py-4 md:px-5">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center text-sm text-slate-500">
            没有匹配的女友。可新建，或清空筛选。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filtered.map((g) => {
              const cover = coverOf(g);
              return (
                <div
                  key={g.id}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition hover:border-rose-400/40 hover:bg-rose-500/5"
                >
                  <button type="button" onClick={() => openEdit(g)} className="block w-full text-left">
                    <div className="relative aspect-[3/4] bg-black/40">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt={g.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-600">
                          <ImageOff className="h-6 w-6" />
                          <span className="text-[10px]">无图</span>
                        </div>
                      )}
                      <div className="absolute left-1 top-1 flex flex-wrap gap-0.5">
                        {g.is_featured ? (
                          <span className="rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-semibold text-black">推荐</span>
                        ) : null}
                        {g.is_hot || Number(g.hot_score || 0) > 0 ? (
                          <span className="rounded bg-orange-500/90 px-1 py-0.5 text-[9px] font-semibold text-white">热门</span>
                        ) : null}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-6">
                        <p className="truncate text-xs font-semibold text-white">{g.name}</p>
                        <p className="truncate text-[10px] text-slate-300">
                          {g.age || '—'}岁 · {g.occupation || '—'} · {String(g.rarity || 'R').toUpperCase()}
                        </p>
                        <p className="truncate text-[9px] text-rose-200/80">
                          热{Number(g.base_desire || 0)} · 开{Number(g.base_development || 0)} · 变
                          {Number(g.base_kink || 0)}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center justify-between gap-1 border-t border-white/5 px-1 py-1">
                    <div className="flex gap-0.5 text-slate-500">
                      {hasImage(g) ? <span title="有图" className="text-[10px] text-emerald-400">图</span> : <span className="text-[10px]">图</span>}
                      {hasVideo(g) ? <Film className="h-3 w-3 text-sky-400" /> : <Film className="h-3 w-3 opacity-30" />}
                      {hasAudio(g) ? <Mic2 className="h-3 w-3 text-violet-400" /> : <Mic2 className="h-3 w-3 opacity-30" />}
                    </div>
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        title="推荐"
                        onClick={(e) => { e.stopPropagation(); void quickToggle(g, 'is_featured', !g.is_featured); }}
                        className={cn('rounded p-0.5', g.is_featured ? 'text-amber-400' : 'text-slate-500 hover:text-amber-300')}
                      >
                        <Star className="h-3.5 w-3.5" fill={g.is_featured ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        title="热门"
                        onClick={(e) => { e.stopPropagation(); void quickToggle(g, 'is_hot', !g.is_hot); }}
                        className={cn('rounded p-0.5', g.is_hot ? 'text-orange-400' : 'text-slate-500 hover:text-orange-300')}
                      >
                        <Flame className="h-3.5 w-3.5" />
                      </button>
                      <Link
                        href={`/admin/studio?girlfriendId=${g.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title="创作"
                        className="rounded p-0.5 text-violet-400 hover:bg-violet-500/20"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
            <span className="text-xs text-slate-400">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>下一页</Button>
          </div>
        ) : null}
      </div>
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent
          className="h-[92vh] w-[94vw] max-w-[94vw] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-white/10 bg-[#12121c] text-slate-100 sm:max-w-[94vw] xl:max-w-[1920px]"
        >
          <DialogHeader>
            <DialogTitle>{creating ? '新建女友' : `编辑 · ${selected?.name || ''}`}</DialogTitle>
            <DialogDescription className="text-slate-400">
              参数会同步到前台卡片。媒体上传后直接绑定本卡；创作请进工作台（按女友隔离资产）。
              <span className="ml-2 hidden text-violet-300 md:inline">横屏双栏显示，左右信息可同时编辑。</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-5 overflow-y-auto pr-1 md:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-rose-200/90">基础档案（同步对话人设）</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-white/15 text-[11px]"
                  onClick={randomizeCurrentForm}
                >
                  <Sparkles className="mr-1 h-3 w-3" /> 随机本卡数值
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>名字</Label>
                  <Input value={form.name} onChange={(e) => setField('name', e.target.value)} className="mt-1 bg-black/30" />
                </div>
                <div>
                  <Label>年龄 (≥18)</Label>
                  <Input type="number" min={18} max={99} value={form.age} onChange={(e) => setField('age', Number(e.target.value) || 18)} className="mt-1 bg-black/30" />
                </div>
              <div>
                <Label>性别</Label>
                <Select value={form.gender} onValueChange={(value) => setField('gender', value as FormState['gender'])}>
                  <SelectTrigger className="mt-1 bg-black/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Female">女性</SelectItem>
                    <SelectItem value="Male">男性</SelectItem>
                    <SelectItem value="Transgender">跨性别</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={form.slug} onChange={(e) => setField('slug', e.target.value)} className="mt-1 bg-black/30" placeholder="url-name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>职业</Label>
                  <Input
                    value={form.occupation}
                    onChange={(e) => setField('occupation', e.target.value)}
                    className="mt-1 bg-black/30"
                    placeholder="Nurse / Student / Model…"
                  />
                </div>
                <div>
                  <Label>兴趣爱好</Label>
                  <Input
                    value={form.hobbies}
                    onChange={(e) => setField('hobbies', e.target.value)}
                    className="mt-1 bg-black/30"
                    placeholder="yoga, coffee, gaming…"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-rose-400/20 bg-rose-950/20 p-3 space-y-3">
                <p className="text-[11px] font-semibold text-rose-100">性格参数（影响对话风格）</p>
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <Label className="text-[11px]">亲密值 base_intimacy</Label>
                    <span className="tabular-nums text-rose-200">{form.base_intimacy}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form.base_intimacy}
                    onChange={(e) => setField('base_intimacy', Number(e.target.value))}
                    className="mt-1 w-full accent-rose-500"
                  />
                  <p className="text-[10px] text-slate-500">起始亲近感 0–100，对话里与动态亲密度一起决定称呼/距离。</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <Label className="text-[11px]">热情值 · {traitLabelFor('desire', form.base_desire)}</Label>
                    <span className="tabular-nums text-orange-200">{form.base_desire}</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={form.base_desire}
                    onChange={(e) => setField('base_desire', Number(e.target.value))}
                    className="mt-1 w-full accent-orange-500"
                  />
                  <p className="text-[10px] text-slate-500">50–70 高冷 · 70–85 热情 · 85–100 奔放</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <Label className="text-[11px]">开发值 · {traitLabelFor('development', form.base_development)}</Label>
                    <span className="tabular-nums text-fuchsia-200">{form.base_development}</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={form.base_development}
                    onChange={(e) => setField('base_development', Number(e.target.value))}
                    className="mt-1 w-full accent-fuchsia-500"
                  />
                  <p className="text-[10px] text-slate-500">50–70 撒娇 · 70–85 主动 NSFW · 85–100 直白勾引</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <Label className="text-[11px]">变态值 · {traitLabelFor('kink', form.base_kink)}</Label>
                    <span className="tabular-nums text-violet-200">{form.base_kink}</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={form.base_kink}
                    onChange={(e) => setField('base_kink', Number(e.target.value))}
                    className="mt-1 w-full accent-violet-500"
                  />
                  <p className="text-[10px] text-slate-500">50–70 正常 · 70–85 喜欢刺激 · 85–100 变态玩法</p>
                </div>
              </div>
              <div>
                <Label>性格 / 人设</Label>
                <Textarea value={form.personality} onChange={(e) => setField('personality', e.target.value)} className="mt-1 min-h-[72px] bg-black/30" />
              </div>
              <div>
                <Label>简介</Label>
                <Textarea value={form.short_description} onChange={(e) => setField('short_description', e.target.value)} className="mt-1 min-h-[60px] bg-black/30" />
              </div>
              <div>
                <Label>背景故事</Label>
                <Textarea value={form.backstory} onChange={(e) => setField('backstory', e.target.value)} className="mt-1 min-h-[72px] bg-black/30" />
              </div>
              <div>
                <Label>标签（逗号分隔）</Label>
                <Input value={form.tags} onChange={(e) => setField('tags', e.target.value)} className="mt-1 bg-black/30" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>发色</Label>
                  <Input value={form.appearance_hair_color} onChange={(e) => setField('appearance_hair_color', e.target.value)} className="mt-1 bg-black/30" />
                </div>
                <div>
                  <Label>发型</Label>
                  <Input value={form.appearance_hair} onChange={(e) => setField('appearance_hair', e.target.value)} className="mt-1 bg-black/30" />
                </div>
                <div>
                  <Label>眼睛</Label>
                  <Input value={form.appearance_eyes} onChange={(e) => setField('appearance_eyes', e.target.value)} className="mt-1 bg-black/30" />
                </div>
                <div>
                  <Label>身材</Label>
                  <Input value={form.appearance_body} onChange={(e) => setField('appearance_body', e.target.value)} className="mt-1 bg-black/30" />
                </div>
                <div>
                  <Label>风格</Label>
                  <Input value={form.appearance_style} onChange={(e) => setField('appearance_style', e.target.value)} className="mt-1 bg-black/30" />
                </div>
                <div>
                  <Label>种族/气质</Label>
                  <Input value={form.appearance_race} onChange={(e) => setField('appearance_race', e.target.value)} className="mt-1 bg-black/30" />
                </div>
              </div>
              <div>
                <Label>生图提示词（角色专属）</Label>
                <Textarea value={form.image_prompt} onChange={(e) => setField('image_prompt', e.target.value)} className="mt-1 min-h-[64px] bg-black/30 font-mono text-xs" />
              </div>
              <div>
                <Label>反向提示词</Label>
                <Textarea value={form.negative_prompt} onChange={(e) => setField('negative_prompt', e.target.value)} className="mt-1 min-h-[48px] bg-black/30 font-mono text-xs" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-300">运营位（原推荐/热门页已合并）</p>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.is_featured} onCheckedChange={(v) => setField('is_featured', v)} />
                    <Star className="h-3.5 w-3.5 text-amber-400" /> 推荐
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.is_hot} onCheckedChange={(v) => setField('is_hot', v)} />
                    <Flame className="h-3.5 w-3.5 text-orange-400" /> 热门
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.is_public} onCheckedChange={(v) => setField('is_public', v)} />
                    公开
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">热门分</Label>
                    <Input type="number" value={form.hot_score} onChange={(e) => setField('hot_score', Number(e.target.value) || 0)} className="mt-1 h-8 bg-black/30" />
                  </div>
                  <div>
                    <Label className="text-xs">排序</Label>
                    <Input type="number" value={form.sort_order} onChange={(e) => setField('sort_order', Number(e.target.value) || 0)} className="mt-1 h-8 bg-black/30" />
                  </div>
                  <div>
                    <Label className="text-xs">稀有</Label>
                    <Select value={form.rarity} onValueChange={(v) => setField('rarity', v as RarityTier)}>
                      <SelectTrigger className="mt-1 h-8 bg-black/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(['N', 'R', 'SR', 'SSR'] as const).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">访问</Label>
                    <Select value={form.access_status} onValueChange={(v) => setField('access_status', v as AccessStatus)}>
                      <SelectTrigger className="mt-1 h-8 bg-black/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">开放</SelectItem>
                        <SelectItem value="locked">锁定</SelectItem>
                        <SelectItem value="closed">关闭</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">审核状态</Label>
                    <Select value={form.review_status} onValueChange={(v) => setField('review_status', v)}>
                      <SelectTrigger className="mt-1 h-8 bg-black/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approved">approved</SelectItem>
                        <SelectItem value="pending">pending</SelectItem>
                        <SelectItem value="draft">draft</SelectItem>
                        <SelectItem value="rejected">rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">解锁代币</Label>
                    <Input type="number" value={form.unlock_price_tokens} onChange={(e) => setField('unlock_price_tokens', Number(e.target.value) || 0)} className="mt-1 h-8 bg-black/30" />
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-slate-500">
                  热情/开发/变态请在左侧「基础档案」滑动条调节；保存后同步前台与对话。
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-300">媒体绑定（本卡专用）</p>
                {selected ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-violet-400/30 bg-violet-950/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-semibold text-violet-100">优先从 {selected.name} 的独立资源库选择</p>
                          <p className="text-[10px] text-slate-300">已有 {girlfriendAssets.length} 项；未找到时再进入公共库或本地上传。</p>
                        </div>
                        <Link href="/admin/assets" target="_blank" className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-100 hover:bg-white/10">打开公共资产库</Link>
                      </div>
                      {assetPickerField ? (
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-200">
                            <span>选择图片绑定到 {assetPickerField === 'portrait_url' ? '肖像' : assetPickerField === 'avatar_url' ? '头像' : '卡片'}</span>
                            <button type="button" onClick={() => setAssetPickerField(null)} className="text-slate-300 hover:text-white">关闭</button>
                          </div>
                          {girlfriendAssetsLoading ? (
                            <div className="flex items-center gap-1 py-3 text-[10px] text-slate-300"><Loader2 className="h-3 w-3 animate-spin" /> 加载女友资源库…</div>
                          ) : girlfriendAssets.length ? (
                            <div className="grid max-h-40 grid-cols-5 gap-1.5 overflow-y-auto pr-1">
                              {girlfriendAssets.map((asset, index) => {
                                const url = asset.preview_url || asset.url || '';
                                if (!url) return null;
                                return <button key={asset.id || asset.storage_key || index} type="button" className="aspect-[3/4] overflow-hidden rounded border border-white/15 hover:border-violet-300" onClick={() => { setField(assetPickerField, url); setAssetPickerField(null); toast.success('已从女友资源库选中'); }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="女友资源" className="h-full w-full object-cover" />
                                </button>;
                              })}
                            </div>
                          ) : <p className="py-3 text-[10px] text-slate-400">该女友资源库暂无图片，请使用本地上传或前往创作工作台生成。</p>}
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ['portrait_url', '肖像', 'portrait'] as const,
                        ['avatar_url', '头像', 'avatar'] as const,
                        ['card_url', '卡片', 'card'] as const,
                      ]).map(([field, label, key]) => (
                        <div key={field} className="rounded-lg border border-white/10 p-1.5">
                          <p className="mb-1 text-[10px] text-slate-400">{label}</p>
                          <div className="mb-1 aspect-[3/4] overflow-hidden rounded bg-black/40">
                            {form[field] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={form[field]} alt={label} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-slate-600"><ImageOff className="h-4 w-4" /></div>
                            )}
                          </div>
                          <button type="button" onClick={() => setAssetPickerField(field)} className="mb-1 flex w-full items-center justify-center rounded bg-violet-500/20 py-1 text-[10px] font-medium text-violet-100 hover:bg-violet-500/35">
                            从女友库选择
                          </button>
                          <label className="flex cursor-pointer items-center justify-center gap-1 rounded bg-white/5 py-1 text-[10px] hover:bg-white/10">
                            {imageUploading === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                            本地上传
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => void uploadImageField(field, e.target.files?.[0])}
                            />
                          </label>
                          <Input
                            value={form[field]}
                            onChange={(e) => setField(field, e.target.value)}
                            className="mt-1 h-7 bg-black/30 text-[10px]"
                            placeholder="或粘贴 URL"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['portrait_video_url', '肖像视频'] as const,
                        ['avatar_video_url', '头像视频'] as const,
                      ]).map(([field, label]) => (
                        <div key={field} className="rounded-lg border border-white/10 p-2">
                          <p className="text-[10px] text-slate-400">{label}</p>
                          {form[field] ? (
                            <video src={form[field]} className="mt-1 max-h-24 w-full rounded object-cover" controls muted playsInline />
                          ) : null}
                          <label className="mt-1 flex cursor-pointer items-center justify-center gap-1 rounded bg-white/5 py-1 text-[10px] hover:bg-white/10">
                            {videoUploading === field ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />}
                            上传视频
                            <input
                              type="file"
                              accept="video/*"
                              className="hidden"
                              onChange={(e) => void handleVideoFile(field, e.target.files?.[0])}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-white/10 p-2">
                      <p className="text-[10px] text-slate-400">音频 / 语音</p>
                      {form.voice ? (
                        <audio controls src={form.voice} className="mt-1 w-full" />
                      ) : (
                        <p className="mt-1 text-[10px] text-slate-600">未绑定</p>
                      )}
                      <label className="mt-1 flex cursor-pointer items-center justify-center gap-1 rounded bg-white/5 py-1 text-[10px] hover:bg-white/10">
                        {audioUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic2 className="h-3 w-3" />}
                        上传音频
                        <input type="file" accept="audio/*" className="hidden" onChange={(e) => void handleAudioFile(e.target.files?.[0])} />
                      </label>
                    </div>
                    <Link
                      href={`/admin/studio?girlfriendId=${selected.id}`}
                      className="flex items-center justify-center gap-2 rounded-lg bg-violet-600/90 py-2 text-sm font-medium text-white hover:bg-violet-500"
                    >
                      <Sparkles className="h-4 w-4" /> 为该女友创作（资产进独立库）
                    </Link>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">先保存创建后可上传媒体与进入创作台。</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {selected ? (
                <Button variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={deleting || saving}>
                  {deleting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
                  删除女友
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeDialog}>取消</Button>
              <Button className="bg-rose-600 hover:bg-rose-500" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Heart className="mr-1 h-3.5 w-3.5" />}
                保存
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={randomizeConfirmOpen} onOpenChange={setRandomizeConfirmOpen}>
        <DialogContent className="border-amber-400/30 bg-slate-950 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>随机分配全部数值？</DialogTitle>
            <DialogDescription className="text-slate-300">
              将重新生成全部 {total} 位女友的年龄、亲密值、职业、兴趣爱好、热情值、开发值和变态值。此操作会直接保存。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRandomizeConfirmOpen(false)}>取消</Button>
            <Button
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
              onClick={() => void handleRandomizeAll()}
              disabled={randomizing}
            >
              {randomizing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              确认随机分配
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Create Dialog */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="border-emerald-400/30 bg-slate-950 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批量新建角色</DialogTitle>
            <DialogDescription className="text-slate-300">
              使用随机数据或 AI 批量生成角色档案，支持指定性别。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>生成模式</Label>
              <Select value={batchMode} onValueChange={(v) => setBatchMode(v as 'random' | 'llm')}>
                <SelectTrigger className="border-white/10 bg-black/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">随机数据池（快速）</SelectItem>
                  <SelectItem value="llm">AI 生成（更丰富）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>性别</Label>
              <Select value={batchGender} onValueChange={(v) => setBatchGender(v as typeof batchGender)}>
                <SelectTrigger className="border-white/10 bg-black/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">随机（混合性别）</SelectItem>
                  <SelectItem value="Female">女性</SelectItem>
                  <SelectItem value="Male">男性</SelectItem>
                  <SelectItem value="Transgender">跨性别</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>数量（1-10）</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={batchCount}
                onChange={(e) => setBatchCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                className="border-white/10 bg-black/30"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBatchOpen(false)}>取消</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-500"
              onClick={() => void handleBatchCreate()}
              disabled={batchLoading}
            >
              {batchLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              开始生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminGirlfriendsMediaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center bg-[#0b0b12] text-slate-400">
          加载女友与媒体…
        </div>
      }
    >
      <AdminGirlfriendsMediaPageInner />
    </Suspense>
  );
}
