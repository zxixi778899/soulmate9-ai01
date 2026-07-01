'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/context';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { authedFetch } from '@/lib/supabase';
import {
  Plus,
  Heart,
  Lock,
  Globe,
  Clock,
  XCircle,
  Loader2,
  Sparkles,
  MessagesSquare,
  UserPlus,
  Trash2,
  ImagePlus,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Girlfriend {
  id: string;
  name: string;
  age: number;
  personality: string;
  tags: string[];
  avatar_url: string | null;
  portrait_url?: string | null;
  image_url?: string | null;
  review_status: string;
  is_public: boolean;
  slug: string | null;
  character_card: any;
  created_at: string;
  apperance_hair_color?: string;
  apperance_hair?: string;
  apperance_style?: string;
}

export default function GalleryPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [girlfriends, setGirlfriends] = useState<Girlfriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Girlfriend | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchGirlfriends = async () => {
    try {
      const res = await authedFetch('/api/girlfriends');
      const data = await res.json();
      setGirlfriends(data.girlfriends || []);
    } catch (e) {
      console.error('Failed to fetch girlfriends', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGirlfriends();
  }, []);

  const togglePublic = async (gf: Girlfriend) => {
    setTogglingId(gf.id);
    try {
      const newStatus = gf.review_status === 'draft' ? 'pending' : 'draft';
      const res = await authedFetch(`/api/girlfriends`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gf.id, review_status: newStatus }),
      });
      if (res.ok) {
        setGirlfriends((prev) =>
          prev.map((g) =>
            g.id === gf.id ? { ...g, review_status: newStatus } : g
          )
        );
      }
    } catch (e) {
      console.error('Toggle failed', e);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await authedFetch('/api/girlfriends', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (res.ok) {
        setGirlfriends((prev) => prev.filter((g) => g.id !== deleteTarget.id));
        toast.success(t('gallery.deleteSuccess', { name: deleteTarget.name }));
      } else {
        const data = await res.json();
        toast.error(data.error || t('gallery.deleteFailed'));
      }
    } catch (e) {
      toast.error(t('gallery.deleteFailed'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const getReviewBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return { label: t('gallery.statusDraft'), icon: Lock, class: 'bg-muted text-muted-foreground' };
      case 'pending':
        return { label: t('gallery.statusPending'), icon: Clock, class: 'bg-amber-500/15 text-amber-500' };
      case 'approved':
        return { label: t('gallery.statusApproved'), icon: Globe, class: 'bg-green-500/15 text-green-500' };
      case 'rejected':
        return { label: t('gallery.statusRejected'), icon: XCircle, class: 'bg-red-500/15 text-red-500' };
      default:
        return { label: status, icon: Lock, class: 'bg-muted text-muted-foreground' };
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 p-4 sm:p-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-[320px] w-full rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#0E0E1A]/80 px-4 sm:px-8 py-5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold italic bg-gradient-to-r from-white via-[#FFB3CD] to-[#FF6BA6] bg-clip-text text-transparent">{t('gallery.title')}</h1>
            <p className="mt-0.5 text-sm text-[#8B8BA3]">
              {t('gallery.companionCount', { count: girlfriends.length })}
            </p>
          </div>
          <Button onClick={() => router.push('/create')} variant="glow" className="gap-2">
            <Plus className="h-4 w-4" />
            {t('gallery.createNew')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 sm:p-8">
        {girlfriends.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FF2D78]/10 ring-1 ring-[#FF2D78]/20">
              <Heart className="h-10 w-10 text-[#FF2D78]" />
            </div>
            <div className="text-center">
              <h2 className="font-display text-2xl font-semibold italic">{t('gallery.empty')}</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">{t('gallery.emptyDesc')}</p>
            </div>
            <div className="flex gap-3">
              <Button size="lg" onClick={() => router.push('/')} variant="outline" className="gap-2">
                <UserPlus className="h-4 w-4" />
                {t('gallery.exploreGirls')}
              </Button>
              <Button size="lg" onClick={() => router.push('/create')} variant="glow" className="gap-2">
                <Sparkles className="h-4 w-4" />
                {t('gallery.create')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {girlfriends.map((gf) => {
              const badge = getReviewBadge(gf.review_status);
              const tags = gf.tags?.length > 0 ? gf.tags : gf.personality?.split(',').map((t: string) => t.trim()).filter(Boolean);

              return (
                <Card
                  key={gf.id}
                  className="group cursor-pointer overflow-hidden border-white/[0.06] bg-white/[0.04] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[#FF2D78]/30 hover:shadow-[0_0_30px_-5px_rgba(255,45,120,0.15)]"
                >
                  <CardContent className="p-0">
                    {/* Portrait */}
                    <div
                      className="relative flex h-44 items-center justify-center bg-gradient-to-b from-[#FF2D78]/5 via-[#15152A] to-[#0E0E1A]"
                      onClick={() => router.push(`/chat/${gf.id}`)}
                    >
                      <div
                        className="relative flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold shadow-[0_0_20px_rgba(255,45,120,0.2)] ring-2 ring-[#FF2D78]/20 overflow-hidden group/avatar"
                        style={{
                          background: `linear-gradient(135deg, ${
                            (gf as any).apperance_hair_color || '#d4a574'
                          }88, ${(gf as any).apperance_hair_color || '#d4a574'}44)`,
                          color: (gf as any).apperance_hair_color || '#d4a574',
                        }}
                      >
                        {(() => {
                          const imgUrl = gf.image_url || gf.avatar_url || gf.portrait_url;
                          return imgUrl ? (
                            <img
                              src={imgUrl}
                              alt={gf.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            gf.name?.charAt(0).toUpperCase() || '?'
                          );
                        })()}
                        {/* Upload overlay */}
                        <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/0 text-transparent transition-all hover:bg-black/50 hover:text-white">
                          <ImagePlus className="h-5 w-5" />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              e.stopPropagation();
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const fd = new FormData();
                              fd.append('file', file);
                              fd.append('folder', 'avatars');
                              try {
                                const res = await authedFetch('/api/upload', { method: 'POST', body: fd });
                                const data = await res.json();
                                if (data.url) {
                                  // Update the avatar in the database
                                  await authedFetch('/api/girlfriends', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: gf.id, avatar_url: data.url }),
                                  });
                                  setGirlfriends((prev) =>
                                    prev.map((g) => g.id === gf.id ? { ...g, avatar_url: data.url } : g)
                                  );
                                }
                              } catch (err) {
                                console.error('Upload failed', err);
                              }
                            }}
                          />
                        </label>
                      </div>

                      {/* Review Badge */}
                      <div className="absolute right-2 top-2">
                        <Badge className={`gap-1 rounded-full px-2 py-0.5 text-[10px] font-normal ${badge.class}`}>
                          <badge.icon className="h-3 w-3" />
                          {badge.label}
                        </Badge>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-2.5 p-4" onClick={() => router.push(`/chat/${gf.id}`)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{gf.name}</span>
                          <span className="text-xs text-muted-foreground">{gf.age}</span>
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1">
                        {tags?.slice(0, 3).map((tag: string) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="rounded-full text-[10px] px-2 py-0 font-normal"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {(tags?.length || 0) > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{tags!.length - 3}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 border-t border-white/[0.06] p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 gap-1.5 text-xs h-8"
                        onClick={() => router.push(`/chat/${gf.id}`)}
                      >
                        <MessagesSquare className="h-3.5 w-3.5" />
                        {t('gallery.chat')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 gap-1.5 text-xs h-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePublic(gf);
                        }}
                        disabled={togglingId === gf.id}
                      >
                        {togglingId === gf.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : gf.review_status === 'draft' ? (
                          <Globe className="h-3.5 w-3.5" />
                        ) : (
                          <Lock className="h-3.5 w-3.5" />
                        )}
                        {gf.review_status === 'draft' ? t('gallery.publish') : t('gallery.statusDraft')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs h-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(gf);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('gallery.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('gallery.confirmDeleteDesc', { name: deleteTarget?.name ?? '' })}
              <br/>{t('gallery.deleteWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('general.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              {deleting ? t('gallery.deleting') : t('gallery.deleteForever')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}