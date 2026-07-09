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
import { ShoppingBag, Heart, Sparkles, Lock, Star, Gift, Coins, X, Shirt } from 'lucide-react';
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

const OUTFITS: ShopItem[] = [
  { id: 'classic-dress', name: 'Classic Dress', emoji: '', description: 'Elegant everyday dress for casual dates', price_cents: 200, item_type: 'outfit', effect_value: { intimacy_boost: 5 }, tier: 'free' },
  { id: 'beach-bikini', name: 'Beach Bikini', emoji: '', description: 'Stunning bikini for beach dates', price_cents: 800, item_type: 'outfit', effect_value: { intimacy_boost: 25 }, tier: 'premium' },
  { id: 'yoga-set', name: 'Yoga Activewear', emoji: '', description: 'Form-fitting activewear for gym dates', price_cents: 600, item_type: 'outfit', effect_value: { intimacy_boost: 20 }, tier: 'premium' },
  { id: 'evening-gown', name: 'Evening Gown', emoji: '', description: 'Red carpet gown for special nights', price_cents: 1500, item_type: 'outfit', effect_value: { intimacy_boost: 50 }, tier: 'premium' },
  { id: 'silk-lingerie', name: 'Silk Lingerie', emoji: '', description: 'Delicate silk for intimate moments', price_cents: 3000, item_type: 'outfit', effect_value: { intimacy_boost: 100 }, tier: 'premium' },
  { id: 'nurse-costume', name: 'Nurse Costume', emoji: '', description: 'Playful nurse fantasy roleplay', price_cents: 2000, item_type: 'outfit', effect_value: { intimacy_boost: 80 }, tier: 'premium' },
  { id: 'maid-costume', name: 'French Maid', emoji: '', description: 'Classic French maid, timeless fantasy', price_cents: 2500, item_type: 'outfit', effect_value: { intimacy_boost: 90 }, tier: 'premium' },
];

const ALL_ITEMS = [...SHOP_ITEMS, ...OUTFITS];

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
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b border-white/[0.06] px-4 sm:px-6 py-4 backdrop-blur-3xl"
        style={{ background: 'linear-gradient(180deg, rgba(5,5,9,0.85) 0%, rgba(10,10,20,0.4) 100%)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-[#FFB3CD] to-[#FF6BA6] bg-clip-text text-transparent">
              Boutique
            </h1>
            <p className="text-sm text-white/50">Gifts, boosts & surprises</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm rounded-full px-3 py-1.5 border border-amber-500/30 bg-amber-500/10 backdrop-blur-xl">
              <Coins className="h-4 w-4 text-amber-400" />
              <span className="font-semibold text-white">{credits?.credits_remaining ?? '...'}</span>
              <span className="text-[10px] text-amber-200/60">credits</span>
            </div>
            <button
              onClick={() => router.push('/pricing')}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium text-amber-300 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all"
            >
              <Coins className="h-3.5 w-3.5" />
              Get Tokens
            </button>
          </div>
        </div>
      </div>

      {/* Shop Grid */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-6 overflow-x-auto w-full justify-start sm:justify-center bg-white/[0.04] border border-white/[0.08] backdrop-blur-2xl rounded-full p-1">
            <TabsTrigger value="all" className="text-xs rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF2D78] data-[state=active]:to-[#A855F7] data-[state=active]:text-white">All</TabsTrigger>
            <TabsTrigger value="gifts" className="text-xs rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF2D78] data-[state=active]:to-[#A855F7] data-[state=active]:text-white">Gifts</TabsTrigger>
            <TabsTrigger value="outfits" className="text-xs rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF2D78] data-[state=active]:to-[#A855F7] data-[state=active]:text-white">
              <Shirt className="h-3 w-3 mr-1" />Outfits
            </TabsTrigger>
            <TabsTrigger value="boosts" className="text-xs rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF2D78] data-[state=active]:to-[#A855F7] data-[state=active]:text-white">Boosts</TabsTrigger>
            <TabsTrigger value="limited" className="text-xs rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF2D78] data-[state=active]:to-[#A855F7] data-[state=active]:text-white">Limited</TabsTrigger>
          </TabsList>

          {['all', 'gifts', 'outfits', 'boosts', 'limited'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {ALL_ITEMS
                  .filter(i => tab === 'all' || getCategory(i) === tab)
                  .map((item) => (
                    <Card key={item.id} className="group relative overflow-hidden border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.01] backdrop-blur-2xl hover:border-[#FF2D78]/30 hover:shadow-[0_8px_32px_rgba(255,45,120,0.15)] transition-all">
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
              {ALL_ITEMS.filter(i => tab === 'all' || getCategory(i) === tab).length === 0 && (
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