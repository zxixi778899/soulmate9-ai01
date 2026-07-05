import { NextRequest, NextResponse } from 'next/server';

const SHOP_ITEMS = [
  // Gifts - Free tier
  { id: 'rose-bouquet', name: 'Rose Bouquet', description: 'A beautiful bouquet of red roses. Simple yet heartfelt.', price_cents: 150, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 15 }, category: 'gifts', tier: 'free', emoji: '', intimacy_boost: 15 },
  { id: 'chocolate-box', name: 'Chocolate Box', description: 'Premium Belgian chocolates. Sweet and irresistible.', price_cents: 300, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 30 }, category: 'gifts', tier: 'free', emoji: '', intimacy_boost: 30 },
  { id: 'teddy-bear', name: 'Teddy Bear', description: 'A soft, huggable teddy bear she can cuddle at night.', price_cents: 500, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 50 }, category: 'gifts', tier: 'free', emoji: '', intimacy_boost: 50 },

  // Gifts - Premium tier
  { id: 'perfume-bottle', name: 'Designer Perfume', description: 'A seductive fragrance that lingers all day. She\'ll think of you every time she wears it.', price_cents: 800, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 80 }, category: 'gifts', tier: 'premium', emoji: '', intimacy_boost: 80 },
  { id: 'lingerie-set', name: 'Silk Lingerie Set', description: 'Premium silk lingerie. She\'ll send you a thank-you photo~ ', price_cents: 1200, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 150 }, category: 'gifts', tier: 'premium', emoji: '', intimacy_boost: 150 },

  // Outfits - shop only (not in base outfits)
  { id: 'school-uniform', name: 'School Uniform', description: 'A classic schoolgirl outfit. Brings out her playful side.', price_cents: 500, item_type: 'outfit', effect_value: { outfit_id: 'school-uniform' }, category: 'outfits', tier: 'free', emoji: '', intimacy_boost: 0 },
  { id: 'maid-costume', name: 'French Maid', description: 'Adorable maid dress with lace trim. "Welcome home, Master~"', price_cents: 800, item_type: 'outfit', effect_value: { outfit_id: 'maid-costume' }, category: 'outfits', tier: 'premium', emoji: '', intimacy_boost: 0 },
  { id: 'evening-gown-sapphire', name: 'Sapphire Evening Gown', description: 'Stunning midnight blue gown with crystal embellishments.', price_cents: 1500, item_type: 'outfit', effect_value: { outfit_id: 'evening-gown-sapphire' }, category: 'outfits', tier: 'premium', emoji: '', intimacy_boost: 0 },

  // Boosters
  { id: 'double-intimacy', name: 'Double Intimacy Boost', description: 'All intimacy gains doubled for the next 24 hours!', price_cents: 600, item_type: 'cap_unlock', effect_value: { effect_type: 'double_intimacy', duration_hours: 24 }, category: 'boosts', tier: 'free', is_limited: false, emoji: '', intimacy_boost: 0 },
  { id: 'unlimited-msg', name: 'Unlimited Messages', description: 'No daily message limit for 48 hours. Talk all you want!', price_cents: 1000, item_type: 'cap_unlock', effect_value: { effect_type: 'unlimited_messages', duration_hours: 48 }, category: 'boosts', tier: 'premium', is_limited: false, emoji: '', intimacy_boost: 0 },

  // Limited
  { id: 'valentine-special', name: ' Valentine\'s Special Box', description: 'Limited edition gift box with exclusive chat scenes and massive intimacy boost!', price_cents: 2000, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 300 }, category: 'limited', tier: 'premium', is_limited: true, weekly_purchase_limit: 1, emoji: '', intimacy_boost: 300 },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const tier = searchParams.get('tier');

  let items = [...SHOP_ITEMS];
  if (category) items = items.filter(i => i.category === category);
  if (tier) items = items.filter(i => i.tier === tier);

  return NextResponse.json({ items, total: items.length });
}