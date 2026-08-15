'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, Loader2, Lock, Play, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n/context';
import type { AssetCategory, CompanionAsset } from '@/lib/companion-assets';
import { OptimizedImg } from '@/components/OptimizedImg';

export interface GroupedAssets {
  id_reference: CompanionAsset[];
  photo: CompanionAsset[];
  video: CompanionAsset[];
}

const EMPTY_GROUP: GroupedAssets = { id_reference: [], photo: [], video: [] };

/**
 * 伴侣资源库组件 —— ID参考 / 相册 / 视频 三个分类。
 *
 * canManage=true（创建者或管理员）：可上传、切换公开/私密、删除。
 * canManage=false：只读展示（仅可见资源）。
 */
export function CompanionAssetLibrary(props: {
  companionId: string;
  canManage?: boolean;
  initialAssets?: GroupedAssets | null;
  defaultTab?: AssetCategory;
  /** Lock to a single category and hide the internal tab bar (parent renders tabs). */
  hideTabs?: boolean;
  onChanged?: (assets: GroupedAssets) => void;
  className?: string;
}) {
  const {
    companionId,
    canManage = false,
    initialAssets,
    defaultTab,
    hideTabs = false,
    onChanged,
    className,
  } = props;
  const { t } = useTranslation();

  const tabs: AssetCategory[] = hideTabs && defaultTab
    ? [defaultTab]
    : canManage
      ? ['id_reference', 'photo', 'video']
      : ['photo', 'video'];
  const [tab, setTab] = useState<AssetCategory>(
    hideTabs && defaultTab
      ? defaultTab
      : defaultTab && tabs.includes(defaultTab)
        ? defaultTab
        : tabs.includes('photo')
          ? 'photo'
          : tabs[0],
  );
  const [grouped, setGrouped] = useState<GroupedAssets>(initialAssets || EMPTY_GROUP);
  const [loading, setLoading] = useState(!initialAssets);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<CompanionAsset | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const applyChange = useCallback(
    (next: GroupedAssets) => {
      setGrouped(next);
      onChanged?.(next);
    },
    [onChanged],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`/api/companion/${companionId}/assets`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const assets = Array.isArray(data.assets) ? (data.assets as CompanionAsset[]) : [];
        applyChange({
          id_reference: assets.filter((a) => a.category === 'id_reference'),
          photo: assets.filter((a) => a.category === 'photo'),
          video: assets.filter((a) => a.category === 'video'),
        });
      }
    } catch {
      /* keep current */
    } finally {
      setLoading(false);
    }
  }, [companionId, applyChange]);

  useEffect(() => {
    if (!initialAssets) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionId]);

  useEffect(() => {
    if (initialAssets) applyChange(initialAssets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssets]);

  async function addAsset(row: {
    category: AssetCategory;
    url: string;
    media_type?: 'image' | 'video';
    visibility?: 'public' | 'private';
  }) {
    const res = await authedFetch(`/api/companion/${companionId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: row.category,
        url: row.url,
        media_type: row.media_type,
        visibility:
          row.visibility || (row.category === 'id_reference' ? 'private' : 'public'),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to add asset');
    await load();
  }

  async function handleImageFiles(files: FileList | null, category: AssetCategory) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 12)) {
        if (!/^image\//.test(file.type)) continue;
        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'uploads');
        const up = await authedFetch('/api/upload', { method: 'POST', body: form });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok || !upData.url) {
          throw new Error(upData.error || `Upload failed (${up.status})`);
        }
        await addAsset({ category, url: String(upData.url), media_type: 'image' });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  }

  async function handleVideoFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('Max 50MB');
      }
      const contentType =
        file.type && file.type.startsWith('video/')
          ? file.type
          : file.name.toLowerCase().endsWith('.webm')
            ? 'video/webm'
            : 'video/mp4';

      const signRes = await authedFetch(`/api/companion/${companionId}/assets/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType }),
      });
      const signData = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(signData.error || `Sign failed (${signRes.status})`);

      const form = new FormData();
      form.append('cacheControl', '31536000');
      form.append('', file);
      const putRes = await fetch(signData.signedUrl as string, {
        method: 'PUT',
        headers: { 'x-upsert': 'true' },
        body: form,
      });
      if (!putRes.ok) {
        throw new Error(`Storage upload failed (${putRes.status})`);
      }

      await addAsset({
        category: 'video',
        url: String(signData.publicUrl),
        media_type: 'video',
        visibility: 'public',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Video upload failed');
    } finally {
      setUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  }

  async function toggleVisibility(asset: CompanionAsset) {
    const next = asset.visibility === 'public' ? 'private' : 'public';
    try {
      const res = await authedFetch(`/api/companion/${companionId}/assets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id, visibility: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to update');
      }
      applyChange({
        ...grouped,
        [asset.category]: grouped[asset.category].map((a) =>
          a.id === asset.id ? { ...a, visibility: next } : a,
        ),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    }
  }

  async function removeAsset(asset: CompanionAsset) {
    try {
      const res = await authedFetch(
        `/api/companion/${companionId}/assets?assetId=${encodeURIComponent(asset.id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to delete');
      }
      applyChange({
        ...grouped,
        [asset.category]: grouped[asset.category].filter((a) => a.id !== asset.id),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  const current = grouped[tab] || [];
  const labelOf = (c: AssetCategory) =>
    c === 'id_reference' ? t('companion.idReference') : c === 'photo' ? t('companion.album') : t('companion.videos');

  return (
    <div className={className}>
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.08]">
        {!hideTabs &&
          tabs.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setTab(c)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === c ? 'text-white' : 'text-[#8B8BA3] hover:text-white/80'
              }`}
            >
              {labelOf(c)}
              <span className="ml-1 text-[11px] text-[#8B8BA3]/70">
                {(grouped[c] || []).length}
              </span>
              {tab === c && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3]" />
              )}
            </button>
          ))}
        {hideTabs && <div className="flex-1" />}

        {canManage && (
          <div className="ml-auto flex items-center gap-1.5 pr-1 pb-1">
            {tab !== 'video' ? (
              <button
                type="button"
                disabled={uploading}
                onClick={() => imgInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                {tab === 'id_reference' ? t('companion.idReference') : t('companion.addPhoto')}
              </button>
            ) : (
              <button
                type="button"
                disabled={uploading}
                onClick={() => videoInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                {t('companion.addVideo')}
              </button>
            )}
          </div>
        )}
      </div>

      <input
        ref={imgInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => void handleImageFiles(e.target.files, tab === 'video' ? 'photo' : tab)}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => void handleVideoFile(e.target.files)}
      />

      {/* Grid */}
      <div className="pt-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-[#FF2D78]/60" />
          </div>
        ) : current.length === 0 ? (
          <p className="py-10 text-center text-xs text-[#8B8BA3]">
            {tab === 'id_reference'
              ? t('companion.emptyIdRef')
              : tab === 'photo'
                ? t('companion.emptyAlbum')
                : t('companion.emptyVideo')}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {current.map((asset) => (
              <div
                key={asset.id}
                className="group relative aspect-square overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.04]"
              >
                <button
                  type="button"
                  className="absolute inset-0"
                  onClick={() => setPreview(asset)}
                >
                  {asset.media_type === 'video' ? (
                    <>
                      { }
                      <video
                        src={asset.thumbnail_url || asset.url}
                        className="h-full w-full object-cover"
                        muted
                        preload="metadata"
                      />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="rounded-full bg-black/50 p-2">
                          <Play className="h-4 w-4 text-white" />
                        </span>
                      </span>
                    </>
                  ) : (
                    // 相册网格按需压缩（512px 档），预览弹窗仍用原图
                    <OptimizedImg
                      src={asset.url}
                      size="card"
                      alt={asset.caption || ''}
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>

                {canManage && (
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1.5 py-1 opacity-100 backdrop-blur-sm sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => void toggleVisibility(asset)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                        asset.visibility === 'public'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-white/10 text-white/70'
                      }`}
                      title={asset.visibility === 'public' ? t('companion.public') : t('companion.private')}
                    >
                      {asset.visibility === 'public' ? (
                        <Globe className="h-3 w-3" />
                      ) : (
                        <Lock className="h-3 w-3" />
                      )}
                      {asset.visibility === 'public' ? t('companion.public') : t('companion.private')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeAsset(asset)}
                      className="rounded-full p-1 text-white/60 hover:bg-rose-500/30 hover:text-rose-200 transition-colors"
                      aria-label={t('companion.delete')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setPreview(null)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {preview.media_type === 'video' ? (
             
            <video
              src={preview.url}
              className="max-h-full max-w-full rounded-2xl shadow-2xl"
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.caption || ''}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}
