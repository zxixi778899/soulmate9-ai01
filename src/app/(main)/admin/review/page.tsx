'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, CheckSquare, Check, X, Eye, Heart, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type ReviewItem = {
  id: string;
  name: string;
  age: number;
  slug: string;
  personality: string;
  short_description: string;
  backstory: string;
  portrait_url: string | null;
  avatar_url: string | null;
  tags: string[];
  review_status: string;
  is_public: boolean;
  created_at: string;
  submitted_by?: string;
  appearance?: {
    hair: string;
    hair_color: string;
    eyes: string;
    body: string;
    style: string;
  } | null;
};

export default function AdminReviewPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchReviewItems = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/review');
      const data = await res.json();
      if (data.items) setItems(data.items);
      else if (data.girlfriends) setItems(data.girlfriends);
      else if (Array.isArray(data)) setItems(data);
      else setItems([]);
    } catch (err) {
      logger.error(String(err));
      toast.error('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviewItems();
  }, []);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await authedFetch('/api/admin/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' }),
      });
      if (!res.ok) throw new Error('Failed to approve');
      toast.success('');
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (selectedItem?.id === id) {
        setDetailOpen(false);
        setSelectedItem(null);
      }
    } catch (err) {
      logger.error(String(err));
      toast.error('');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedItem) return;
    setProcessingId(selectedItem.id);
    try {
      const res = await authedFetch('/api/admin/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedItem.id,
          action: 'reject',
          reason: rejectReason,
        }),
      });
      if (!res.ok) throw new Error('Failed to reject');
      toast.success('');
      setItems((prev) => prev.filter((item) => item.id !== selectedItem.id));
      setRejectOpen(false);
      setDetailOpen(false);
      setSelectedItem(null);
      setRejectReason('');
    } catch (err) {
      logger.error(String(err));
      toast.error('');
    } finally {
      setProcessingId(null);
    }
  };

  const openDetail = (item: ReviewItem) => {
    setSelectedItem(item);
    setDetailOpen(true);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold"></h1>
        <p className="text-sm text-[#8B8BA3] mt-1">
          
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
        </div>
      ) : items.length === 0 ? (
        <Card className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-20 text-[#8B8BA3]">
            <CheckSquare className="h-12 w-12 mb-2 opacity-30" />
            <p className="text-base font-medium"></p>
            <p className="text-sm mt-1"></p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card
              key={item.id}
              className="border-white/[0.05] bg-card/40 backdrop-blur-sm hover:bg-card/60 transition-colors cursor-pointer"
              onClick={() => openDetail(item)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Portrait */}
                  <div className="shrink-0">
                    {item.portrait_url ? (
                      <img
                        src={item.portrait_url}
                        alt={item.name}
                        className="h-14 w-14 rounded-xl object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).parentElement!.innerHTML =
                            '<div class="h-14 w-14 rounded-xl bg-[#FF2D78]/10 flex items-center justify-center text-[#FF2D78] text-lg font-semibold">' +
                            item.name.charAt(0) +
                            '</div>';
                        }}
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-[#FF2D78]/10 flex items-center justify-center text-[#FF2D78] text-lg font-semibold">
                        {item.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm">{item.name}</h3>
                      <span className="text-xs text-[#8B8BA3]">: {item.age}</span>
                      <Badge variant="secondary" className="text-[9px] capitalize">
                        {item.review_status}
                      </Badge>
                    </div>

                    {item.short_description && (
                      <p className="text-xs text-[#8B8BA3] line-clamp-2 mb-2">
                        {item.short_description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {(item.tags || []).slice(0, 4).map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-[9px]">
                          {tag}
                        </Badge>
                      ))}
                      {(item.tags || []).length > 4 && (
                        <span className="text-[9px] text-[#8B8BA3]">
                          +{item.tags.length - 4} 
                        </span>
                      )}
                      <span className="text-[10px] text-[#8B8BA3] ml-auto">
                         {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="gap-1 h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(item.id);
                      }}
                      disabled={processingId === item.id}
                    >
                      {processingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItem(item);
                        setRejectReason('');
                        setRejectOpen(true);
                      }}
                      disabled={processingId === item.id}
                    >
                      <X className="h-3.5 w-3.5" />
                      
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-[#FF2D78]" />
              {selectedItem?.name || ''}
            </DialogTitle>
            <DialogDescription>
              
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6">
              {/* Portrait & Basic Info */}
              <div className="flex items-start gap-4">
                {selectedItem.portrait_url ? (
                  <img
                    src={selectedItem.portrait_url}
                    alt={selectedItem.name}
                    className="h-20 w-20 rounded-xl object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="h-20 w-20 rounded-xl bg-[#FF2D78]/10 flex items-center justify-center text-[#FF2D78] text-2xl font-semibold">
                    {selectedItem.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-semibold">{selectedItem.name}</h3>
                  <p className="text-sm text-[#8B8BA3]">
                    : {selectedItem.age}  : {selectedItem.slug}
                  </p>
                  {selectedItem.submitted_by && (
                    <p className="text-xs text-[#8B8BA3] mt-1">
                      : {selectedItem.submitted_by}
                    </p>
                  )}
                </div>
              </div>

              {/* Personality */}
              {selectedItem.personality && (
                <div>
                  <h4 className="text-sm font-medium mb-1"></h4>
                  <p className="text-sm text-[#8B8BA3]">{selectedItem.personality}</p>
                </div>
              )}

              {/* Tags */}
              {selectedItem.tags && selectedItem.tags.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2"></h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedItem.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Short Description */}
              {selectedItem.short_description && (
                <div>
                  <h4 className="text-sm font-medium mb-1"></h4>
                  <p className="text-sm text-[#8B8BA3]">{selectedItem.short_description}</p>
                </div>
              )}

              {/* Backstory */}
              {selectedItem.backstory && (
                <div>
                  <h4 className="text-sm font-medium mb-1"></h4>
                  <p className="text-sm text-[#8B8BA3] whitespace-pre-wrap">{selectedItem.backstory}</p>
                </div>
              )}

              {/* Appearance */}
              {selectedItem.appearance && (
                <div>
                  <h4 className="text-sm font-medium mb-2"></h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {selectedItem.appearance.hair && (
                      <div><span className="text-[#8B8BA3]">:</span> {selectedItem.appearance.hair}</div>
                    )}
                    {selectedItem.appearance.hair_color && (
                      <div><span className="text-[#8B8BA3]">:</span> {selectedItem.appearance.hair_color}</div>
                    )}
                    {selectedItem.appearance.eyes && (
                      <div><span className="text-[#8B8BA3]">:</span> {selectedItem.appearance.eyes}</div>
                    )}
                    {selectedItem.appearance.body && (
                      <div><span className="text-[#8B8BA3]">:</span> {selectedItem.appearance.body}</div>
                    )}
                    {selectedItem.appearance.style && (
                      <div><span className="text-[#8B8BA3]">:</span> {selectedItem.appearance.style}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => {
                setRejectReason('');
                setRejectOpen(true);
              }}
            >
              <X className="h-4 w-4" />
              
            </Button>
            <Button
              className="gap-2"
              onClick={() => selectedItem && handleApprove(selectedItem.id)}
              disabled={processingId === selectedItem?.id}
            >
              {processingId === selectedItem?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle></DialogTitle>
            <DialogDescription>
              {selectedItem?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              placeholder="..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={processingId === selectedItem?.id}
            >
              {processingId === selectedItem?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
