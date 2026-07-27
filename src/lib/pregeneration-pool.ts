/**
 * Pre-generation Pool System
 *
 * Maintains a pool of pre-generated companion images for common scenes so that
 * chat responses can serve an image instantly instead of waiting 5-10s for GPU
 * generation. Gracefully degrades: returns null if pool is empty or unconfigured.
 *
 * --- Expected Supabase table: pregen_image_pool ---
 * CREATE TABLE pregen_image_pool (
 *   id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   companion_id  uuid NOT NULL REFERENCES girlfriends(id) ON DELETE CASCADE,
 *   scene         text NOT NULL,
 *   prompt        text NOT NULL,
 *   image_url     text NOT NULL,
 *   tags          text[] DEFAULT ARRAY[]::text[],
 *   usage_count   integer NOT NULL DEFAULT 0,
 *   created_at    timestamptz NOT NULL DEFAULT now()
 * );
 * CREATE INDEX idx_pregen_pool_companion_scene ON pregen_image_pool(companion_id, scene);
 * -------------------------------------------------
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

// --- Types ---

export type PregenScene = {
  id: string;
  companion_id: string;
  scene: string;
  prompt: string;
  image_url: string;
  tags: string[];
  usage_count: number;
  created_at: string;
};

export type PregenSceneTemplate = {
  id: string;
  label: string;
  prompt_template: string;
  category: 'portrait' | 'selfie' | 'outfit' | 'nsfw' | 'seasonal';
  tags: string[];
  weight: number;
};

export type PregenPoolConfig = {
  enabled: boolean;
  max_pool_size: number;
  scenes: PregenSceneTemplate[];
  auto_fill: boolean;
};

// --- Default Templates ---

export const DEFAULT_PREGEN_TEMPLATES: PregenSceneTemplate[] = [
  {
    id: "casual_selfie",
    label: "Casual Selfie",
    prompt_template:
      "A candid phone selfie of {name}, a young woman with {hair_color} hair and {eye_color} eyes, soft natural lighting, casual t-shirt, warm smile, slightly angled phone perspective, realistic photography, sharp focus",
    category: "selfie",
    tags: ["selfie","casual","sfw"],
    weight: 10,
  },
  {
    id: "bedroom_morning",
    label: "Bedroom Morning",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, lying in bed in morning light, messy hair, cozy duvet, soft golden hour glow through curtains, relaxed expression, realistic photography, warm tones",
    category: "portrait",
    tags: ["morning","bedroom","cozy","sfw"],
    weight: 9,
  },
  {
    id: "gym_outfit",
    label: "Gym Outfit",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, athletic wear, sports bra and leggings, gym background, toned physique, confident pose, bright lighting, fitness photography, sharp focus",
    category: "outfit",
    tags: ["gym","athletic","outfit","sfw"],
    weight: 7,
  },
  {
    id: "beach_swimsuit",
    label: "Beach Swimsuit",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, stylish swimsuit, beach setting, ocean background, sun-kissed skin, golden hour, relaxed confident pose, editorial photography, warm tones",
    category: "outfit",
    tags: ["beach","swimsuit","summer","sfw"],
    weight: 8,
  },
  {
    id: "evening_dress",
    label: "Evening Dress",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, elegant evening dress, upscale restaurant or city lights background, sophisticated makeup, graceful pose, bokeh lights, editorial fashion photography",
    category: "outfit",
    tags: ["evening","dress","elegant","sfw"],
    weight: 7,
  },
  {
    id: "cooking_apron",
    label: "Cooking Apron",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, wearing a cute apron over casual clothes, kitchen setting, playful expression, holding a wooden spoon, warm homey lighting, lifestyle photography",
    category: "portrait",
    tags: ["cooking","apron","domestic","sfw"],
    weight: 6,
  },
  {
    id: "office_look",
    label: "Office Look",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, professional office attire, blouse and pencil skirt, modern office background, confident expression, clean lighting, corporate portrait photography",
    category: "outfit",
    tags: ["office","professional","outfit","sfw"],
    weight: 5,
  },
  {
    id: "pajamas_night",
    label: "Pajamas Night",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, cute pajama set, cozy bedroom at night, soft lamp light, sleepy sweet expression, holding a mug, warm intimate atmosphere, lifestyle photography",
    category: "portrait",
    tags: ["pajamas","night","cozy","sfw"],
    weight: 8,
  },
  {
    id: "date_night",
    label: "Date Night",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, stylish date outfit, dimly lit cocktail bar, alluring expression, candlelight glow, shallow depth of field, romantic atmosphere, editorial photography",
    category: "portrait",
    tags: ["date","night","romantic","sfw"],
    weight: 7,
  },
  {
    id: "travel_photo",
    label: "Travel Photo",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, casual travel outfit, scenic landmark or old town street background, joyful expression, natural daylight, travel photography, vibrant colors",
    category: "selfie",
    tags: ["travel","outdoor","casual","sfw"],
    weight: 6,
  },
  {
    id: "bath_towel",
    label: "Bath Towel",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, wrapped in a white towel after shower, steamy bathroom, wet hair, flushed skin, shy teasing expression, soft diffused lighting, boudoir photography",
    category: "nsfw",
    tags: ["bath","towel","nsfw","steamy"],
    weight: 6,
  },
  {
    id: "lingerie_set",
    label: "Lingerie Set",
    prompt_template:
      "{name} with {hair_color} hair and {eye_color} eyes, matching lace lingerie set, bedroom setting, confident seductive pose, soft warm lighting, detailed fabric texture, boudoir editorial photography",
    category: "nsfw",
    tags: ["lingerie","nsfw","boudoir","seductive"],
    weight: 5,
  },
];

// --- Default Config ---

export const DEFAULT_PREGEN_POOL_CONFIG: PregenPoolConfig = {
  enabled: false,
  max_pool_size: 50,
  scenes: DEFAULT_PREGEN_TEMPLATES,
  auto_fill: false,
};

// --- In-memory Cache (60s TTL) ---

type CacheEntry = { url: string; expires: number };
const lookupCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheGet(key: string): string | null {
  const entry = lookupCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    lookupCache.delete(key);
    return null;
  }
  return entry.url;
}

function cacheSet(key: string, url: string): void {
  lookupCache.set(key, { url, expires: Date.now() + CACHE_TTL_MS });
}

// --- Pool Functions ---

/**
 * Look up a pre-generated image for a companion + scene combination.
 * Returns the image URL if found, null otherwise (graceful degradation).
 */
export async function lookupPregenImage(
  supabase: SupabaseClient,
  companionId: string,
  scene: string,
): Promise<string | null> {
  const cacheKey = companionId + ":" + scene;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from("pregen_image_pool")
      .select("id, image_url")
      .eq("companion_id", companionId)
      .eq("scene", scene)
      .order("usage_count", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (error && error.code !== "42P01") {
        // 42P01 = table does not exist - expected if pool not set up yet
        logger.warn("[pregen-pool] lookup failed", { companionId, scene, error: error.message });
      }
      return null;
    }

    cacheSet(cacheKey, data.image_url);
    return data.image_url;
  } catch (e) {
    logger.warn("[pregen-pool] lookup exception", {
      companionId,
      scene,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Increment usage_count for a pre-generated image (tracks popularity / rotation).
 */
export async function recordPregenUsage(
  supabase: SupabaseClient,
  imageId: string,
): Promise<void> {
  try {
    const { data } = await supabase
      .from("pregen_image_pool")
      .select("usage_count")
      .eq("id", imageId)
      .maybeSingle();

    if (data) {
      await supabase
        .from("pregen_image_pool")
        .update({ usage_count: (data.usage_count ?? 0) + 1 })
        .eq("id", imageId);
    }
  } catch (e) {
    // Non-critical: do not break the caller for usage tracking failures
    logger.warn("[pregen-pool] usage tracking failed", {
      imageId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Get pool status: total images, breakdown by scene, and coverage percentage.
 * Coverage = (distinct scenes with at least 1 image) / (total template count).
 */
export async function getPoolStatus(
  supabase: SupabaseClient,
  companionId?: string,
): Promise<{ total: number; by_scene: Record<string, number>; coverage: number }> {
  try {
    let query = supabase.from("pregen_image_pool").select("scene");
    if (companionId) {
      query = query.eq("companion_id", companionId);
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === "42P01") {
        return { total: 0, by_scene: {}, coverage: 0 };
      }
      logger.warn("[pregen-pool] status query failed", { error: error.message });
      return { total: 0, by_scene: {}, coverage: 0 };
    }

    const by_scene: Record<string, number> = {};
    for (const row of data || []) {
      by_scene[row.scene] = (by_scene[row.scene] || 0) + 1;
    }

    const total = (data || []).length;
    const distinctScenes = Object.keys(by_scene).length;
    const coverage = DEFAULT_PREGEN_TEMPLATES.length > 0
      ? Math.round((distinctScenes / DEFAULT_PREGEN_TEMPLATES.length) * 100) / 100
      : 0;

    return { total, by_scene, coverage };
  } catch (e) {
    logger.warn("[pregen-pool] status exception", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { total: 0, by_scene: {}, coverage: 0 };
  }
}

