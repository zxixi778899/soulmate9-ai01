'use client';

import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { logger } from '@/lib/logger';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shirt, Sparkles, Lock, Coins, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface WardrobeItem {
  id: string;
  name: string;
  category: 'outfit' | 'top' | 'bottom' | 'accessory';
  image_url: string;
  price_tokens: number;
  is_locked: boolean;
  unlock_requirement?: string;
}

interface WardrobeOutfit {
  id: string;
  name: string;
  items: WardrobeItem[];
  preview_image: string;
  price_tokens: number;
  is_owned: boolean;
}

interface WardrobeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  girlfriendId: string;
  currentOutfitId?: string;
}

export function WardrobeDialog({
  open,
  onOpenChange,
  girlfriendId,
  currentOutfitId,
}: WardrobeDialogProps) {
  const [outfits, setOutfits] = useState<WardrobeOutfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [equipping, setEquipping] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'outfits' | 'custom'>('outfits');

  useEffect(() => {
    if (open) {
      loadWardrobe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadWardrobe is redefined each render; reload keyed by open/girlfriendId
  }, [open, girlfriendId]);

  const loadWardrobe = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wardrobe/${girlfriendId}`, {
        headers: { 'x-session': localStorage.getItem('sb-access-token') || '' },
      });
      if (res.ok) {
        const data = await res.json();
        setOutfits(data.outfits || []);
      }
    } catch (err) {
      logger.error('[Wardrobe] Load failed', { err: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleEquipOutfit = async (outfitId: string) => {
    setEquipping(outfitId);
    try {
      const res = await fetch(`/api/wardrobe/equip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session': localStorage.getItem('sb-access-token') || '',
        },
        body: JSON.stringify({
          girlfriend_id: girlfriendId,
          outfit_id: outfitId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // Refresh wardrobe to show equipped state
          await loadWardrobe();
          // Trigger regeneration with new outfit
          await regenerateWithOutfit(outfitId);
        }
      }
    } catch (err) {
      logger.error('[Wardrobe] Equip failed', { err: err instanceof Error ? err.message : String(err) });
    } finally {
      setEquipping(null);
    }
  };

  const regenerateWithOutfit = async (outfitId: string) => {
    try {
      const res = await fetch(`/api/chat/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session': localStorage.getItem('sb-access-token') || '',
        },
        body: JSON.stringify({
          girlfriend_id: girlfriendId,
          outfit: outfitId,
          scene_description: 'wearing new outfit',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.imageUrl) {
          // Show new image in chat
          window.dispatchEvent(new CustomEvent('new-image-generated', {
            detail: { imageUrl: data.imageUrl }
          }));
        }
      }
    } catch (err) {
      logger.error('[Wardrobe] Regenerate failed', { err: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shirt className="h-5 w-5" />
            Wardrobe
          </DialogTitle>
          <DialogDescription>
            Choose an outfit for your companion. Locked items require intimacy level or purchase.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as 'outfits' | 'custom')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="outfits">
              <Shirt className="h-4 w-4 mr-2" />
              Preset Outfits
            </TabsTrigger>
            <TabsTrigger value="custom">
              <Sparkles className="h-4 w-4 mr-2" />
              Custom (Coming Soon)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outfits" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : outfits.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Shirt className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No outfits available yet.</p>
                <p className="text-sm">Check back soon for new collections!</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px] pr-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {outfits.map((outfit) => (
                    <OutfitCard
                      key={outfit.id}
                      outfit={outfit}
                      isEquipped={outfit.id === currentOutfitId}
                      isEquipping={equipping === outfit.id}
                      onEquip={() => handleEquipOutfit(outfit.id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="custom" className="mt-4">
            <div className="text-center py-12 text-gray-500">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-semibold">Custom Outfit Creator</p>
              <p className="text-sm mt-2">
                Describe any outfit and we&apos;ll generate it for you.
                <br />
                Coming soon in a future update!
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface OutfitCardProps {
  outfit: WardrobeOutfit;
  isEquipped: boolean;
  isEquipping: boolean;
  onEquip: () => void;
}

function OutfitCard({ outfit, isEquipped, isEquipping, onEquip }: OutfitCardProps) {
  const isLocked = !outfit.is_owned && outfit.price_tokens > 0;

  return (
    <Card 
      className={cn(
        "relative overflow-hidden transition-all",
        isEquipped && "ring-2 ring-purple-500",
        isLocked && "opacity-60"
      )}
    >
      {/* Preview Image */}
      <div className="relative aspect-[3/4] overflow-hidden">
        <Image
          src={outfit.preview_image}
          alt={outfit.name}
          fill
          className="object-cover"
        />
        
        {/* Locked Overlay */}
        {isLocked && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="text-center">
              <Lock className="h-8 w-8 mx-auto mb-2 text-yellow-400" />
              <div className="flex items-center gap-1 text-yellow-400">
                <Coins className="h-4 w-4" />
                <span className="font-bold">{outfit.price_tokens}</span>
              </div>
            </div>
          </div>
        )}

        {/* Equipped Badge */}
        {isEquipped && (
          <Badge className="absolute top-2 right-2 bg-purple-600">
            Equipped
          </Badge>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-white">{outfit.name}</h3>
          <p className="text-xs text-gray-500">
            {outfit.items.length} items
          </p>
        </div>

        {/* Item List */}
        <div className="space-y-1">
          {outfit.items.slice(0, 3).map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-gray-400 truncate">{item.name}</span>
            </div>
          ))}
          {outfit.items.length > 3 && (
            <p className="text-xs text-gray-600">
              +{outfit.items.length - 3} more
            </p>
          )}
        </div>

        {/* Action Button */}
        <Button
          className="w-full"
          size="sm"
          disabled={isEquipped || isEquipping}
          onClick={onEquip}
        >
          {isEquipping ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Equipping...
            </>
          ) : isEquipped ? (
            'Equipped'
          ) : isLocked ? (
            <>
              <Lock className="h-4 w-4 mr-2" />
              Purchase
            </>
          ) : (
            <>
              <Shirt className="h-4 w-4 mr-2" />
              Try On
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
