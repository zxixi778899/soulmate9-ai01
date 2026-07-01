'use client';
import { useTranslation } from '@/lib/i18n/context';

import { authedFetch } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Heart, ShoppingBag, Check, Shirt, Loader2, Gift, X } from 'lucide-react';
import { toast } from 'sonner';

interface Girlfriend {
  id: string;
  name: string;
  avatar_url?: string;
}

interface WardrobeItem {
  id: string;
  girlfriend_id: string;
  outfit_id: string;
  is_equipped: boolean;
  gifted: boolean;
  outfit: {
    id: string;
    name: string;
    description: string;
    tier: string;
    category: string;
    price_cents: number;
    intimacy_boost: number;
  };
  girlfriend?: {
    name: string;
  };
}

export default function WardrobePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [girlfriends, setGirlfriends] = useState<Girlfriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedGirlfriend, setSelectedGirlfriend] = useState<Record<string, string>>({});

  const fetchData = async () => {
    try {
      const [wardrobeRes, girlsRes] = await Promise.all([
        authedFetch('/api/wardrobe'),
        authedFetch('/api/girlfriends'),
      ]);
      const wardrobeData = await wardrobeRes.json();
      const girlsData = await girlsRes.json();
      setItems(wardrobeData.items || []);
      setGirlfriends(girlsData.girlfriends || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGift = async (id: string, girlfriendId: string) => {
    if (!girlfriendId) {
      toast.error('Please select a companion first');
      return;
    }
    setActionId(id);
    try {
      const res = await authedFetch('/api/wardrobe', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, girlfriend_id: girlfriendId, is_equipped: true }),
      });
      if (res.ok) {
        await fetchData();
        toast.success('Outfit gifted to your companion!');
      } else {
        const d = await res.json();
        toast.error(d.error || 'Failed to gift');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionId(null);
    }
  };

  const handleToggleEquip = async (id: string, currentlyEquipped: boolean, girlfriendId: string) => {
    setActionId(id);
    try {
      const res = await authedFetch('/api/wardrobe', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, girlfriend_id: girlfriendId, is_equipped: !currentlyEquipped }),
      });
      if (res.ok) {
        await fetchData();
        toast.success(currentlyEquipped ? 'Outfit unequipped' : 'Outfit equipped');
      } else {
        const d = await res.json();
        toast.error(d.error || 'Failed to update');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActionId(null);
    }
  };

  // Group by status
  const ungifted = items.filter(i => !i.gifted);
  const gifted = items.filter(i => i.gifted);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/shop')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-sm font-semibold">My Wardrobe</h1>
            <p className="text-xs text-[#8B8BA3] mt-0.5">
              {loading ? '' : `${gifted.filter(i => i.is_equipped).length} equipped · ${gifted.length} gifted · ${ungifted.length} unworn`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => (
                <Skeleton key={i} className="h-52 rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-16 h-16 rounded-full bg-accent/30 flex items-center justify-center mx-auto mb-4">
                <Heart className="h-8 w-8 text-[#8B8BA3]/40" />
              </div>
              <h3 className="text-sm font-medium text-foreground/80">Your wardrobe is empty</h3>
              <p className="text-xs text-[#8B8BA3] mt-1">Visit the shop to buy outfits and gifts for your companion</p>
              <Button className="mt-4 gap-1.5" size="sm" onClick={() => router.push('/shop')}>
                <ShoppingBag className="h-3.5 w-3.5" />
                Browse Shop
              </Button>
            </div>
          ) : (
            <>
              {/* Ungifted items — gift them to a girl */}
              {ungifted.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-xs font-semibold text-[#8B8BA3] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Gift className="h-3.5 w-3.5" />
                    Unworn — gift to a companion
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {ungifted.map((item) => (
                      <Card key={item.id} className="border-white/[0.06] border-dashed">
                        <CardHeader className="p-0">
                          <div className="aspect-square flex items-center justify-center bg-accent/20">
                            <Shirt className="h-10 w-10 text-[#8B8BA3]/30" />
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-sm truncate">{item.outfit?.name || 'Unknown'}</CardTitle>
                              <p className="text-[10px] text-[#8B8BA3] truncate mt-0.5">
                                {item.outfit?.description || ''}
                              </p>
                            </div>
                            <Badge variant={item.outfit?.tier === 'premium' ? 'default' : 'secondary'} className="shrink-0 text-[10px] px-1.5">
                              {item.outfit?.tier || 'free'}
                            </Badge>
                          </div>

                          {item.outfit?.intimacy_boost ? (
                            <p className="text-[10px] text-primary/70">+{item.outfit.intimacy_boost} intimacy per msg</p>
                          ) : null}

                          {girlfriends.length > 0 ? (
                            <div className="flex gap-1.5">
                              <Select
                                value={selectedGirlfriend[item.id] || ''}
                                onValueChange={(v) => setSelectedGirlfriend(prev => ({ ...prev, [item.id]: v }))}
                              >
                                <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                                  <SelectValue placeholder="Choose companion" />
                                </SelectTrigger>
                                <SelectContent>
                                  {girlfriends.map(g => (
                                    <SelectItem key={g.id} value={g.id} className="text-xs">
                                      {g.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                className="h-8 gap-1 text-xs shrink-0"
                                onClick={() => handleGift(item.id, selectedGirlfriend[item.id] || '')}
                                disabled={actionId === item.id || !selectedGirlfriend[item.id]}
                              >
                                {actionId === item.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Gift className="h-3 w-3" />
                                )}
                                Gift
                              </Button>
                            </div>
                          ) : (
                            <p className="text-[10px] text-[#8B8BA3] text-center py-1">
                              Create a companion first
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Gifted items — toggle equip/unequip */}
              {gifted.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-[#8B8BA3] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Shirt className="h-3.5 w-3.5" />
                    Gifted outfits
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {gifted.map((item) => (
                      <Card
                        key={item.id}
                        className={`border-2 transition-all ${
                          item.is_equipped ? 'border-primary shadow-md' : 'border-white/[0.06]'
                        }`}
                      >
                        <CardHeader className="p-0">
                          <div className={`aspect-square flex items-center justify-center transition-colors ${
                            item.is_equipped
                              ? 'bg-gradient-to-br from-primary/20 to-primary/5'
                              : 'bg-accent/20'
                          }`}>
                            <Shirt className={`h-10 w-10 ${
                              item.is_equipped ? 'text-primary' : 'text-[#8B8BA3]/30'
                            }`} />
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle className="text-sm truncate">{item.outfit?.name || 'Unknown'}</CardTitle>
                              <p className="text-[10px] text-[#8B8BA3] truncate mt-0.5">
                                {item.outfit?.description || ''}
                              </p>
                            </div>
                            <Badge variant={item.outfit?.tier === 'premium' ? 'default' : 'secondary'} className="shrink-0 text-[10px] px-1.5">
                              {item.outfit?.tier || 'free'}
                            </Badge>
                          </div>

                          <p className="text-[10px] text-[#8B8BA3] flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            Gifted to <span className="font-medium text-foreground/70">{item.girlfriend?.name || 'a companion'}</span>
                          </p>

                          {item.outfit?.intimacy_boost ? (
                            <p className="text-[10px] text-primary/70">+{item.outfit.intimacy_boost} intimacy per message</p>
                          ) : null}

                          <Button
                            variant={item.is_equipped ? 'default' : 'outline'}
                            size="sm"
                            className="w-full gap-1.5 text-xs h-8"
                            onClick={() => handleToggleEquip(item.id, item.is_equipped, item.girlfriend_id)}
                            disabled={actionId === item.id}
                          >
                            {actionId === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : item.is_equipped ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Shirt className="h-3 w-3" />
                            )}
                            {item.is_equipped ? 'Equipped' : 'Wear'}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}