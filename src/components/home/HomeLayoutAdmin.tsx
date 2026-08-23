'use client';

/**
 * Homepage layout admin panel (in-page, admin-only).
 *
 * Admins probing GET /api/admin/home-layout get a floating "Page layout"
 * button; the panel lets them drag sections to reorder, toggle visibility,
 * swap section artwork and restore defaults. Non-admins see nothing.
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  LayoutGrid, X, GripVertical, Eye, EyeOff, Image as ImageIcon,
  Trash2, RotateCcw, Loader2, ChevronUp, ChevronDown, Type, FolderOpen, Check, Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { useTranslation } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/types';
import { cn } from '@/lib/utils';
import type { HomeLayoutConfig, HomeSectionConfig, HomeSectionId } from '@/lib/home-layout-store';
import type { CopyKey } from '@/lib/copy-store';
import { COPY_META } from '@/lib/copy-store';
import type { AssetItem } from '@/lib/asset-library-store';
import { invalidateSettingsCache } from '@/hooks/useSiteSettings';

const IMAGE_SECTIONS: readonly HomeSectionId[] = ['adsBanner', 'hero', 'promo'];

/** Section → editable site-copy keys (hero owns four fields, adsBanner owns the overlay copy). */
const SECTION_COPY_KEYS: Partial<Record<HomeSectionId, CopyKey[]>> = {
  hero: ['heroTitleLead', 'heroTitleRest', 'heroTaglineLead', 'heroTaglineRest'],
  announcement: [],
  liveRail: ['liveTitle'],
  guestStrip: ['guestTitle', 'guestCta'],
  hotGrid: ['hotTitle'],
  leaderboard: ['leaderboardTitle'],
  modules: ['modulesTitle'],
  promo: ['promoTopupTitle', 'promoQuestTitle'],
  adsBanner: ['bannerBadge', 'bannerTitle', 'bannerSub', 'bannerChip1', 'bannerChip2', 'bannerChip3', 'bannerCta'],
};

interface LayoutResponse {
  layout?: HomeLayoutConfig;
  image?: string;
}

interface CopyResponse {
  copy?: Partial<Record<CopyKey, string>>;
}

export function HomeLayoutAdmin({
  onLayoutChange,
}: {
  onLayoutChange: (layout: HomeLayoutConfig) => void;
}) {
  const { t } = useTranslation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<HomeSectionConfig[]>([]);
  const [bannerImage, setBannerImage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<HomeSectionId | null>(null);
  // In-place copy editing state
  const [copyKey, setCopyKey] = useState<CopyKey | null>(null);
  const [copyDrafts, setCopyDrafts] = useState<Record<string, string>>({});
  const [copySaved, setCopySaved] = useState<Record<string, string>>({});
  // Asset library picker state
  const [pickerTarget, setPickerTarget] = useState<HomeSectionId | null>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  // Banner ad link editor state (first banner row in admin_ads)
  const [bannerAd, setBannerAd] = useState<{ id: string; link_url: string } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    // Admin probe — doubles as layout load.
    authedFetch('/api/admin/home-layout')
      .then(async (r) => {
        if (!r.ok) return;
        const data = await readResponseJson<LayoutResponse>(r);
        if (cancelled) return;
        setIsAdmin(true);
        if (data?.layout?.sections?.length) {
          setSections(data.layout.sections);
          onLayoutChange(data.layout);
        }
      })
      .catch(() => {
        /* not an admin — no entry point */
      });
    // Current banner artwork (admin_ads) for the adsBanner row thumbnail.
    fetch('/api/ads?position=banner')
      .then((r) => r.json())
      .then((data: { ads?: { id?: string; image_url?: string; link_url?: string | null }[] }) => {
        if (cancelled) return;
        const first = (data.ads || [])[0];
        if (first?.image_url) setBannerImage(first.image_url);
        if (first?.id) setBannerAd({ id: first.id, link_url: first.link_url || '' });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [onLayoutChange]);

  const applyLayout = useCallback(
    (layout: HomeLayoutConfig | undefined) => {
      if (!layout?.sections?.length) return;
      setSections(layout.sections);
      onLayoutChange(layout);
    },
    [onLayoutChange],
  );

  const saveSections = useCallback(
    async (next: HomeSectionConfig[]) => {
      setSections(next);
      try {
        const res = await authedFetch('/api/admin/home-layout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sections: next }),
        });
        const data = await readResponseJson<LayoutResponse>(res);
        if (!res.ok) throw new Error((data as { error?: string })?.error || 'save failed');
        applyLayout(data.layout);
        toast.success(t('homeLayout.saved'));
      } catch {
        toast.error(t('homeLayout.saveFailed'));
      }
    },
    [applyLayout, t],
  );

  const move = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= sections.length || from === to) return;
      const next = [...sections];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      void saveSections(next);
    },
    [sections, saveSections],
  );

  const toggleVisible = useCallback(
    (id: HomeSectionId) => {
      void saveSections(sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)));
    },
    [sections, saveSections],
  );

  const pickImage = useCallback((id: HomeSectionId) => {
    uploadTargetRef.current = id;
    fileInputRef.current?.click();
  }, []);

  const handleFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      const target = uploadTargetRef.current;
      if (!file || !target) return;
      setBusy(target);
      try {
        const fd = new FormData();
        fd.append('section', target);
        fd.append('file', file);
        const res = await authedFetch('/api/admin/home-layout', { method: 'POST', body: fd });
        const data = await readResponseJson<LayoutResponse>(res);
        if (!res.ok) throw new Error((data as { error?: string })?.error || 'upload failed');
        if (target === 'adsBanner') setBannerImage(data.image || '');
        applyLayout(data.layout);
        toast.success(t('homeLayout.saved'));
      } catch {
        toast.error(t('homeLayout.saveFailed'));
      } finally {
        setBusy(null);
      }
    },
    [applyLayout, t],
  );

  const removeImage = useCallback(
    async (id: HomeSectionId) => {
      setBusy(id);
      try {
        const res = await authedFetch(`/api/admin/home-layout?section=${id}`, { method: 'DELETE' });
        const data = await readResponseJson<LayoutResponse>(res);
        if (!res.ok) throw new Error((data as { error?: string })?.error || 'remove failed');
        applyLayout(data.layout);
        toast.success(t('homeLayout.saved'));
      } catch {
        toast.error(t('homeLayout.saveFailed'));
      } finally {
        setBusy(null);
      }
    },
    [applyLayout, t],
  );

  const resetDefaults = useCallback(async () => {
    setBusy('__reset');
    try {
      const res = await authedFetch('/api/admin/home-layout?reset=1', { method: 'DELETE' });
      const data = await readResponseJson<LayoutResponse>(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error || 'reset failed');
      applyLayout(data.layout);
      toast.success(t('homeLayout.resetDone'));
    } catch {
      toast.error(t('homeLayout.saveFailed'));
    } finally {
      setBusy(null);
    }
  }, [applyLayout, t]);

  // ── In-place copy editing ────────────────────────────
  const openCopyEditor = useCallback(async (id: HomeSectionId) => {
    const keys = SECTION_COPY_KEYS[id] || [];
    if (!keys.length) return;
    setBusy(`copy:${id}`);
    try {
      const res = await authedFetch('/api/admin/copy');
      const data = await readResponseJson<CopyResponse>(res);
      if (!res.ok) throw new Error((data as unknown as { error?: string })?.error || 'load failed');
      const copy = data.copy || {};
      const drafts: Record<string, string> = {};
      const saved: Record<string, string> = {};
      for (const k of keys) {
        drafts[k] = copy[k] || '';
        saved[k] = copy[k] || '';
      }
      setCopyDrafts(drafts);
      setCopySaved(saved);
      setCopyKey(keys[0]);
    } catch {
      toast.error(t('homeLayout.saveFailed'));
    } finally {
      setBusy(null);
    }
  }, [t]);

  const saveCopyDrafts = useCallback(async () => {
    const keys = Object.keys(copyDrafts);
    if (!keys.length) return;
    setBusy('__copy');
    try {
      for (const key of keys) {
        const res = await authedFetch('/api/admin/copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: (copyDrafts[key] || '').trim() }),
        });
        const data = await readResponseJson<CopyResponse>(res);
        if (!res.ok) throw new Error((data as unknown as { error?: string })?.error || 'save failed');
      }
      invalidateSettingsCache();
      setCopyKey(null);
      toast.success(t('homeLayout.saved'));
    } catch {
      toast.error(t('homeLayout.saveFailed'));
    } finally {
      setBusy(null);
    }
  }, [copyDrafts, t]);

  const restoreCopyDefaults = useCallback(async () => {
    const keys = Object.keys(copyDrafts);
    if (!keys.length) return;
    setBusy('__copyReset');
    try {
      for (const key of keys) {
        const res = await authedFetch(`/api/admin/copy?key=${key}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('reset failed');
      }
      invalidateSettingsCache();
      setCopyDrafts({});
      setCopySaved({});
      setCopyKey(null);
      toast.success(t('homeLayout.resetDone'));
    } catch {
      toast.error(t('homeLayout.saveFailed'));
    } finally {
      setBusy(null);
    }
  }, [copyDrafts, t]);

  // ── Asset library picker ─────────────────────────────
  const openPicker = useCallback(async (id: HomeSectionId) => {
    setPickerTarget(id);
    setAssetsLoading(true);
    try {
      const res = await authedFetch('/api/admin/asset-library');
      const data = await readResponseJson<{ items?: AssetItem[] }>(res);
      if (!res.ok) throw new Error((data as { error?: string })?.error || 'load failed');
      setAssets(data.items || []);
    } catch {
      toast.error(t('homeLayout.saveFailed'));
      setPickerTarget(null);
    } finally {
      setAssetsLoading(false);
    }
  }, [t]);

  const applyLibraryImage = useCallback(
    async (url: string) => {
      const target = pickerTarget;
      if (!target || !url) return;
      setBusy(target);
      setPickerTarget(null);
      try {
        if (target === 'adsBanner') {
          // Banner artwork lives in admin_ads — swap the first banner row.
          const listRes = await authedFetch('/api/admin/ads');
          const listData = await readResponseJson<{ ads?: { id: string; position: string }[] }>(listRes);
          const first = (listData.ads || []).find((a) => a.position === 'banner');
          if (first) {
            const res = await authedFetch('/api/admin/ads', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: first.id, image_url: url }),
            });
            if (!res.ok) throw new Error('banner update failed');
          }
          setBannerImage(url);
          invalidateSettingsCache();
        } else {
          const res = await authedFetch('/api/admin/home-layout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sections: sections.map((s) =>
                s.id === target ? { ...s, image: url } : s,
              ),
            }),
          });
          const data = await readResponseJson<LayoutResponse>(res);
          if (!res.ok) throw new Error((data as { error?: string })?.error || 'save failed');
          applyLayout(data.layout);
        }
        toast.success(t('homeLayout.saved'));
      } catch {
        toast.error(t('homeLayout.saveFailed'));
      } finally {
        setBusy(null);
      }
    },
    [pickerTarget, sections, applyLayout, t],
  );

  // ── Banner ad link editor ───────────────────────────
  const openLinkEditor = useCallback(() => {
    if (!bannerAd) return;
    setLinkDraft(bannerAd.link_url);
    setLinkOpen(true);
  }, [bannerAd]);

  const saveLinkDraft = useCallback(async () => {
    if (!bannerAd) return;
    setBusy('__link');
    try {
      const res = await authedFetch('/api/admin/ads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bannerAd.id, link_url: linkDraft.trim() || null }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || 'save failed');
      setBannerAd({ ...bannerAd, link_url: linkDraft.trim() });
      invalidateSettingsCache();
      setLinkOpen(false);
      toast.success(t('homeLayout.saved'));
    } catch {
      toast.error(t('homeLayout.saveFailed'));
    } finally {
      setBusy(null);
    }
  }, [bannerAd, linkDraft, t]);

  if (!isAdmin) return null;

  const thumbnailOf = (s: HomeSectionConfig): string =>
    s.id === 'adsBanner' ? bannerImage : s.image;

  return (
    <>
      {/* Floating entry (admin only) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-3 sm:bottom-6 sm:right-6 z-40 flex h-11 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-4 text-xs font-bold text-white shadow-[0_4px_20px_rgba(255,45,120,0.45)] active:scale-95 transition-transform"
        aria-label={t('homeLayout.title')}
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden sm:inline">{t('homeLayout.title')}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-white/10 bg-[#0d0a14]/95 backdrop-blur-xl"
            role="dialog"
            aria-label={t('homeLayout.title')}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-[#ff6ba6]" />
                <h2 className="text-sm font-black">{t('homeLayout.title')}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void resetDefaults()}
                  disabled={busy !== null}
                  className="flex h-8 items-center gap-1 rounded-full border border-white/15 px-2.5 text-[11px] text-white/70 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50"
                >
                  {busy === '__reset' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  {t('homeLayout.reset')}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label={t('homeLayout.close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <p className="px-4 pt-3 text-[11px] leading-relaxed text-white/45">{t('homeLayout.hint')}</p>

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {sections.map((s, i) => {
                const label = t(`homeLayout.section.${s.id}` as TranslationKey);
                const thumb = thumbnailOf(s);
                const canImage = IMAGE_SECTIONS.includes(s.id);
                const copyKeys = SECTION_COPY_KEYS[s.id] || [];
                const rowBusy = busy === s.id;
                return (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={(e) => {
                      setDragIdx(i);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (overIdx !== i) setOverIdx(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null) move(dragIdx, i);
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                    className={cn(
                      'rounded-xl border border-white/10 bg-white/[0.04] p-2.5 transition-all',
                      dragIdx === i && 'opacity-50 ring-1 ring-[#ff2e88]/60',
                      overIdx === i && dragIdx !== null && dragIdx !== i && 'border-[#ff2e88]/70',
                      !s.visible && 'opacity-55',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="cursor-grab text-white/30 active:cursor-grabbing" aria-hidden>
                        <GripVertical className="h-4 w-4" />
                      </span>
                      {thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */
                        <img src={thumb} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                          <ImageIcon className="h-3.5 w-3.5 text-white/25" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{label}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <RowBtn
                          title={t('homeLayout.moveUp')}
                          disabled={i === 0}
                          onClick={() => move(i, i - 1)}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </RowBtn>
                        <RowBtn
                          title={t('homeLayout.moveDown')}
                          disabled={i === sections.length - 1}
                          onClick={() => move(i, i + 1)}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </RowBtn>
                        {canImage && (
                          <RowBtn
                            title={t('homeLayout.uploadImage')}
                            disabled={rowBusy}
                            onClick={() => pickImage(s.id)}
                            hoverAccent
                          >
                            {rowBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5" />
                            )}
                          </RowBtn>
                        )}
                        {canImage && s.id !== 'adsBanner' && s.image && (
                          <RowBtn
                            title={t('homeLayout.removeImage')}
                            disabled={rowBusy}
                            onClick={() => void removeImage(s.id)}
                            danger
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </RowBtn>
                        )}
                        {canImage && (
                          <RowBtn
                            title={t('homeLayout.pickFromLibrary')}
                            disabled={rowBusy || assetsLoading}
                            onClick={() => void openPicker(s.id)}
                            hoverAccent
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                          </RowBtn>
                        )}
                        {s.id === 'adsBanner' && bannerAd && (
                          <RowBtn
                            title={t('homeLayout.editLink')}
                            disabled={busy === '__link'}
                            onClick={openLinkEditor}
                            hoverAccent
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </RowBtn>
                        )}
                        {copyKeys.length > 0 && (
                          <RowBtn
                            title={t('homeLayout.editCopy')}
                            disabled={busy === `copy:${s.id}`}
                            onClick={() => void openCopyEditor(s.id)}
                            hoverAccent
                          >
                            {busy === `copy:${s.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Type className="h-3.5 w-3.5" />
                            )}
                          </RowBtn>
                        )}
                        <RowBtn
                          title={s.visible ? t('homeLayout.visible') : t('homeLayout.hidden')}
                          onClick={() => toggleVisible(s.id)}
                        >
                          {s.visible ? (
                            <Eye className="h-3.5 w-3.5 text-emerald-300" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5 text-white/40" />
                          )}
                        </RowBtn>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void handleFile(e)}
          />

          {/* In-place copy editor */}
          {copyKey !== null && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={() => setCopyKey(null)}
            >
              <div
                className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0a14] p-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={t('homeLayout.editCopy')}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Type className="h-4 w-4 text-[#ff6ba6]" />
                    <h3 className="text-sm font-black">{t('homeLayout.editCopy')}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCopyKey(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label={t('homeLayout.close')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  {(Object.keys(copyDrafts) as CopyKey[]).map((key) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-[11px] text-white/55">
                        {COPY_META[key]?.label || key}
                      </span>
                      <input
                        value={copyDrafts[key] || ''}
                        onChange={(e) =>
                          setCopyDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder={t('homeLayout.copyPlaceholder')}
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#ff2e88]/60"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void restoreCopyDefaults()}
                    disabled={busy !== null || !Object.values(copySaved).some(Boolean)}
                    className="flex h-8 items-center gap-1 rounded-full border border-white/15 px-2.5 text-[11px] text-white/70 transition-colors hover:border-white/30 hover:text-white disabled:opacity-40"
                  >
                    {busy === '__copyReset' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    {t('homeLayout.reset')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCopyDrafts()}
                    disabled={busy !== null}
                    className="flex h-8 items-center gap-1 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-4 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    {busy === '__copy' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    {t('homeLayout.save')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Banner ad link editor */}
          {linkOpen && bannerAd && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={() => setLinkOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0a14] p-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={t('homeLayout.editLink')}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-[#ff6ba6]" />
                    <h3 className="text-sm font-black">{t('homeLayout.editLink')}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLinkOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label={t('homeLayout.close')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-white/55">{t('homeLayout.linkLabel')}</span>
                  <input
                    value={linkDraft}
                    onChange={(e) => setLinkDraft(e.target.value)}
                    placeholder={t('homeLayout.linkPlaceholder')}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#ff2e88]/60"
                  />
                </label>
                <div className="mt-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => void saveLinkDraft()}
                    disabled={busy !== null}
                    className="flex h-8 items-center gap-1 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-4 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    {busy === '__link' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    {t('homeLayout.save')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Asset library picker */}
          {pickerTarget !== null && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={() => setPickerTarget(null)}
            >
              <div
                className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#0d0a14] p-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={t('homeLayout.pickFromLibrary')}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-[#ff6ba6]" />
                    <h3 className="text-sm font-black">{t('homeLayout.pickFromLibrary')}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerTarget(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label={t('homeLayout.close')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {assetsLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-white/50" />
                  </div>
                ) : assets.length === 0 ? (
                  <p className="py-10 text-center text-xs text-white/45">
                    {t('homeLayout.libraryEmpty')}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5 overflow-y-auto sm:grid-cols-4">
                    {assets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        title={asset.name}
                        onClick={() => void applyLibraryImage(asset.url)}
                        className="group relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-white/10 transition-all hover:ring-2 hover:ring-[#ff2e88]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- admin asset thumbnail */}
                        <img
                          src={asset.url}
                          alt={asset.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function RowBtn({
  title,
  disabled,
  onClick,
  hoverAccent,
  danger,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  hoverAccent?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-lg text-white/55 transition-colors disabled:opacity-30',
        danger
          ? 'hover:bg-red-500/20 hover:text-red-300'
          : hoverAccent
            ? 'hover:bg-[#ff2e88]/20 hover:text-[#ff6ba6]'
            : 'hover:bg-white/10 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}
