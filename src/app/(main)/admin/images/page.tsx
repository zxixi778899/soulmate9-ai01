import { readResponseJson, errorMessageFromUnknown } from '@/lib/safe-json';
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Loader2, Plus, Trash2, RefreshCw, Sparkles, Check, X, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, SlidersHorizontal, ImageIcon, User, Shirt, Package,
  Upload, Search, Wand2, Save, Eraser, LayoutGrid, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { assembleFromItem } from '@/lib/prompt';
import { GIRLFRIEND_NEGATIVE_FLUX } from '@/lib/prompt/girlfriend';
import { OUTFIT_NEGATIVE } from '@/lib/prompt/outfit';
import { SHOP_ITEM_NEGATIVE } from '@/lib/prompt/shop_item';
import {
  FLUX_PARAM_PRESETS,
  FLUX_DEFAULT_GEN_PARAMS,
  type FluxParamPreset,
} from '@/lib/prompt/flux-presets';
import {
  safeDisplayName,
  looksLikeFluxPrompt,
  extractPersonName,
} from '@/lib/prompt/shared';

// ── Types ──────────────────────────────────────────────────────────────────

type ItemCategory = 'girlfriend' | 'outfit' | 'shop_item';

interface ImageItem {
  id: string;
  name: string;
  imageUrl: string | null;
  hasImage: boolean;
  itemCategory: ItemCategory;
  field: string;
  category?: string | null;
  tier?: string | null;
  slug?: string | null;
  personality?: string;
  appearance?: string;
  appearance_race?: string | null;
  appearance_hair?: string | null;
  appearance_hair_color?: string | null;
  appearance_eyes?: string | null;
  appearance_body?: string | null;
  appearance_style?: string | null;
  character_card?: Record<string, unknown> | null;
  tags?: string[] | string;
  description?: string;
  item_type?: string | null;
  intimacy_boost?: number | null;
  image_prompt?: string | null;
  backstory?: string | null;
  short_description?: string | null;
  created_at?: string | null;
}

interface PromptPreset {
  id: string;
  label: string;
  positivePrompt: string;
  negativePrompt: string;
}

interface GenState {
  positivePrompt: string;
  negativePrompt: string;
  activePreset: string | null;
  generatedMeta: {
    title?: string;
    description?: string;
    tags?: string[];
    appearance?: string;
  } | null;
  editTitle: string;
  editDescription: string;
  editTags: string;
  editAppearance: string;
  generatedImages: {
    /** Permanent URL for DB / confirm */
    url: string;
    /** Immediate preview (data: or public https) — never the prompt text */
    previewUrl?: string;
    key?: string;
    proxyUrl?: string;
    alt: string;
  }[];
  selectedImages: Set<number>;
  genProgress: string;
  genParams: {
    steps: number;
    cfg: number;
    seed: number;
    width: number;
    height: number;
    sampler: string;
    scheduler: string;
    /** img2img denoise when useConsistency is on (0.3–0.85) */
    denoise: number;
  };
  /** Active FLUX param pack id */
  activeParamPreset: string | null;
  metaGenerating: boolean;
  generating: boolean;
  useConsistency: boolean;
}

interface Stats {
  totalGirlfriends: number;
  withPortrait: number;
  totalOutfits: number;
  withPreview: number;
  totalShopItems: number;
  shopItemsWithImage: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'progress';
}

/** FLUX: empty negative preferred for portraits (long SD negatives → black frames) */
const DEFAULT_NEGATIVE = '';

const DEFAULT_GEN_STATE: GenState = {
  positivePrompt: '',
  negativePrompt: DEFAULT_NEGATIVE,
  activePreset: null,
  generatedMeta: null,
  editTitle: '',
  editDescription: '',
  editTags: '',
  editAppearance: '',
  generatedImages: [],
  selectedImages: new Set(),
  genProgress: '',
  genParams: {
    steps: FLUX_DEFAULT_GEN_PARAMS.steps,
    cfg: FLUX_DEFAULT_GEN_PARAMS.cfg,
    seed: FLUX_DEFAULT_GEN_PARAMS.seed,
    width: FLUX_DEFAULT_GEN_PARAMS.width,
    height: FLUX_DEFAULT_GEN_PARAMS.height,
    sampler: FLUX_DEFAULT_GEN_PARAMS.sampler,
    scheduler: FLUX_DEFAULT_GEN_PARAMS.scheduler,
    denoise: FLUX_DEFAULT_GEN_PARAMS.denoise,
  },
  activeParamPreset: 'flux_portrait',
  metaGenerating: false,
  generating: false,
  useConsistency: true,
};

const TAB_META: Record<
  ItemCategory,
  { label: string; icon: typeof User; empty: string }
> = {
  girlfriend: { label: '女友', icon: User, empty: '暂无女友' },
  outfit: { label: '道具/服装', icon: Shirt, empty: '暂无道具' },
  shop_item: { label: '商城', icon: Package, empty: '暂无商城商品' },
};

// ── Display / safety helpers ───────────────────────────────────────────────

/** Never show a full FLUX caption in the UI/logs (hard rules, not just heuristics) */
function itemLabel(
  item: { name?: string | null; id?: string; slug?: string | null; image_prompt?: string | null } | null | undefined,
): string {
  if (!item) return '未命名';
  const fallback = item.slug
    ? String(item.slug).replace(/[-_]/g, ' ').slice(0, 32)
    : item.id
      ? `条目 ${String(item.id).slice(0, 8)}`
      : '未命名';
  const n = String(item.name || '').trim();
  if (!n) return fallback;
  // Hard reject captions (length, quality tokens, comma spam)
  const isCaption =
    n.length > 40 ||
    /raw\s*photo|masterpiece|photorealistic|best quality|sharp focus|8k|natural skin|three-quarter|ultra photoreal/i.test(
      n,
    ) ||
    (n.match(/,/g) || []).length >= 2;
  if (isCaption) {
    const fromName = extractPersonName(n);
    if (fromName && fromName.length <= 40) return fromName;
    const fromPrompt = extractPersonName(String(item.image_prompt || ''));
    if (fromPrompt && fromPrompt.length <= 40) return fromPrompt;
    return fallback;
  }
  return n.slice(0, 40);
}

/** Short person title only — never a FLUX caption */
function safeTitleForSave(title: string | undefined | null): string | undefined {
  if (!title?.trim()) return undefined;
  const t = title.trim();
  if (looksLikeFluxPrompt(t) || t.length > 48) {
    return extractPersonName(t) || undefined;
  }
  if ((t.match(/,/g) || []).length >= 2) return undefined;
  return t;
}

/** Reject prompt text mistakenly used as image src */
function isPromptLike(s: string): boolean {
  if (!s) return false;
  if (
    s.startsWith('data:image/') ||
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('blob:') ||
    s.startsWith('/api/')
  ) {
    return false;
  }
  return looksLikeFluxPrompt(s);
}

function toPreviewUrl(url: string | null | undefined): string {
  if (!url) return '';
  const u = url.trim();
  // Never use prompt text as image source (was causing "preview shows prompt")
  if (isPromptLike(u)) return '';
  if (
    u.startsWith('http://') ||
    u.startsWith('https://') ||
    u.startsWith('data:') ||
    u.startsWith('blob:') ||
    u.startsWith('/api/')
  ) {
    return u;
  }
  // Bare storage key e.g. girlfriends/xxx.png
  const pub =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_COZE_SUPABASE_URL ||
    '';
  if (!pub) return '';
  const bucket = 'portraits';
  return `${pub.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${u.replace(/^\/+/, '')}`;
}

/** Best display src — public HTTPS only (data: URLs were multi‑MB and broke the UI) */
function displayImageSrc(img: {
  url?: string;
  previewUrl?: string;
  key?: string;
}): string {
  const candidates = [img.url, img.previewUrl, img.key].filter(Boolean) as string[];
  for (const c of candidates) {
    if (isPromptLike(c)) continue;
    if (c.startsWith('https://') || c.startsWith('http://')) return c;
    if (c.startsWith('data:image/')) continue; // ignore huge/broken data URLs
    const pub = toPreviewUrl(c);
    if (pub.startsWith('http')) return pub;
  }
  return '';
}

// ── Auth helpers ───────────────────────────────────────────────────────────

function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return data.access_token || null;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function authedFetch(url: string, options?: RequestInit) {
  const token = getSessionToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      ...(token ? { 'x-session': token } : {}),
      ...(options?.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
  });
}

// ── Auto-fill prompt from entity traits (shared DSL) ───────────────────────

function defaultNegativeFor(type: ItemCategory): string {
  // FLUX portraits: empty negative is safest
  if (type === 'girlfriend') return GIRLFRIEND_NEGATIVE_FLUX;
  if (type === 'outfit') return OUTFIT_NEGATIVE;
  return SHOP_ITEM_NEGATIVE;
}

function buildAutoPrompt(item: ImageItem): string {
  // Rebuild from structured fields only — never re-feed a stacked caption as rawPrompt
  const row: Record<string, unknown> = {
    ...(item as unknown as Record<string, unknown>),
    name: itemLabel(item),
  };
  // Drop polluted caption fields that cause "RAW photo ×3" stacking
  if (looksLikeFluxPrompt(String(row.image_prompt || ''))) {
    row.image_prompt = null;
  }
  if (looksLikeFluxPrompt(String(row.appearance || ''))) {
    row.appearance = null;
  }
  const assembled = assembleFromItem(item.itemCategory, row, '');
  // Final guard: collapse any accidental double quality prefix
  let p = assembled.positive;
  const firstRaw = p.toLowerCase().indexOf('raw photo');
  const secondRaw = p.toLowerCase().indexOf('raw photo', firstRaw + 1);
  if (firstRaw >= 0 && secondRaw > firstRaw) {
    // Keep only from first occurrence through a single quality block
    p = p.slice(0, secondRaw).replace(/,\s*$/, '') + ', ' +
      p
        .slice(secondRaw)
        .replace(
          /^(RAW photo|masterpiece|best quality|ultra photorealistic|8k uhd|highly detailed[^,]*,?\s*)+/gi,
          '',
        );
  }
  return p.replace(/\s*,\s*,+/g, ', ').trim();
}

function buildAutoNegative(item: ImageItem): string {
  return defaultNegativeFor(item.itemCategory);
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AdminImagesPage() {
  const [activeTab, setActiveTab] = useState<ItemCategory>('girlfriend');
  const [items, setItems] = useState<ImageItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'with_image' | 'without_image'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'created_at'>('created_at');

  const [selectedItem, setSelectedItem] = useState<ImageItem | null>(null);
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [genStates, setGenStates] = useState<Record<string, GenState>>({});

  const [batchRunning, setBatchRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [showAddPreset, setShowAddPreset] = useState(false);
  const [newPresetLabel, setNewPresetLabel] = useState('');
  const [newPresetPositive, setNewPresetPositive] = useState('');
  const [newPresetNegative, setNewPresetNegative] = useState('');

  const [promptExpanded, setPromptExpanded] = useState(true);
  const [paramsExpanded, setParamsExpanded] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ImageItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<ImageItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Comfy 操作台图库选择
  const [showConsoleGallery, setShowConsoleGallery] = useState(false);
  const [consoleAssets, setConsoleAssets] = useState<
    Array<{ id?: string | null; url: string; kind?: string; prompt?: string | null; source?: string; created_at?: string | null }>
  >([]);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [consoleApplyTarget, setConsoleApplyTarget] = useState<ImageItem | null>(null);
  const [consoleApplying, setConsoleApplying] = useState(false);

  const currentGenState = useMemo(() => {
    if (!selectedItem) return DEFAULT_GEN_STATE;
    return genStates[selectedItem.id] || DEFAULT_GEN_STATE;
  }, [selectedItem, genStates]);

  const updateGenState = useCallback((id: string, updates: Partial<GenState>) => {
    setGenStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || DEFAULT_GEN_STATE), ...updates },
    }));
  }, []);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs((prev) => [
      ...prev.slice(-80),
      { time: new Date().toLocaleTimeString(), message, type },
    ]);
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [activeTab, debouncedSearch, filterStatus, sortBy]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        type: activeTab,
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        status: filterStatus,
        sort: sortBy,
        stats: '1',
      });
      if (debouncedSearch) qs.set('search', debouncedSearch);

      const [listRes, presetsRes] = await Promise.all([
        authedFetch(`/api/admin/images/list?${qs.toString()}`),
        authedFetch('/api/admin/prompts'),
      ]);

      if (!listRes.ok) {
        const err = await listRes.json().catch(() => ({}));
        throw new Error(err.error || '加载图片列表失败');
      }

      const listData = await listRes.json();
      // Client-side name sanitization (DB may still hold full captions as name)
      const cleaned = ((listData.items || []) as ImageItem[]).map((it) => ({
        ...it,
        name: itemLabel(it),
      }));
      setItems(cleaned);
      // Keep selected item name in sync after reload
      setSelectedItem((prev) => {
        if (!prev) return prev;
        const next = cleaned.find((x) => x.id === prev.id);
        return next ? { ...prev, ...next, name: itemLabel(next) } : { ...prev, name: itemLabel(prev) };
      });
      if (listData.pagination) {
        setPagination((prev) => ({
          ...prev,
          page: listData.pagination.page,
          pageSize: listData.pagination.pageSize,
          total: listData.pagination.total,
          totalPages: listData.pagination.totalPages,
        }));
      }
      if (listData.stats) setStats(listData.stats);

      if (presetsRes.ok) {
        const presetsData = await presetsRes.json();
        setPresets(presetsData.presets || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeTab, pagination.page, pagination.pageSize, filterStatus, sortBy, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // When selecting an item, auto-fill clean prompt (rebuild stacked captions)
  useEffect(() => {
    if (!selectedItem) return;
    const state = genStates[selectedItem.id];
    const existing = state?.positivePrompt || '';
    const stacked =
      !existing ||
      (existing.match(/raw photo/gi) || []).length >= 2 ||
      (existing.length > 400 && /masterpiece/i.test(existing));
    if (!state || stacked) {
      updateGenState(selectedItem.id, {
        positivePrompt: buildAutoPrompt(selectedItem),
        negativePrompt: buildAutoNegative(selectedItem),
        editTitle: itemLabel(selectedItem),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id]);

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await authedFetch('/api/admin/images/delete', {
        method: 'POST',
        body: JSON.stringify({
          type: deleteTarget.itemCategory,
          id: deleteTarget.id,
          imageUrl: deleteTarget.imageUrl || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '删除失败');
      }
      toast.success(`已删除 ${deleteTarget.name} 的图片`);
      addLog('success', `删除图片：${deleteTarget.name}`);
      setDeleteTarget(null);
      if (selectedItem?.id === deleteTarget.id) {
        setSelectedItem((prev) =>
          prev ? { ...prev, imageUrl: null, hasImage: false } : prev,
        );
      }
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
      addLog('error', `删除失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setDeleting(false);
    }
  };

  // ── Upload ───────────────────────────────────────────────────────────────
  const handleUploadClick = (item: ImageItem) => {
    setUploadTarget(item);
    fileInputRef.current?.click();
  };

  const openConsoleGallery = async (item: ImageItem) => {
    setConsoleApplyTarget(item);
    setShowConsoleGallery(true);
    setConsoleLoading(true);
    try {
      const res = await authedFetch('/api/admin/comfy?view=assets&limit=60');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载操作台图库失败');
      const list = (data.assets || [])
        .map((a: Record<string, unknown>) => ({
          id: (a.id as string) || null,
          url: toPreviewUrl(String(a.url || a.storage_key || '')),
          kind: (a.kind as string) || undefined,
          prompt: (a.prompt as string) || null,
          source: (a.source as string) || undefined,
          created_at: (a.created_at as string) || null,
        }))
        .filter((a: { url: string }) => !!a.url);
      setConsoleAssets(list);
      if (data.warning && list.length === 0) toast.message(data.warning);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载图库失败');
      setConsoleAssets([]);
    } finally {
      setConsoleLoading(false);
    }
  };

  /** 将操作台/已生成图 URL 应用到当前条目（复制到 admin 目录并写库） */
  const applyImageUrlToItem = async (item: ImageItem, imageUrl: string) => {
    setConsoleApplying(true);
    setUploading(true);
    try {
      const res = await authedFetch('/api/admin/images/upload', {
        method: 'POST',
        body: JSON.stringify({
          type: item.itemCategory,
          id: item.id,
          field: item.field,
          imageUrl,
          rehost: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '应用图片失败');
      const url = data.url || imageUrl;
      toast.success(`已应用操作台图片 → ${item.name}`);
      addLog('success', `操作台图已应用：${item.name}`);
      if (selectedItem?.id === item.id) {
        setSelectedItem((prev) =>
          prev ? { ...prev, imageUrl: url, hasImage: true } : prev,
        );
      }
      setShowConsoleGallery(false);
      setConsoleApplyTarget(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '应用失败');
      addLog('error', err instanceof Error ? err.message : '应用操作台图失败');
    } finally {
      setConsoleApplying(false);
      setUploading(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', uploadTarget.itemCategory);
      formData.append('id', uploadTarget.id);
      formData.append('field', uploadTarget.field);

      const token = getSessionToken();
      const res = await fetch('/api/admin/images/upload', {
        method: 'POST',
        headers: token ? { 'x-session': token } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '上传失败');
      }
      const data = await res.json();
      toast.success(`已上传 ${uploadTarget.name} 的图片`);
      addLog('success', `上传成功：${uploadTarget.name}`);
      if (selectedItem?.id === uploadTarget.id) {
        setSelectedItem((prev) =>
          prev ? { ...prev, imageUrl: data.url, hasImage: true } : prev,
        );
      }
      setUploadTarget(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
      addLog('error', `上传失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Presets ──────────────────────────────────────────────────────────────
  const applyPreset = (preset: PromptPreset) => {
    if (!selectedItem) return;
    // FLUX scene presets often use empty negative — do not fall back to long SD text
    const neg =
      preset.negativePrompt !== undefined && preset.negativePrompt !== null
        ? preset.negativePrompt
        : DEFAULT_NEGATIVE;
    updateGenState(selectedItem.id, {
      positivePrompt: preset.positivePrompt,
      negativePrompt: neg,
      activePreset: preset.id,
    });
  };

  const applyParamPreset = (pack: FluxParamPreset) => {
    if (!selectedItem) return;
    updateGenState(selectedItem.id, {
      activeParamPreset: pack.id,
      genParams: {
        ...currentGenState.genParams,
        steps: pack.steps,
        cfg: pack.cfg,
        width: pack.width,
        height: pack.height,
        sampler: pack.sampler,
        scheduler: pack.scheduler,
        denoise: pack.denoise,
      },
      // Consistency pack: auto-enable face lock when portrait exists
      ...(pack.id === 'flux_consistency' && selectedItem.hasImage
        ? { useConsistency: true }
        : {}),
    });
    toast.success(`已应用参数：${pack.label}`);
  };

  const addPreset = async () => {
    if (!newPresetLabel || !newPresetPositive) return;
    const res = await authedFetch('/api/admin/prompts', {
      method: 'POST',
      body: JSON.stringify({
        label: newPresetLabel,
        positivePrompt: newPresetPositive,
        negativePrompt: newPresetNegative,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setPresets((prev) => [...prev, data.preset]);
      setShowAddPreset(false);
      setNewPresetLabel('');
      setNewPresetPositive('');
      setNewPresetNegative('');
      toast.success('预设已保存');
    } else {
      toast.error('保存预设失败');
    }
  };

  const deletePreset = async (id: string) => {
    const res = await authedFetch(`/api/admin/prompts?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setPresets((prev) => prev.filter((p) => p.id !== id));
    }
  };

  // ── Auto-fill / AI meta ──────────────────────────────────────────────────
  const autoFillPrompt = () => {
    if (!selectedItem) return;
    updateGenState(selectedItem.id, {
      positivePrompt: buildAutoPrompt(selectedItem),
      negativePrompt: buildAutoNegative(selectedItem),
      activePreset: null,
      genProgress:
        selectedItem.itemCategory === 'girlfriend'
          ? '已填充：女友特征 + 固定性感体态 + 3/4 全身'
          : selectedItem.itemCategory === 'outfit'
            ? '已填充：无模特 · 性感 cos 游戏服装道具'
            : '已填充：特效游戏道具风格',
    });
    toast.success('提示词已自动填充');
  };

  const generateMetaData = async () => {
    if (!selectedItem) return;
    const state = genStates[selectedItem.id] || DEFAULT_GEN_STATE;
    if (state.metaGenerating) return;

    updateGenState(selectedItem.id, {
      metaGenerating: true,
      genProgress: 'AI 正在根据属性生成元数据与提示词...',
    });

    try {
      const concept = state.positivePrompt || buildAutoPrompt(selectedItem);
      let girlfriendData: Record<string, unknown> | null = null;
      let outfitData: Record<string, unknown> | null = null;
      let propData: Record<string, unknown> | null = null;

      if (selectedItem.itemCategory === 'girlfriend') {
        const tagList = Array.isArray(selectedItem.tags)
          ? selectedItem.tags
          : typeof selectedItem.tags === 'string'
            ? selectedItem.tags.split(',').map((t) => t.trim())
            : [];
        girlfriendData = {
          name: itemLabel(selectedItem),
          personality: selectedItem.personality,
          tags: tagList,
          appearance: selectedItem.appearance,
          appearance_race: selectedItem.appearance_race,
          appearance_hair: selectedItem.appearance_hair,
          appearance_hair_color: selectedItem.appearance_hair_color,
          appearance_eyes: selectedItem.appearance_eyes,
          appearance_body: selectedItem.appearance_body,
          appearance_style: selectedItem.appearance_style,
          character_card: selectedItem.character_card,
        };
      } else if (selectedItem.itemCategory === 'outfit') {
        outfitData = {
          name: itemLabel(selectedItem),
          description: selectedItem.description,
          category: selectedItem.category,
          tier: selectedItem.tier,
        };
      } else {
        propData = {
          name: selectedItem.name,
          description: selectedItem.description,
          item_type: selectedItem.item_type,
          category: selectedItem.category,
          intimacy_boost: selectedItem.intimacy_boost,
        };
      }

      const res = await authedFetch('/api/v2/admin/images/generate-meta', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedItem.itemCategory,
          concept,
          girlfriendData,
          outfitData,
          propData,
        }),
      });

      const data = await readResponseJson<{ metadata?: any; error?: string }>(res);
      if (!res.ok) {
        throw new Error(data.error || `Metadata generation failed (${res.status})`);
      }
      if (!data.metadata) throw new Error(data.error || 'No metadata returned');

      const appearance = data.metadata.appearance || concept;
      // LLM sometimes echoes the full caption into "title" — only keep short names
      const metaTitle = safeTitleForSave(data.metadata.title) || itemLabel(selectedItem);
      updateGenState(selectedItem.id, {
        generatedMeta: data.metadata,
        editTitle: metaTitle,
        editDescription:
          data.metadata.description && !looksLikeFluxPrompt(data.metadata.description)
            ? data.metadata.description
            : '',
        editTags: Array.isArray(data.metadata.tags)
          ? data.metadata.tags.join(', ')
          : '',
        editAppearance: appearance,
        positivePrompt: appearance,
        genProgress: '元数据已生成，可编辑后点击「生成图片」',
        metaGenerating: false,
      });
      toast.success('提示词/元数据已生成');
    } catch (err) {
      updateGenState(selectedItem.id, {
        genProgress: `错误：${err instanceof Error ? err.message : '未知'}`,
        metaGenerating: false,
      });
      toast.error(err instanceof Error ? err.message : '生成失败');
    }
  };

  // ── Generate images ──────────────────────────────────────────────────────
  const generateFromMeta = async (deleteExisting = false) => {
    if (!selectedItem) return;
    const state = genStates[selectedItem.id] || DEFAULT_GEN_STATE;
    if (state.generating) return;

    const prompt = state.editAppearance || state.positivePrompt;
    if (!prompt?.trim()) {
      toast.error('请先填写或自动填充提示词');
      return;
    }

    updateGenState(selectedItem.id, {
      generating: true,
      generatedImages: [],
      selectedImages: new Set(),
      genProgress: '正在生成图片，请稍候...',
    });
    // Always rebuild if caption is stacked / name-polluted
    let promptToSend = prompt.trim();
    const stacked =
      (promptToSend.match(/raw photo/gi) || []).length >= 2 ||
      /portrait of\s+RAW photo/i.test(promptToSend) ||
      promptToSend.length > 700;
    if (stacked) {
      promptToSend = buildAutoPrompt(selectedItem);
      updateGenState(selectedItem.id, {
        positivePrompt: promptToSend,
        editAppearance: promptToSend,
      });
    }

    const label = itemLabel(selectedItem);
    addLog('progress', `开始生成：${label}（1 张 · 排队可能需 2–5 分钟，请勿重复点）`);

    try {
      const res = await authedFetch('/api/v2/admin/images/generate-from-meta', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedItem.itemCategory,
          metadata: state.generatedMeta
            ? {
                title: itemLabel(selectedItem),
                description: state.editDescription,
                tags: (state.editTags || '')
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
                appearance: promptToSend,
              }
            : {
                title: itemLabel(selectedItem),
                description: selectedItem.description || '',
                tags: [],
                appearance: promptToSend,
              },
          customPrompt: promptToSend,
          referenceImage:
            state.useConsistency && selectedItem.imageUrl
              ? selectedItem.imageUrl
              : undefined,
          denoise:
            state.useConsistency && selectedItem.imageUrl
              ? state.genParams.denoise ?? 0.55
              : undefined,
          existingId: selectedItem.id,
          existingField: selectedItem.field,
          deleteExisting,
          // FLUX: empty string is intentional for girlfriend portraits
          negativePrompt:
            state.negativePrompt !== undefined ? state.negativePrompt : undefined,
          count: 1, // 1 job only — endpoint has ~1 worker; multi-gen floods the queue
          width: state.genParams.width,
          height: state.genParams.height,
          steps: state.genParams.steps,
          cfg: state.genParams.cfg,
          seed: state.genParams.seed,
          sampler: state.genParams.sampler,
          scheduler: state.genParams.scheduler,
          girlfriendId:
            selectedItem.itemCategory === 'girlfriend' ? selectedItem.id : undefined,
        }),
      });

      const data = await readResponseJson<{ success?: boolean; error?: string; images?: unknown[] }>(res);
      if (!res.ok) {
        throw new Error(data.error || `Image generation failed (${res.status})`);
      }
      if (!data.success) throw new Error(data.error || 'Image generation failed');

      const rawList: unknown[] = Array.isArray(data.images) ? data.images : [];
      const images = rawList
        .map((raw, idx: number) => {
          // Support both {url,key} objects and plain string URLs (legacy)
          const r =
            typeof raw === 'string'
              ? { url: raw, previewUrl: raw, key: undefined as string | undefined }
              : (raw as { url?: string; previewUrl?: string; key?: string });
          let permanent = String(r.url || r.previewUrl || '').trim();
          if (isPromptLike(permanent)) permanent = '';
          if (permanent.startsWith('data:')) permanent = ''; // never keep multi-MB data urls
          if (permanent && !permanent.startsWith('http')) {
            permanent = toPreviewUrl(permanent) || toPreviewUrl(r.key || '') || '';
          }
          if (!permanent && r.key) permanent = toPreviewUrl(r.key);
          if (isPromptLike(permanent)) permanent = '';
          return {
            url: permanent,
            previewUrl: permanent,
            key: r.key,
            alt: `生成图 ${idx + 1}`,
          };
        })
        .filter((r: { url: string }) => !!r.url && r.url.startsWith('http'));

      if (images.length === 0) {
        throw new Error(
          '生成成功但未返回可预览的 HTTPS 图片地址。请检查 RunPod 出图与 Supabase Storage（bucket: portraits）。',
        );
      }

      updateGenState(selectedItem.id, {
        generatedImages: images,
        // Auto-select first so 「确认应用」 is one click
        selectedImages: new Set([0]),
        genProgress: `已生成 ${images.length} 张，已选中第 1 张 — 可点选切换后确认应用`,
        generating: false,
      });
      // Collapse long prompt editor so results stay visible above the fold
      setPromptExpanded(false);
      addLog(
        'success',
        `${label} 生成 ${images.length} 张 · ${images[0].url.slice(0, 100)}`,
      );
      toast.success(`${label} 生成完成：${images.length} 张（已自动选中第 1 张）`);
      setTimeout(() => {
        document.getElementById('gen-results')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err) {
      updateGenState(selectedItem.id, {
        genProgress: `错误：${err instanceof Error ? err.message : '未知'}`,
        generating: false,
      });
      addLog('error', err instanceof Error ? err.message : '生成失败');
      toast.error(err instanceof Error ? err.message : '生成失败');
    }
  };

  const confirmImage = async () => {
    if (!selectedItem) return;
    const state = genStates[selectedItem.id] || DEFAULT_GEN_STATE;
    if (state.selectedImages.size === 0) {
      toast.error('请先选择一张生成结果');
      return;
    }
    setSaving(true);
    const idx = Array.from(state.selectedImages)[0];
    const selectedImg = state.generatedImages[idx];
    // Prefer permanent https URL; never save prompt text or huge data URLs if we have https
    let saveUrl = selectedImg?.url || '';
    if (isPromptLike(saveUrl)) saveUrl = '';
    if (saveUrl.startsWith('data:') && selectedImg?.key) {
      // Re-resolve public URL from key if we only have data preview
      saveUrl =
        toPreviewUrl(selectedImg.key) ||
        selectedImg.previewUrl ||
        saveUrl;
    }
    if (!saveUrl) {
      setSaving(false);
      toast.error('没有可保存的图片地址');
      return;
    }

    try {
      // If still data URL, re-upload via apply endpoint
      if (saveUrl.startsWith('data:')) {
        await applyImageUrlToItem(selectedItem, saveUrl);
        setSaving(false);
        updateGenState(selectedItem.id, {
          generatedImages: [],
          selectedImages: new Set(),
        });
        return;
      }

      const title = safeTitleForSave(state.editTitle) || safeTitleForSave(selectedItem.name);
      const res = await authedFetch('/api/admin/images/update', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedItem.itemCategory,
          id: selectedItem.id,
          imageUrl: saveUrl,
          field: selectedItem.field,
          // Only short person names — never full image prompts
          ...(title ? { title } : {}),
          description:
            state.editDescription && !looksLikeFluxPrompt(state.editDescription)
              ? state.editDescription
              : '',
          tags: (state.editTags || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error('保存失败');

      toast.success(`图片已应用到「${itemLabel(selectedItem)}」`);
      addLog('success', `已保存：${itemLabel(selectedItem)}`);
      updateGenState(selectedItem.id, {
        generatedImages: [],
        selectedImages: new Set(),
      });
      setSelectedItem((prev) =>
        prev
          ? {
              ...prev,
              imageUrl: saveUrl,
              hasImage: true,
              name: title || prev.name,
            }
          : prev,
      );
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
      addLog('error', `保存失败：${err instanceof Error ? err.message : '未知'}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (idx: number) => {
    if (!selectedItem) return;
    const state = genStates[selectedItem.id] || DEFAULT_GEN_STATE;
    const next = new Set(state.selectedImages);
    if (next.has(idx)) next.delete(idx);
    else {
      next.clear();
      next.add(idx);
    }
    updateGenState(selectedItem.id, { selectedImages: next });
  };

  const batchGenerate = async () => {
    if (batchRunning) return;
    setBatchRunning(true);
    setLogExpanded(true);
    setLogs([]);
    addLog('info', '开始批量补全缺失图片（仅 portrait + avatar 都为空的女友）…');
    try {
      const res = await authedFetch('/api/v2/runpod/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 12,
          params: {
            ...DEFAULT_GEN_STATE.genParams,
            width: FLUX_DEFAULT_GEN_PARAMS.width,
            height: FLUX_DEFAULT_GEN_PARAMS.height,
            steps: FLUX_DEFAULT_GEN_PARAMS.steps,
            cfg: FLUX_DEFAULT_GEN_PARAMS.cfg,
            cfg_scale: FLUX_DEFAULT_GEN_PARAMS.cfg,
            sampler: FLUX_DEFAULT_GEN_PARAMS.sampler,
            scheduler: FLUX_DEFAULT_GEN_PARAMS.scheduler,
          },
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`批量任务失败 (${res.status}) ${errText.slice(0, 200)}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无响应流');
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let completed = 0;
      let failed = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'log' && data.message) {
                addLog(
                  data.type === 'error'
                    ? 'error'
                    : data.type === 'success'
                      ? 'success'
                      : 'info',
                  data.message,
                );
              } else if (currentEvent === 'start') {
                addLog('info', `队列共 ${data.total ?? 0} 项`);
              } else if (currentEvent === 'progress') {
                addLog(
                  'info',
                  `进度 ${Number(data.index) + 1}/${data.total}：${data.name || ''}…`,
                );
              } else if (currentEvent === 'complete') {
                completed += 1;
                addLog('success', `✓ ${data.name || '完成'}`);
              } else if (currentEvent === 'error') {
                failed += 1;
                addLog(
                  'error',
                  `✗ ${data.name || '失败'}：${data.error || data.message || '未知错误'}`,
                );
              } else if (currentEvent === 'done') {
                const c = data.completed ?? completed;
                const f = data.failed ?? failed;
                addLog('success', `完成：成功 ${c}，失败 ${f}`);
                if (c === 0 && f === 0) {
                  toast.message('没有需要补图的记录（或队列为空）');
                } else if (f > 0) {
                  toast.error(`批量结束：成功 ${c}，失败 ${f}`);
                } else {
                  toast.success(`批量完成：成功 ${c} 张`);
                }
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
      }
      loadData();
    } catch (err) {
      addLog('error', err instanceof Error ? err.message : '批量失败');
      toast.error(err instanceof Error ? err.message : '批量失败');
    } finally {
      setBatchRunning(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading && items.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
        <span className="ml-3 text-gray-500">加载图片资源...</span>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <p className="font-medium text-red-600">加载失败</p>
          <p className="mt-1 text-sm text-red-500">{error}</p>
          <button
            onClick={loadData}
            className="mt-3 rounded-md bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const missingCount =
    (stats?.totalGirlfriends ?? 0) -
    (stats?.withPortrait ?? 0) +
    (stats?.totalOutfits ?? 0) -
    (stats?.withPreview ?? 0) +
    (stats?.totalShopItems ?? 0) -
    (stats?.shopItemsWithImage ?? 0);

  return (
    <div className="min-h-screen bg-[#F5F7FA] p-4 md:p-6" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B]">图片管理</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            女友 / 道具 / 商城：AI 绘图、上传、删除、提示词编辑与自动填充
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#64748B] hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={batchGenerate}
            disabled={batchRunning}
            className="flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {batchRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 批量生成中...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> 批量补全缺图
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<User className="h-5 w-5" />}
          label="女友"
          value={stats?.totalGirlfriends ?? 0}
          sub={`已有图 ${stats?.withPortrait ?? 0}`}
          color="blue"
        />
        <StatCard
          icon={<Shirt className="h-5 w-5" />}
          label="道具/服装"
          value={stats?.totalOutfits ?? 0}
          sub={`已有图 ${stats?.withPreview ?? 0}`}
          color="emerald"
        />
        <StatCard
          icon={<Package className="h-5 w-5" />}
          label="商城"
          value={stats?.totalShopItems ?? 0}
          sub={`已有图 ${stats?.shopItemsWithImage ?? 0}`}
          color="amber"
        />
        <StatCard
          icon={<ImageIcon className="h-5 w-5" />}
          label="待补图"
          value={Math.max(0, missingCount)}
          sub="三类合计"
          color="rose"
        />
      </div>

      {/* Gen params (global for selected) */}
      <div className="mb-5 rounded-xl border border-gray-100 bg-white shadow-sm">
        <button
          onClick={() => setParamsExpanded(!paramsExpanded)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium text-[#1E293B] hover:bg-gray-50/50"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#64748B]" />
            <span>
              生成参数
              {selectedItem ? ` · ${itemLabel(selectedItem)}` : ' · 请先选择条目'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B]">
              Steps {currentGenState.genParams.steps} · CFG {currentGenState.genParams.cfg} ·{' '}
              {currentGenState.genParams.width}×{currentGenState.genParams.height}
              {currentGenState.useConsistency
                ? ` · denoise ${currentGenState.genParams.denoise ?? 0.55}`
                : ''}
            </span>
            {paramsExpanded ? (
              <ChevronUp className="h-4 w-4 text-[#64748B]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#64748B]" />
            )}
          </div>
        </button>
        {paramsExpanded && (
          <div className="space-y-4 border-t border-gray-100 px-5 pb-5 pt-4">
            {/* FLUX param packs */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-[#64748B]">FLUX 参数预设</span>
                <span className="text-[10px] text-gray-400">
                  推荐 CFG 1.0 · 空负面 · euler/simple
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FLUX_PARAM_PRESETS.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    disabled={!selectedItem}
                    title={pack.hint}
                    onClick={() => applyParamPreset(pack)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                      currentGenState.activeParamPreset === pack.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                    }`}
                  >
                    {pack.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <div>
                <label className="mb-1 flex items-center justify-between text-xs text-[#64748B]">
                  <span>Steps</span>
                  <span className="font-mono font-semibold text-[#1E293B]">
                    {currentGenState.genParams.steps}
                  </span>
                </label>
                <input
                  type="range"
                  min={16}
                  max={40}
                  step={1}
                  value={currentGenState.genParams.steps}
                  disabled={!selectedItem}
                  onChange={(e) =>
                    selectedItem &&
                    updateGenState(selectedItem.id, {
                      activeParamPreset: null,
                      genParams: {
                        ...currentGenState.genParams,
                        steps: Number(e.target.value),
                      },
                    })
                  }
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#2563EB]"
                />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-xs text-[#64748B]">
                  <span>CFG（FLUX 1–3.5）</span>
                  <span className="font-mono font-semibold text-[#1E293B]">
                    {currentGenState.genParams.cfg}
                  </span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={3.5}
                  step={0.1}
                  value={currentGenState.genParams.cfg}
                  disabled={!selectedItem}
                  onChange={(e) =>
                    selectedItem &&
                    updateGenState(selectedItem.id, {
                      activeParamPreset: null,
                      genParams: {
                        ...currentGenState.genParams,
                        cfg: Number(e.target.value),
                      },
                    })
                  }
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#2563EB]"
                />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-xs text-[#64748B]">
                  <span>Denoise（一致性）</span>
                  <span className="font-mono font-semibold text-[#1E293B]">
                    {currentGenState.genParams.denoise ?? 0.55}
                  </span>
                </label>
                <input
                  type="range"
                  min={0.3}
                  max={0.85}
                  step={0.05}
                  value={currentGenState.genParams.denoise ?? 0.55}
                  disabled={!selectedItem}
                  onChange={(e) =>
                    selectedItem &&
                    updateGenState(selectedItem.id, {
                      activeParamPreset: null,
                      genParams: {
                        ...currentGenState.genParams,
                        denoise: Number(e.target.value),
                      },
                    })
                  }
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-violet-600"
                />
                <p className="mt-0.5 text-[10px] text-gray-400">
                  越低越像参考图 · 开「保持一致性」时生效
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#64748B]">Seed（-1 随机）</label>
                <input
                  type="number"
                  value={currentGenState.genParams.seed}
                  disabled={!selectedItem}
                  onChange={(e) =>
                    selectedItem &&
                    updateGenState(selectedItem.id, {
                      genParams: {
                        ...currentGenState.genParams,
                        seed: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-[#1E293B] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#64748B]">尺寸</label>
                <select
                  value={`${currentGenState.genParams.width}x${currentGenState.genParams.height}`}
                  disabled={!selectedItem}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split('x').map(Number);
                    selectedItem &&
                      updateGenState(selectedItem.id, {
                        activeParamPreset: null,
                        genParams: {
                          ...currentGenState.genParams,
                          width: w,
                          height: h,
                        },
                      });
                  }}
                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-[#1E293B] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                >
                  <option value="768x1024">竖版 768×1024（快）</option>
                  <option value="832x1216">竖版 832×1216（推荐）</option>
                  <option value="896x1152">竖版 896×1152</option>
                  <option value="1024x1024">方图 1024×1024</option>
                  <option value="1024x768">横版 1024×768</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#64748B]">
                  Sampler / Scheduler
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={currentGenState.genParams.sampler}
                    disabled={!selectedItem}
                    onChange={(e) =>
                      selectedItem &&
                      updateGenState(selectedItem.id, {
                        activeParamPreset: null,
                        genParams: {
                          ...currentGenState.genParams,
                          sampler: e.target.value,
                        },
                      })
                    }
                    className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="euler">Euler（推荐）</option>
                    <option value="euler_ancestral">Euler Anc.</option>
                    <option value="dpmpp_2m">DPM++ 2M</option>
                    <option value="uni_pc">UniPC</option>
                  </select>
                  <select
                    value={currentGenState.genParams.scheduler}
                    disabled={!selectedItem}
                    onChange={(e) =>
                      selectedItem &&
                      updateGenState(selectedItem.id, {
                        activeParamPreset: null,
                        genParams: {
                          ...currentGenState.genParams,
                          scheduler: e.target.value,
                        },
                      })
                    }
                    className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="simple">Simple（推荐）</option>
                    <option value="normal">Normal</option>
                    <option value="sgm_uniform">SGM Uni.</option>
                    <option value="karras">Karras</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left: library */}
        <div className="xl:col-span-2">
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
            {/* Tabs */}
            <div className="flex flex-wrap border-b border-gray-100">
              {(Object.keys(TAB_META) as ItemCategory[]).map((key) => {
                const meta = TAB_META[key];
                const Icon = meta.icon;
                const count =
                  key === 'girlfriend'
                    ? stats?.totalGirlfriends
                    : key === 'outfit'
                      ? stats?.totalOutfits
                      : stats?.totalShopItems;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveTab(key);
                      setSelectedItem(null);
                      setPagination((p) => ({ ...p, page: 1 }));
                    }}
                    className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium transition-colors ${
                      activeTab === key
                        ? 'border-b-2 border-[#2563EB] text-[#2563EB]'
                        : 'border-b-2 border-transparent text-[#64748B] hover:text-[#1E293B]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {meta.label}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {count ?? '—'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
              <div className="relative min-w-[180px] flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={`搜索${TAB_META[activeTab].label}名称...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus(e.target.value as 'all' | 'with_image' | 'without_image')
                }
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              >
                <option value="all">全部状态</option>
                <option value="with_image">已有图片</option>
                <option value="without_image">缺少图片</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'created_at')}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              >
                <option value="created_at">最新创建</option>
                <option value="name">名称排序</option>
              </select>
              <div className="ml-auto text-sm text-gray-500">
                共 {pagination.total} 条 · 第 {pagination.page}/{pagination.totalPages} 页
                {loading && (
                  <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-gray-400" />
                )}
              </div>
            </div>

            {/* Grid */}
            <div className="p-4">
              {items.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-sm text-[#64748B]">
                  <ImageIcon className="mb-2 h-8 w-8 text-gray-300" />
                  {TAB_META[activeTab].empty}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {items.map((item) => {
                    const busy =
                      genStates[item.id]?.generating || genStates[item.id]?.metaGenerating;
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedItem(item)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedItem(item)}
                        className={`group relative overflow-hidden rounded-lg border-2 text-left transition-all ${
                          selectedItem?.id === item.id
                            ? 'border-[#2563EB] ring-2 ring-blue-200'
                            : 'border-gray-100 hover:border-gray-300'
                        }`}
                      >
                        <div className="aspect-[3/4] w-full bg-gray-50">
                          {item.hasImage && item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={toPreviewUrl(item.imageUrl)}
                              alt={item.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                const el = e.currentTarget;
                                el.style.opacity = '0.3';
                                el.title = `预览失败: ${item.imageUrl?.slice(0, 80)}`;
                              }}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <div className="text-center">
                                <ImageIcon className="mx-auto h-8 w-8 text-gray-300" />
                                <span className="mt-1 block text-xs text-gray-400">无图</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div
                          className={`absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            item.hasImage
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.hasImage ? '有图' : '缺图'}
                        </div>

                        {busy && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30">
                            <Loader2 className="h-6 w-6 animate-spin text-white" />
                          </div>
                        )}

                        <div className="absolute inset-x-0 bottom-10 flex justify-center gap-1.5 px-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            title="删除图片"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(item);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-red-500 shadow-md hover:bg-red-500 hover:text-white"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="本地上传"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUploadClick(item);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#2563EB] shadow-md hover:bg-[#2563EB] hover:text-white"
                          >
                            <Upload className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="操作台图库"
                            onClick={(e) => {
                              e.stopPropagation();
                              openConsoleGallery(item);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-violet-600 shadow-md hover:bg-violet-600 hover:text-white"
                          >
                            <LayoutGrid className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="选中并绘图"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItem(item);
                              document
                                .getElementById('gen-panel')
                                ?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-md hover:bg-emerald-500 hover:text-white"
                          >
                            <Sparkles className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="px-2 py-1.5">
                          <p className="truncate text-xs font-medium text-[#1E293B]">
                            {itemLabel(item)}
                          </p>
                          {item.category && (
                            <p className="truncate text-[10px] text-[#64748B]">{item.category}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="mt-5 flex items-center justify-center gap-2">
                  <button
                    disabled={pagination.page <= 1 || loading}
                    onClick={() =>
                      setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-3 text-sm text-gray-600">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    disabled={pagination.page >= pagination.totalPages || loading}
                    onClick={() =>
                      setPagination((p) => ({
                        ...p,
                        page: Math.min(p.totalPages, p.page + 1),
                      }))
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <select
                    value={pagination.pageSize}
                    onChange={(e) =>
                      setPagination((p) => ({
                        ...p,
                        page: 1,
                        pageSize: Number(e.target.value),
                      }))
                    }
                    className="ml-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value={12}>12 / 页</option>
                    <option value={24}>24 / 页</option>
                    <option value={36}>36 / 页</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Logs */}
          <div className="mt-4 rounded-xl border border-gray-100 bg-white shadow-sm">
            <button
              onClick={() => setLogExpanded(!logExpanded)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
            >
              <span>操作日志</span>
              {logExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {logExpanded && (
              <div className="max-h-40 overflow-y-auto border-t border-gray-100 px-4 py-2 font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="py-4 text-center text-gray-400">暂无日志</p>
                ) : (
                  logs.map((log, i) => (
                    <div
                      key={i}
                      className={`py-0.5 ${
                        log.type === 'error'
                          ? 'text-red-600'
                          : log.type === 'success'
                            ? 'text-emerald-600'
                            : 'text-gray-600'
                      }`}
                    >
                      <span className="text-gray-400">[{log.time}]</span> {log.message}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Right: detail + gen */}
        <div className="space-y-4" id="gen-panel">
          {selectedItem ? (
            <>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-50">
                    {selectedItem.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={toPreviewUrl(selectedItem.imageUrl)}
                        alt={selectedItem.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-[#1E293B]">
                      {itemLabel(selectedItem)}
                    </h3>
                    <p className="text-xs text-[#64748B]">
                      {TAB_META[selectedItem.itemCategory].label}
                      {selectedItem.hasImage ? ' · 已有图片' : ' · 缺少图片'}
                      {selectedItem.category ? ` · ${selectedItem.category}` : ''}
                    </p>
                    {selectedItem.appearance && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-400">
                        {selectedItem.appearance}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleUploadClick(selectedItem)}
                    disabled={uploading || consoleApplying}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-[#2563EB] hover:bg-blue-50"
                  >
                    {uploading && !consoleApplying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    本地上传
                  </button>
                  <button
                    onClick={() => openConsoleGallery(selectedItem)}
                    disabled={uploading || consoleApplying}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100"
                    title="选用 Comfy 操作台已生成的图片"
                  >
                    {consoleApplying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LayoutGrid className="h-3.5 w-3.5" />
                    )}
                    操作台图库
                  </button>
                  <button
                    onClick={() => setDeleteTarget(selectedItem)}
                    disabled={!selectedItem.hasImage}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    删图
                  </button>
                  <button
                    onClick={autoFillPrompt}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-violet-600 hover:bg-violet-50"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    自动填充
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-gray-400">
                  「操作台图库」可选用{' '}
                  <a href="/admin/comfy" className="text-violet-600 underline" target="_blank" rel="noreferrer">
                    Comfy 操作台
                  </a>{' '}
                  生成的图片，或历史出图目录中的文件。
                </p>
              </div>

              {/* Results FIRST (above prompt) so they are always visible after gen */}
              {currentGenState.generatedImages.length > 0 && (
                <div
                  id="gen-results"
                  className="rounded-xl border-2 border-emerald-200 bg-white p-4 shadow-sm"
                >
                  <h4 className="mb-1 text-sm font-semibold text-emerald-800">
                    ✓ 生成结果（{currentGenState.generatedImages.length} 张 · 点选后确认）
                  </h4>
                  <p className="mb-3 text-[11px] text-gray-500">
                    缩略图空白时点「新窗口打开」。确认后写入角色肖像字段。
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {currentGenState.generatedImages.map((img, idx) => {
                      const src = displayImageSrc(img);
                      const selected = currentGenState.selectedImages.has(idx);
                      return (
                        <div
                          key={`top-${idx}-${(img.url || '').slice(-20)}`}
                          className={`relative overflow-hidden rounded-lg border-2 bg-gray-50 ${
                            selected ? 'border-[#2563EB] ring-2 ring-blue-200' : 'border-gray-200'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSelect(idx)}
                            className="block w-full text-left"
                          >
                            {src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={src}
                                alt={`生成图 ${idx + 1}`}
                                className="aspect-[3/4] w-full bg-slate-100 object-cover"
                                loading="eager"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  const el = e.currentTarget;
                                  if (!el.dataset.retried && src.startsWith('http')) {
                                    el.dataset.retried = '1';
                                    el.src = `${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`;
                                  }
                                }}
                              />
                            ) : (
                              <div className="flex aspect-[3/4] items-center justify-center text-[11px] text-red-600">
                                无地址
                              </div>
                            )}
                            {selected && (
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                                <Check className="h-8 w-8 text-white drop-shadow-lg" />
                              </div>
                            )}
                          </button>
                          <div className="flex justify-between border-t bg-white px-2 py-1 text-[10px]">
                            <span className="text-gray-500">#{idx + 1}</span>
                            {src && (
                              <a
                                href={src}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-violet-600 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                新窗口打开
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 break-all text-[10px] text-gray-400">
                    {(currentGenState.generatedImages[0]?.url || '').slice(0, 120)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={confirmImage}
                      disabled={currentGenState.selectedImages.size === 0 || saving}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#10B981] px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="h-4 w-4" /> 确认应用
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => generateFromMeta(true)}
                      disabled={currentGenState.generating}
                      className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-gray-200"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${currentGenState.generating ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Prompt editor */}
              <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
                <button
                  onClick={() => setPromptExpanded(!promptExpanded)}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[#1E293B]"
                >
                  <span>提示词编辑</span>
                  {promptExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {promptExpanded && (
                  <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-[#64748B]">预设</span>
                        <button
                          onClick={() => setShowAddPreset(true)}
                          className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-blue-700"
                        >
                          <Plus className="h-3 w-3" /> 新建
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {presets.length === 0 && (
                          <span className="text-xs text-gray-400">暂无预设</span>
                        )}
                        {presets.map((p) => (
                          <div key={p.id} className="group relative">
                            <button
                              onClick={() => applyPreset(p)}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                currentGenState.activePreset === p.id
                                  ? 'bg-[#2563EB] text-white'
                                  : 'bg-gray-100 text-[#64748B] hover:bg-gray-200'
                              }`}
                            >
                              {p.label}
                            </button>
                            <button
                              onClick={() => deletePreset(p.id)}
                              className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#64748B]">
                        正向提示词
                      </label>
                      <textarea
                        value={currentGenState.positivePrompt}
                        onChange={(e) =>
                          selectedItem &&
                          updateGenState(selectedItem.id, {
                            positivePrompt: e.target.value,
                            activePreset: null,
                          })
                        }
                        placeholder="描述你想生成的画面..."
                        className="min-h-[80px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                        rows={4}
                      />
                    </div>

                    <div>
                      <label className="mb-1 flex items-center justify-between text-xs font-medium text-[#64748B]">
                        <span>负向提示词</span>
                        <span className="font-normal text-[10px] text-amber-600">
                          FLUX 人像建议留空
                        </span>
                      </label>
                      <textarea
                        value={currentGenState.negativePrompt}
                        onChange={(e) =>
                          selectedItem &&
                          updateGenState(selectedItem.id, {
                            negativePrompt: e.target.value,
                          })
                        }
                        placeholder={
                          selectedItem?.itemCategory === 'girlfriend'
                            ? 'FLUX 人像建议留空（长负面易出黑图）'
                            : '商品类可写 person, face, blurry…'
                        }
                        className="min-h-[48px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                        rows={2}
                      />
                    </div>

                    {selectedItem.hasImage && (
                      <label className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={currentGenState.useConsistency}
                          onChange={(e) =>
                            selectedItem &&
                            updateGenState(selectedItem.id, {
                              useConsistency: e.target.checked,
                              ...(e.target.checked
                                ? {
                                    genParams: {
                                      ...currentGenState.genParams,
                                      denoise:
                                        currentGenState.genParams.denoise ?? 0.55,
                                    },
                                  }
                                : {}),
                            })
                          }
                          className="h-4 w-4 rounded border-gray-300 text-violet-600"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-[#1E293B]">
                            参考现有图保持人物一致性
                          </span>
                          <p className="text-xs text-[#64748B]">
                            img2img · denoise {currentGenState.genParams.denoise ?? 0.55}
                            （越低越像原图脸）
                          </p>
                        </div>
                      </label>
                    )}

                    {/* Metadata fields after AI fill */}
                    {currentGenState.generatedMeta && (
                      <div className="space-y-2 rounded-lg border border-gray-100 bg-[#F8FAFC] p-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                            AI 元数据（可编辑）
                          </h5>
                          <button
                            onClick={generateMetaData}
                            disabled={currentGenState.metaGenerating}
                            className="flex items-center gap-1 text-xs text-[#2563EB]"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${
                                currentGenState.metaGenerating ? 'animate-spin' : ''
                              }`}
                            />
                            重生成
                          </button>
                        </div>
                        <input
                          type="text"
                          value={currentGenState.editTitle}
                          onChange={(e) =>
                            selectedItem &&
                            updateGenState(selectedItem.id, { editTitle: e.target.value })
                          }
                          placeholder="标题"
                          className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
                        />
                        <textarea
                          value={currentGenState.editDescription}
                          onChange={(e) =>
                            selectedItem &&
                            updateGenState(selectedItem.id, {
                              editDescription: e.target.value,
                            })
                          }
                          placeholder="描述"
                          rows={2}
                          className="w-full resize-y rounded-md border border-gray-200 px-3 py-1.5 text-sm"
                        />
                        <input
                          type="text"
                          value={currentGenState.editTags}
                          onChange={(e) =>
                            selectedItem &&
                            updateGenState(selectedItem.id, { editTags: e.target.value })
                          }
                          placeholder="标签，逗号分隔"
                          className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
                        />
                        <textarea
                          value={currentGenState.editAppearance}
                          onChange={(e) =>
                            selectedItem &&
                            updateGenState(selectedItem.id, {
                              editAppearance: e.target.value,
                              positivePrompt: e.target.value,
                            })
                          }
                          placeholder="外观/绘图描述（将用于生成）"
                          rows={3}
                          className="w-full resize-y rounded-md border border-gray-200 px-3 py-1.5 text-sm"
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={generateMetaData}
                        disabled={currentGenState.metaGenerating}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2563EB] bg-white px-4 py-2.5 text-sm font-medium text-[#2563EB] hover:bg-blue-50 disabled:opacity-50"
                      >
                        {currentGenState.metaGenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> AI 生成提示词中...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4" /> AI 优化提示词
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => generateFromMeta(false)}
                        disabled={
                          currentGenState.generating ||
                          (!currentGenState.positivePrompt.trim() &&
                            !currentGenState.editAppearance.trim())
                        }
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                      >
                        {currentGenState.generating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> 绘图中...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" /> 生成图片
                          </>
                        )}
                      </button>
                    </div>

                    {currentGenState.genProgress && (
                      <p className="text-xs text-[#64748B]">{currentGenState.genProgress}</p>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="text-center text-sm text-[#64748B]">
                <ImageIcon className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-600">选择左侧条目开始管理</p>
                <p className="mt-1 text-xs text-gray-400">
                  支持 AI 绘图 · 上传 · 删除 · 提示词自动填充
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除图片？</AlertDialogTitle>
            <AlertDialogDescription>
              将清除「{deleteTarget?.name}」的图片字段
              {deleteTarget?.itemCategory === 'girlfriend' ? '（portrait / avatar）' : ''}
              ，不会删除角色/商品记录本身。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : '确认删除'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Comfy 操作台图库 — 选用生成图并应用到条目 */}
      <AlertDialog
        open={showConsoleGallery}
        onOpenChange={(o) => {
          if (!o) {
            setShowConsoleGallery(false);
            setConsoleApplyTarget(null);
          }
        }}
      >
        <AlertDialogContent className="max-h-[90vh] max-w-3xl overflow-hidden">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-violet-600" />
              操作台图库
              {consoleApplyTarget ? (
                <span className="text-sm font-normal text-gray-500">
                  → 应用到「{consoleApplyTarget.name}」
                </span>
              ) : null}
            </AlertDialogTitle>
            <AlertDialogDescription>
              选择 Comfy 操作台已生成的图片（或历史出图），一键应用到当前条目。图片会复制到
              admin 目录并写入数据库。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex items-center justify-between gap-2 py-1">
            <a
              href="/admin/comfy"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              打开 Comfy 操作台生成新图
            </a>
            <button
              type="button"
              onClick={() => consoleApplyTarget && openConsoleGallery(consoleApplyTarget)}
              disabled={consoleLoading || !consoleApplyTarget}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${consoleLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3">
            {consoleLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                加载图库…
              </div>
            ) : consoleAssets.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-gray-500">
                <ImageIcon className="h-8 w-8 text-gray-300" />
                <p>暂无可用图片</p>
                <p className="text-xs text-gray-400">请先在 Comfy 操作台生成，或本页 AI 绘图后刷新</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {consoleAssets.map((a, i) => (
                  <button
                    key={a.id || a.url || i}
                    type="button"
                    disabled={consoleApplying || !consoleApplyTarget}
                    onClick={() =>
                      consoleApplyTarget && applyImageUrlToItem(consoleApplyTarget, a.url)
                    }
                    className="group relative overflow-hidden rounded-lg border-2 border-transparent bg-white shadow-sm transition hover:border-violet-500 disabled:opacity-50"
                    title={a.prompt || a.url}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        displayImageSrc({
                          url: a.url,
                          key: a.url?.includes('/') && !a.url.startsWith('http')
                            ? a.url
                            : undefined,
                        }) || toPreviewUrl(a.url)
                      }
                      alt={`图库 ${i + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.opacity = '0.3';
                        e.currentTarget.alt = '加载失败';
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[9px] text-white opacity-0 transition group-hover:opacity-100">
                      点击应用
                      {a.kind ? ` · ${a.kind}` : ''}
                      {a.source ? ` · ${a.source}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={consoleApplying}>取消</AlertDialogCancel>
            {consoleApplying && (
              <span className="inline-flex items-center gap-1 text-xs text-violet-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在应用…
              </span>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add preset dialog */}
      <AlertDialog open={showAddPreset} onOpenChange={setShowAddPreset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>新建提示词预设</AlertDialogTitle>
            <AlertDialogDescription>保存常用正向/负向提示词，方便一键套用。</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <input
              value={newPresetLabel}
              onChange={(e) => setNewPresetLabel(e.target.value)}
              placeholder="预设名称"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
            <textarea
              value={newPresetPositive}
              onChange={(e) => setNewPresetPositive(e.target.value)}
              placeholder="正向提示词"
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
            <textarea
              value={newPresetNegative}
              onChange={(e) => setNewPresetNegative(e.target.value)}
              placeholder="负向提示词（可选）"
              rows={2}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <button
              onClick={addPreset}
              disabled={!newPresetLabel || !newPresetPositive}
              className="inline-flex items-center justify-center rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              保存
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: 'blue' | 'emerald' | 'amber' | 'rose';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  };
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colors[color]}`}>{icon}</div>
        <div>
          <p className="text-xs text-[#64748B]">{label}</p>
          <p className="text-xl font-bold text-[#1E293B]">{value}</p>
          <p className="text-[11px] text-gray-400">{sub}</p>
        </div>
      </div>
    </div>
  );
}
