import { NextResponse } from "next/server";
import { logger } from '@/lib/logger';

const OUTFIT_IMAGES: Record<string, string> = {
  "casual-elegance": "https://coze-coding-project.tos.coze.site/coze_storage_7653290042231849012/outfits/casual-elegance_8656ceaf.jpeg?sign=1782769385-a1b7bb3355-0-ccfc34a623409d66287fbc5d42570493fbbd06001cfee964c12f1e7666732921",
  "evening-gown": "https://coze-coding-project.tos.coze.site/coze_storage_7653290042231849012/outfits/evening-gown_cdb59788.jpeg?sign=1782769385-9af8434078-0-57a799c36e803b8c98b977e1fbf3fd7b616a8ffa6b44c5b656847421dfc1771c",
  "silk-lingerie": "https://coze-coding-project.tos.coze.site/coze_storage_7653290042231849012/outfits/silk-lingerie_836b1915.jpeg?sign=1782769386-6158398a79-0-253586c33b70723eab2b37626d4bf1821ab871a7fffc7158a3deba00f9168a60",
  "bunny-suit": "https://coze-coding-project.tos.coze.site/coze_storage_7653290042231849012/outfits/bunny-suit_e635ffc5.jpeg?sign=1782769386-4cfaa8035e-0-fbb20b9a6c44ce4761a412569794db5349974b6f886124b6959fb164fd2e7341",
  "royal-corset": "https://coze-coding-project.tos.coze.site/coze_storage_7653290042231849012/outfits/royal-corset_2a44f2b0.jpeg?sign=1782769387-81102ba152-0-08e175b8df9289de42106ab3508a51c048fdce703bc5228fa475feb77c1fb2a9",
  "fantasy-dream": "https://coze-coding-project.tos.coze.site/coze_storage_7653290042231849012/outfits/fantasy-dream_1aae926d.jpeg?sign=1782769387-641dc464d2-0-18cbd5d8edd9d64274d3caef71d65d46059e057dbd1ae9d3763effa58594a774",
};

const FALLBACK_OUTFITS = [
  { id: "casual-elegance", name: "Casual Elegance", emoji: "👚", description: "A sophisticated casual look with a fitted blazer and silk camisole", price_cents: 0, tier: "free", category: "everyday", intimacy_boost: 1, preview_url: OUTFIT_IMAGES["casual-elegance"] },
  { id: "evening-gown", name: "Evening Gown", emoji: "👗", description: "A stunning floor-length gown perfect for romantic dinners", price_cents: 0, tier: "free", category: "formal", intimacy_boost: 2, preview_url: OUTFIT_IMAGES["evening-gown"] },
  { id: "silk-lingerie", name: "Silk Lingerie", emoji: "💋", description: "Delicate silk lingerie set for intimate moments", price_cents: 0, tier: "free", category: "intimate", intimacy_boost: 3, preview_url: OUTFIT_IMAGES["silk-lingerie"] },
  { id: "bunny-suit", name: "Bunny Suit", emoji: "🐰", description: "Playful and bold - a classic bunny costume", price_cents: 499, tier: "premium", category: "costume", intimacy_boost: 5, preview_url: OUTFIT_IMAGES["bunny-suit"] },
  { id: "royal-corset", name: "Royal Corset", emoji: "👑", description: "An elegant Victorian-inspired corset dress", price_cents: 799, tier: "premium", category: "formal", intimacy_boost: 4, preview_url: OUTFIT_IMAGES["royal-corset"] },
  { id: "fantasy-dream", name: "Fantasy Dream", emoji: "✨", description: "An ethereal fantasy ensemble with flowing fabrics", price_cents: 1299, tier: "unlimited", category: "fantasy", intimacy_boost: 7, preview_url: OUTFIT_IMAGES["fantasy-dream"] },
  { id: "summer-breeze", name: "Summer Breeze", emoji: "🌺", description: "Light and airy sundress perfect for warm days", price_cents: 0, tier: "free", category: "everyday", intimacy_boost: 1, preview_url: null },
  { id: "leather-lace", name: "Leather & Lace", emoji: "🖤", description: "Edgy leather jacket over delicate lace", price_cents: 599, tier: "premium", category: "edgy", intimacy_boost: 4, preview_url: null },
  { id: "kimono-night", name: "Kimono Night", emoji: "🎎", description: "Traditional silk kimono with modern elegance", price_cents: 999, tier: "unlimited", category: "formal", intimacy_boost: 5, preview_url: null },
  { id: "sporty-spice", name: "Sporty Spice", emoji: "🏋️", description: "Athletic wear that shows off your active side", price_cents: 0, tier: "free", category: "everyday", intimacy_boost: 1, preview_url: null },
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const tier = searchParams.get("tier");

    let result = [...FALLBACK_OUTFITS];

    if (category) result = result.filter((o) => o.category === category);
    if (tier) result = result.filter((o) => o.tier === tier);

    return NextResponse.json({ outfits: result });
  } catch (error) {
    logger.error("[Outfits API] Error:", { data: error });
    return NextResponse.json({ error: "Failed to fetch outfits" }, { status: 500 });
  }
}