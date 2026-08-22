'use client';

/**
 * WorksGallery — the selected companion's works feed with All / Images /
 * Videos / Liked filters and a lightbox viewer (like / download / reuse as
 * edit base). Every job row carries girlfriend_id, so works always stay
 * attached to the companion that created them.
 */

import { useMemo, useState } from 'react';
import { Download, Film, Heart, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import type { GalleryFilter, Girl, HistoryJob } from './types';

interface MediaItem {
  jobId: string;
  kind: 'image' | 'video';
  url: string;
}

/** Flatten one job row into displayable media (candidates fan out). */
function jobToMedia(job: HistoryJob): MediaItem[] {
  if (job.status !== 'completed' || !job.result) return [];
  const items: MediaItem[] = [];
  if (typeof job.result.video_url === 'string' && job.result.video_url) {
    items.push({ jobId: job.id, kind: 'video', url: job.result.video_url });
    return items;
  }
  const candidates = job.result.candidates;
  if (Array.isArray(candidates)) {
    for (const c of candidates as Array<{ image_url?: unknown }>) {
      if (typeof c?.image_url === 'string' && c.image_url) {
        items.push({ jobId: job.id, kind: 'image', url: c.image_url });
      }
    }
  }
  if (typeof job.result.image_url === 'string' && job.result.image_url) {
    items.push({ jobId: job.id, kind: 'image', url: job.result.image_url });
  }
  return items;
}

export function WorksGallery(props: {
  girl: Girl;
  works: HistoryJob[];
  filter: GalleryFilter;
  onFilterChange: (filter: GalleryFilter) => void;
  likedIds: Set<string>;
  onToggleLike: (jobId: string) => void;
  onUseAsBase: (url: string) => void;
  isZh: boolean;
}) {
  const { t } = useTranslation();
  const [viewer, setViewer] = useState<MediaItem | null>(null);

  const media = useMemo(() => props.works.flatMap(jobToMedia), [props.works]);

  const filtered = useMemo(() => {
    switch (props.filter) {
      case 'images':
        return media.filter((m) => m.kind === 'image');
      case 'videos':
        return media.filter((m) => m.kind === 'video');
      case 'liked':
        return media.filter((m) => props.likedIds.has(m.jobId));
      default:
        return media;
    }
  }, [media, props.filter, props.likedIds]);

  const filters: Array<{ id: GalleryFilter; label: string }> = [
    { id: 'all', label: t('generate.filterAll') },
    { id: 'images', label: t('generate.filterImages') },
    { id: 'videos', label: t('generate.filterVideos') },
    { id: 'liked', label: t('generate.filterLiked') },
  ];

  return (
    <section>
      {/* Companion header + filter tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#FD5FC2]">
            {t('generate.works')}
          </div>
          <h2 className="text-xl font-extrabold uppercase tracking-wide">{props.girl.name}</h2>
        </div>
        <div className="flex rounded-full border border-white/10 bg-[#121212] p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => props.onFilterChange(f.id)}
              className={cn(
                'h-7 px-3 rounded-full text-[11px] font-semibold transition-all',
                props.filter === f.id ? 'bg-white text-black' : 'text-[#AAAAAA] hover:text-white',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center">
          <p className="text-sm text-white/35">{t('generate.emptyWorks')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {filtered.map((item, idx) => {
            const liked = props.likedIds.has(item.jobId);
            return (
              <div
                key={`${item.jobId}-${item.url}-${idx}`}
                className="group relative aspect-[172/214] overflow-hidden rounded-lg border border-white/10 hover:border-[#FD5FC2]/50 transition-all"
              >
                <button
                  type="button"
                  onClick={() => setViewer(item)}
                  className="absolute inset-0"
                >
                  {item.kind === 'video' ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#2a0f22] to-[#12081a]">
                      <Film className="h-8 w-8 text-[#FD5FC2]/70" />
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- dynamic work thumbnail
                    <img
                      src={item.url}
                      alt="Work"
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => props.onToggleLike(item.jobId)}
                  className={cn(
                    'absolute top-1.5 right-1.5 h-7 w-7 rounded-full flex items-center justify-center bg-black/50 backdrop-blur transition-all',
                    liked ? 'text-[#FF1CAC]' : 'text-white/60 opacity-0 group-hover:opacity-100',
                  )}
                >
                  <Heart className={cn('h-3.5 w-3.5', liked && 'fill-current')} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox viewer */}
      {viewer && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
          <button
            type="button"
            aria-hidden
            onClick={() => setViewer(null)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-default"
          />
          <div className="relative max-h-[88vh] max-w-3xl w-full flex flex-col items-center gap-3">
            {viewer.kind === 'video' ? (
              <video src={viewer.url} controls autoPlay loop className="max-h-[70vh] w-full rounded-xl" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic work URL
              <img src={viewer.url} alt="Work" className="max-h-[70vh] w-auto rounded-xl object-contain" />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => props.onToggleLike(viewer.jobId)}
                className={cn(
                  'h-10 px-4 rounded-full inline-flex items-center gap-2 text-xs font-semibold border transition-all',
                  props.likedIds.has(viewer.jobId)
                    ? 'border-[#FF1CAC]/60 bg-[#FF1CAC]/15 text-[#FF9BD4]'
                    : 'border-white/15 text-white/70 hover:text-white',
                )}
              >
                <Heart className={cn('h-4 w-4', props.likedIds.has(viewer.jobId) && 'fill-current')} />
                {t('generate.filterLiked')}
              </button>
              <a
                href={viewer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-4 rounded-full inline-flex items-center gap-2 text-xs font-semibold border border-white/15 text-white/70 hover:text-white transition-all"
              >
                <Download className="h-4 w-4" /> {t('generate.download')}
              </a>
              {viewer.kind === 'image' && (
                <button
                  type="button"
                  onClick={() => {
                    props.onUseAsBase(viewer.url);
                    setViewer(null);
                  }}
                  className="h-10 px-4 rounded-full inline-flex items-center gap-2 text-xs font-bold text-white transition-all"
                  style={{ background: 'linear-gradient(0deg, #FF1CAC, #FD5FC2 50%, #FF79D1)' }}
                >
                  <Wand2 className="h-4 w-4" /> {t('generate.useAsBase')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewer(null)}
                className="h-10 w-10 rounded-full flex items-center justify-center border border-white/15 text-white/70 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
