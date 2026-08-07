'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Flame,
  Heart,
  Loader2,
  Lock,
  MessageCircle,
  Play,
  Sparkles,
  Square,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import {
  CompanionAssetLibrary,
  type GroupedAssets,
} from '@/components/companion/CompanionAssetLibrary';
import type { AssetCategory } from '@/lib/companion-assets';

interface ProfileData {
  girlfriend: Record<string, unknown>;
  access: {
    isOwner: boolean;
    isAdmin: boolean;
    canManage: boolean;
    isPublished: boolean;
    friendId: string | null;
  };
  assets: GroupedAssets;
  counts: { id_reference: number; photo: number; video: number };
}

type TabKey = 'profile' | 'album' | 'video' | 'id_reference';

export default function CompanionProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || '';
  const router = useRouter();
  const { user } = useAuth();
  const { t, locale } = useTranslation();

  const [data, setData] = useState<ProfileData | null>(null);
  const [httpStatus, setHttpStatus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('album');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [playingGreeting, setPlayingGreeting] = useState(false);
  const greetingAudioRef = useRef<HTMLAudioElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/companion/${id}`);
      setHttpStatus(res.status);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setData(json as ProfileData);
      }
    } catch {
      setHttpStatus(500);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]/70" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0a0a0f] px-6 text-center">
        <Lock className="h-8 w-8 text-[#8B8BA3]/50" />
        <p className="text-sm text-[#8B8BA3]">
          {httpStatus === 404
            ? t('companion.notFound')
            : t('companion.private')}
        </p>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full bg-white/[0.06] px-4 py-2 text-xs text-white/80 hover:bg-white/[0.1]"
        >
          {t('general.back')}
        </button>
      </div>
    );
  }

  const g = data.girlfriend;

  const gfCard = (g.character_card && typeof g.character_card === 'object')
    ? g.character_card as Record<string, unknown>
    : {};
  const gfGreeting = gfCard.greeting && typeof gfCard.greeting === 'object'
    ? gfCard.greeting as Record<string, unknown>
    : null;
  const zhUi = String(locale || '').toLowerCase().startsWith('zh');
  const greetingText = gfGreeting
    ? String(gfGreeting[zhUi ? 'text_zh' : 'text_en'] || gfGreeting.text_zh || gfGreeting.text_en || '')
    : '';
  const greetingAudio = gfGreeting ? String(gfGreeting.audio_url || '') : '';
  const { access } = data;
  const name = String(g.name || 'Companion');
  const age = g.age ? Number(g.age) : null;
  const avatar =
    (g.avatar_url as string) ||
    (g.portrait_url as string) ||
    (g.image_url as string) ||
    (g.card_url as string) ||
    null;
  const tags = Array.isArray(g.tags) ? (g.tags as string[]) : [];
  const reviewStatus = String(g.review_status || 'draft');
  const rejectionReason = String(g.rejection_reason || '');

  const handleChat = async () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/companion/${id}`)}`);
      return;
    }
    if (access.friendId) {
      router.push(`/chat/${access.friendId}`);
      return;
    }
    // Add friend first, then enter chat
    setAdding(true);
    try {
      const res = await authedFetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: g.slug }),
      });
      const json = await res.json().catch(() => ({}));
      const friend =
        (json as { friend?: { id: string } }).friend ||
        (json as { girlfriend?: { id: string } }).girlfriend;
      if (res.ok && friend?.id) {
        setAdded(true);
        router.push(`/chat/${friend.id}`);
        return;
      }
      const code = (json as { code?: string }).code;
      if (code === 'SEAT_LIMIT') {
        toast.error(t('girlfriend.seatLimit'), {
          description: t('girlfriend.seatLimitDesc'),
          action: { label: t('common.goShop'), onClick: () => router.push('/pricing') },
        });
      } else {
        toast.error((json as { error?: string }).error || 'Could not open chat');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setAdding(false);
    }
  };

  const togglePublish = async () => {
    const withdrawing = reviewStatus === 'pending';
    const confirmed = withdrawing
      ? window.confirm(
          t('chats.withdrawConfirm', { name }),
        )
      : window.confirm(
          t('chats.publishConfirm', { name }),
        );
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/girlfriends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withdrawing
            ? { id, review_status: 'draft' }
            : { id, review_status: 'pending', submitted_at: new Date().toISOString() },
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((json as { error?: string }).error || 'Submit failed');
        return;
      }
      toast.success(
        withdrawing
          ? t('chats.submissionWithdrawn')
          : t('chats.submittedForReview'),
      );
      await load();
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'profile', label: t('companion.profile') },
    { key: 'album', label: t('companion.album'), count: data.counts.photo },
    { key: 'video', label: t('companion.videos'), count: data.counts.video },
  ];
  if (access.canManage) {
    tabs.push({
      key: 'id_reference',
      label: t('companion.idReference'),
      count: data.counts.id_reference,
    });
  }

  const onAssetsChanged = (next: GroupedAssets) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            assets: next,
            counts: {
              id_reference: next.id_reference.length,
              photo: next.photo.length,
              video: next.video.length,
            },
          }
        : prev,
    );
  };

  const infoRows: { label: string; value: string }[] = [
    { label: t('companion.occupation'), value: String(g.occupation || '') },
    { label: t('companion.relationship'), value: String(g.relationship || '') },
    { label: t('companion.hobbies'), value: String(g.hobbies || '') },
  ].filter((r) => r.value.trim()) as { label: string; value: string }[];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="mx-auto max-w-3xl px-4 pb-28 pt-4 sm:pt-6">
        {/* Top bar */}
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="glass flex h-10 w-10 items-center justify-center rounded-full text-[#ffb3cd] hover:text-white active:scale-95 transition-all"
            aria-label={t('general.back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-white/90 truncate">{name}</span>
        </div>

        {/* Hero */}
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-gradient-to-br from-[#FF2D78] to-[#8b5cf6] p-[3px]">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt={name}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#1a1024]">
                  <Heart className="h-8 w-8 text-[#FF2D78]/50" />
                </div>
              )}
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#0a0a0f] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FF6BA6] ring-1 ring-[#FF2D78]/40">
              {String(g.rarity || 'R')}
            </span>
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <h1 className="text-xl sm:text-2xl font-bold truncate">
              {name}
              {age ? <span className="ml-1.5 text-base font-normal text-white/50">{age}</span> : null}
            </h1>
            <p className="mt-0.5 text-xs text-white/45 truncate">
              {[g.occupation, g.relationship].filter(Boolean).join(' · ') || `@${String(g.slug || '')}`}
            </p>
            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-white/70">
              {String(g.short_description || g.personality || '')}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-5 border-y border-white/[0.06] py-3 text-center">
          <div className="flex-1">
            <p className="text-base font-bold tabular-nums">{data.counts.photo + data.counts.video}</p>
            <p className="text-[11px] text-white/40">{t('companion.posts')}</p>
          </div>
          <div className="flex-1">
            <p className="flex items-center justify-center gap-1 text-base font-bold tabular-nums">
              <Flame className="h-3.5 w-3.5 text-[#FF6BA6]" />
              {Number(g.hot_score ?? 0)}
            </p>
            <p className="text-[11px] text-white/40">{t('companion.heat')}</p>
          </div>
          <div className="flex-1">
            <p className="text-base font-bold tabular-nums">{Number(g.base_intimacy ?? 0)}</p>
            <p className="text-[11px] text-white/40">{t('companion.initialIntimacy')}</p>
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 8).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-white/60"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Owner review status banner */}
        {access.isOwner && !access.isPublished && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-xs ${
              reviewStatus === 'pending'
                ? 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20'
                : reviewStatus === 'rejected'
                  ? 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20'
                  : 'bg-white/[0.04] text-white/60 ring-1 ring-white/[0.08]'
            }`}
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <div className="flex-1">
              {reviewStatus === 'pending'
                ? t('companion.reviewPending')
                : reviewStatus === 'rejected'
                  ? `${t('companion.reviewRejected')}${rejectionReason ? `：${rejectionReason}` : ''}`
                  : t('companion.reviewDraft')}
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="mt-4 flex gap-2.5">
          {access.isOwner ? (
            <button
              type="button"
              disabled={submitting || access.isPublished}
              onClick={() => void togglePublish()}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#FF2D78] to-[#C026D3] py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {submitting ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : access.isPublished ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4" />
                  {t('companion.published')}
                </span>
              ) : reviewStatus === 'pending' ? (
                t('companion.withdraw')
              ) : (
                t('companion.publish')
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={adding}
                onClick={() => void handleChat()}
                className="flex-1 rounded-xl bg-gradient-to-r from-[#FF2D78] to-[#C026D3] py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-all"
              >
                {adding ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="h-4 w-4" />
                    {t('companion.chatNow')}
                  </span>
                )}
              </button>
              {!access.friendId && (
                <button
                  type="button"
                  disabled={adding || added}
                  onClick={() => void handleChat()}
                  className="glass flex-1 rounded-xl py-3 text-sm font-medium text-white/85 hover:text-white transition-all"
                >
                  {added ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-emerald-400" />
                      {t('companion.added')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <UserPlus className="h-4 w-4" />
                      {t('companion.addFriend')}
                    </span>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-6 flex items-center gap-1 border-b border-white/[0.08]">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === tb.key ? 'text-white' : 'text-[#8B8BA3] hover:text-white/80'
              }`}
            >
              {tb.label}
              {typeof tb.count === 'number' && (
                <span className="ml-1 text-[11px] text-[#8B8BA3]/70">{tb.count}</span>
              )}
              {tab === tb.key && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3]" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'profile' && (
          <div className="space-y-4 pt-4">
            {(greetingText || greetingAudio) && (
              <section className="rounded-2xl bg-gradient-to-br from-[#ff2e88]/10 to-[#a855f7]/5 p-4 ring-1 ring-[#ff2e88]/20">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FF6BA6]">
                    {t('companion.openingLine')}
                  </h3>
                  {greetingAudio && (
                    <button
                      type="button"
                      onClick={() => {
                        const a = greetingAudioRef.current;
                        if (!a) return;
                        if (playingGreeting) {
                          a.pause();
                          a.currentTime = 0;
                          setPlayingGreeting(false);
                        } else {
                          void a.play();
                          setPlayingGreeting(true);
                        }
                      }}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#FF2D78]/15 border border-[#FF2D78]/30 text-[11px] font-medium text-[#ff9ec4] hover:bg-[#FF2D78]/25 transition-all"
                    >
                      {playingGreeting ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      {playingGreeting ? t('companion.stop') : t('companion.play')}
                    </button>
                  )}
                </div>
                {greetingText && (
                  <p className="mt-2 text-[13px] leading-relaxed text-white/80">{greetingText}</p>
                )}
                {greetingAudio && (
                  <audio
                    ref={greetingAudioRef}
                    src={greetingAudio}
                    onEnded={() => setPlayingGreeting(false)}
                    className="hidden"
                  />
                )}
              </section>
            )}
            {String(g.personality || '') && (
              <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[#FF6BA6]">
                  {t('companion.personality')}
                </h3>
                <p className="text-[13px] leading-relaxed text-white/75">
                  {String(g.personality)}
                </p>
              </section>
            )}
            {String(g.backstory || '') && (
              <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[#FF6BA6]">
                  {t('companion.about')}
                </h3>
                <p className="text-[13px] leading-relaxed text-white/75">{String(g.backstory)}</p>
              </section>
            )}
            {infoRows.length > 0 && (
              <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                <div className="space-y-2.5">
                  {infoRows.map((row) => (
                    <div key={row.label} className="flex items-start gap-3 text-[13px]">
                      <span className="w-20 shrink-0 text-white/40">{row.label}</span>
                      <span className="text-white/75">{row.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'album' && (
          <CompanionAssetLibrary
            companionId={id}
            canManage={access.canManage}
            initialAssets={data.assets}
            defaultTab="photo"
            hideTabs
            onChanged={onAssetsChanged}
            className="pt-2"
          />
        )}

        {tab === 'video' && (
          <CompanionAssetLibrary
            companionId={id}
            canManage={access.canManage}
            initialAssets={data.assets}
            defaultTab="video"
            hideTabs
            onChanged={onAssetsChanged}
            className="pt-2"
          />
        )}

        {tab === 'id_reference' && access.canManage && (
          <CompanionAssetLibrary
            companionId={id}
            canManage
            initialAssets={data.assets}
            defaultTab="id_reference"
            hideTabs
            onChanged={onAssetsChanged}
            className="pt-2"
          />
        )}
      </div>
    </div>
  );
}
