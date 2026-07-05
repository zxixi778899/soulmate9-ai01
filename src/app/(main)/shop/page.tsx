'use client';
import { useTranslation } from '@/lib/i18n/context';

import { authedFetch } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingBag, Heart, Sparkles, Lock, Star, Gift, Coins, X } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type ShopItem = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  price_cents: number;
  item_type: string;
  effect_value?: Record<string, string | number>;
  tier: string;
  is_limited?: boolean;
};

type Girlfriend = {
  id: string;
  name: string;
};

type CreditsInfo = {
  credits_remaining: number;
  membership_tier: string;
  plans: { id: string; name: string; amount: number; price: string; price_cents: number }[];
};

const SHOP_ITEMS: ShopItem[] = [
  { id: 'rose-bouquet', name: 'Rose Bouquet', emoji: '', description: 'A dozen red roses that will warm her heart', price_cents: 150, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 15 }, tier: 'free' },
  { id: 'chocolate-box', name: 'Chocolate Box', emoji: '', description: 'Luxury chocolates for a sweet surprise', price_cents: 300, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 30 }, tier: 'free' },
  { id: 'teddy-bear', name: 'Teddy Bear', emoji: '', description: 'A giant teddy bear for cuddles', price_cents: 500, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 50 }, tier: 'free' },
  { id: 'perfume-bottle', name: 'Designer Perfume', emoji: '', description: 'A designer scent she will adore', price_cents: 800, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 80 }, tier: 'premium' },
  { id: 'lingerie-set', name: 'Silk Lingerie Set', emoji: '', description: 'Delicate lingerie for intimate moments', price_cents: 1200, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 150 }, tier: 'premium' },
  { id: 'double-intimacy', name: 'Double Intimacy Boost', emoji: '', description: 'Double intimacy gains for 24 hours', price_cents: 600, item_type: 'cap_unlock', effect_value: { effect_type: 'double_intimacy', duration_hours: 24 }, tier: 'free' },
  { id: 'unlimited-msg', name: 'Unlimited Messages', emoji: '', description: 'No message limits for 48 hours', price_cents: 1000, item_type: 'cap_unlock', effect_value: { effect_type: 'unlimited_messages', duration_hours: 48 }, tier: 'premium' },
  { id: 'valentine-special', name: "Valentine's Special Box", emoji: '', description: 'Exclusive box with 300 intimacy boost', price_cents: 2000, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 300 }, tier: 'premium', is_limited: true },
];

const getCategory = (item: ShopItem): string => {
  if (item.item_type === 'outfit') return 'outfits';
  if (item.item_type === 'cap_unlock') return 'boosts';
  if (item.is_limited) return 'limited';
  return 'gifts';
};

export default function ShopPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [girlfriends, setGirlfriends] = useState<Girlfriend[]>([]);
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const [selectedGF, setSelectedGF] = useState('');
  const [purchasing, setPurchasing] = useState(false);

  const loadCredits = async () => {
    try {
      const res = await authedFetch('/api/shop/credits');
      if (res.ok) {
        const data = await res.json();
        setCredits(data);
      }
    } catch (err) {
      logger.error('Failed to load credits:', { data: err });
    }
  };

  const loadGirlfriends = async () => {
    try {
      const res = await authedFetch('/api/girlfriends');
      if (res.ok) {
        const data = await res.json();
        setGirlfriends(data.girlfriends || []);
      }
    } catch (err) {
      logger.error('Failed to load girlfriends:', { data: err });
    }
  };

  useEffect(() => {
    loadCredits();
    loadGirlfriends();
  }, []);

  const handleBuy = async () => {
    if (!buying || !selectedGF) return;
    setPurchasing(true);
    try {
      const res = await authedFetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: buying.id, girlfriendId: selectedGF }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${buying.emoji} ${buying.name} purchased!`, {
          description: `Gifted to your companion. ${data.remaining_credits} credits remaining.`,
        });
        setBuying(null);
        setSelectedGF('');
        loadCredits();
      } else if (res.status === 402) {
        toast.error('Insufficient credits', {
          description: 'You need more credits to purchase this item.',
          action: { label: 'Get Credits', onClick: () => router.push('/pricing') },
        });
      } else {
        toast.error(data.error || 'Purchase failed');
      }
    } catch (err) {
      toast.error('Network error. Please try again.');
    }
    setPurchasing(false);
  };

  const formatPrice = (cents: number) => `${(cents / 100).toFixed(2)}K credits`;
  const tierColor = (tier: string) => tier === 'premium' ? 'text-purple-400' : 'text-gray-400';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold italic gradient-text">Boutique</h1>
            <p className="text-sm text-[#8B8BA3]">Gifts, boosts & surprises for your companion</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm bg-white/[0.04] rounded-lg px-3 py-1.5 border border-white/[0.06]">
              <Coins className="h-4 w-4 text-amber-400" />
              <span className="font-semibold">{credits?.credits_remaining ?? '...'}</span>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => router.push('/wardrobe')}>
              <Heart className="h-3.5 w-3.5" />
              Wardrobe
            </Button>
          </div>
        </div>
      </div>

      {/* Shop Grid */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-6 overflow-x-auto w-full justify-start sm:justify-center">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="gifts" className="text-xs">Gifts</TabsTrigger>
            <TabsTrigger value="boosts" className="text-xs">Boosts</TabsTrigger>
            <TabsTrigger value="limited" className="text-xs">Limited</TabsTrigger>
          </TabsList>

          {['all', 'gifts', 'boosts', 'limited'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {SHOP_ITEMS
                  .filter(i => tab === 'all' || getCategory(i) === tab)
                  .map((item) => (
                    <Card key={item.id} className="border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] transition-colors overflow-hidden">
                      <CardHeader className="p-0">
                        <div className="aspect-[4/3] bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center">
                          <span className="text-5xl">{item.emoji}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm font-semibold">{item.name}</CardTitle>
                          {item.is_limited && (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                              Limited
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-[#8B8BA3] line-clamp-2">{item.description}</p>
                        {item.item_type === 'intimacy_boost' && item.effect_value?.intimacy_boost && (
                          <div className="flex items-center gap-1">
                            <Heart className="h-3 w-3 text-pink-500" />
                            <span className="text-xs text-pink-500 font-medium">+{item.effect_value.intimacy_boost} intimacy</span>
                          </div>
                        )}
                        {item.item_type === 'cap_unlock' && (
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-amber-500" />
                            <span className="text-xs text-amber-500 font-medium">{item.effect_value?.duration_hours}h boost</span>
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="p-4 pt-0">
                        <Button
                          className="w-full gap-1.5 h-9 text-xs"
                          size="sm"
                          onClick={() => { setBuying(item); setSelectedGF(''); }}
                        >
                          {item.tier === 'premium' && <Lock className="h-3 w-3" />}
                          {formatPrice(item.price_cents)}
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
              </div>
              {SHOP_ITEMS.filter(i => tab === 'all' || getCategory(i) === tab).length === 0 && (
                <div className="text-center py-20">
                  <ShoppingBag className="h-10 w-10 text-[#8B8BA3]/30 mx-auto mb-3" />
                  <p className="text-sm text-[#8B8BA3]">No items in this category yet</p>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Purchase Dialog */}
      <Dialog open={!!buying} onOpenChange={(open) => !open && setBuying(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span>{buying?.emoji}</span>
              Buy {buying?.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#8B8BA3]">
              Choose which companion to gift this item to.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8B8BA3]">Price</span>
              <span className="font-semibold">{buying ? formatPrice(buying.price_cents) : ''}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8B8BA3]">Balance</span>
              <span className="font-semibold text-amber-400">{credits?.credits_remaining ?? 0} credits</span>
            </div>
            <Select value={selectedGF} onValueChange={setSelectedGF}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a companion..." />
              </SelectTrigger>
              <SelectContent>
                {girlfriends.map((gf) => (
                  <SelectItem key={gf.id} value={gf.id}>{gf.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {girlfriends.length === 0 && (
              <p className="text-xs text-[#8B8BA3] text-center">
                No companions yet.{' '}
                <button onClick={() => router.push('/create')} className="text-primary underline">Create one</button>
              </p>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setBuying(null)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleBuy}
              disabled={!selectedGF || purchasing}
              className="flex-1 gap-1.5"
            >
              {purchasing ? 'Buying...' : `${buying?.emoji} Purchase`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}