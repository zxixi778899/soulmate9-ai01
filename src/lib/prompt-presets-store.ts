/**
 * Prompt preset persistence — same pattern as comfy-console/store:
 * DB-first (site_settings key = 'prompt_presets'), mirrored to a local file
 * so serverless cold starts and local dev still work, in-memory cache.
 *
 * The legacy /tmp file was ephemeral on Vercel serverless and silently lost
 * admin customizations; the DB row survives restarts and deployments.
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { logger } from '@/lib/logger';

export const PROMPT_PRESETS_KEY = 'prompt_presets';

export interface PromptPreset {
  id: string;
  label: string;
  positivePrompt: string;
  negativePrompt: string;
}

/** FLUX.1 scene presets — natural language, bright/sharp, empty negatives for portraits */
export const DEFAULT_PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'flux_studio',
    label: '影棚肖像 FLUX',
    positivePrompt:
      'photorealistic three-quarter body portrait of a gorgeous young adult woman age 23-28, looking at viewer, sharp detailed face and eyes, natural skin texture, large breasts, wide hips, hourglass figure, bright studio softbox lighting, clean backdrop, professional fashion photo, 8k, crisp clear vibrant',
    negativePrompt: '',
  },
  {
    id: 'flux_golden',
    label: '金色时刻 FLUX',
    positivePrompt:
      'photorealistic three-quarter portrait of a stunning young woman outdoors at golden hour, warm sunlight on face, looking at viewer with soft smile, sharp detailed face, natural skin, large breasts, wide hips, sexy figure, bright well-lit, romantic atmosphere, 8k ultra photorealistic',
    negativePrompt: '',
  },
  {
    id: 'flux_boudoir',
    label: '卧室私房 FLUX',
    positivePrompt:
      'photorealistic three-quarter portrait of a gorgeous young woman reclining on white sheets, looking at viewer, seductive expression, soft parted lips, sharp focus face, natural skin pores, large breasts, wide hips, bright window light, well-lit bedroom, intimate editorial, 8k photorealistic',
    negativePrompt: '',
  },
  {
    id: 'flux_cafe',
    label: '咖啡馆 FLUX',
    positivePrompt:
      'photorealistic three-quarter portrait of a charming young woman at a cafe table, looking at viewer, warm smile, coffee cup, natural daylight through window, sharp detailed face, large breasts, hourglass figure, bright clear image, 8k photorealistic',
    negativePrompt: '',
  },
  {
    id: 'flux_city',
    label: '城市夜景 FLUX',
    positivePrompt:
      'photorealistic three-quarter portrait of a stylish young woman on a city street at night, neon reflections, looking at viewer confidently, sharp face, large breasts, wide hips, well-lit by neon and street lights, crisp details, 8k cinematic photoreal',
    negativePrompt: '',
  },
  {
    id: 'flux_pool',
    label: '泳池假日 FLUX',
    positivePrompt:
      'photorealistic three-quarter portrait of a gorgeous young woman by a turquoise pool, sun-kissed skin, looking at viewer playfully, swimsuit, large breasts, wide hips, thick thighs, bright midday sunlight, sharp focus, detailed face, vibrant colors, 8k photorealistic',
    negativePrompt: '',
  },
  {
    id: 'flux_outfit',
    label: '服装展示 FLUX',
    positivePrompt:
      'sexy cosplay costume as game wardrobe item, invisible ghost mannequin, full garment front view, centered product, dark studio inventory backdrop, sharp fabric detail, 8k game asset render, clothing only',
    negativePrompt: 'person, face, hands, skin, model, blurry, low quality, watermark, text',
  },
  {
    id: 'flux_prop',
    label: '特效道具 FLUX',
    positivePrompt:
      'fantasy game prop icon, magical special effects, glowing aura, particles, RPG loot, centered product, dark UI backdrop, sharp details, 8k game asset',
    negativePrompt: 'person, face, body, hands, blurry, low quality, watermark, text',
  },
];

type SupabaseLike = { from: (table: string) => any };

function filePath(): string {
  return path.join(process.cwd(), 'data', 'prompt-presets.json');
}

let cache: { presets: PromptPreset[]; at: number } | null = null;

function normalize(value: unknown): PromptPreset[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.filter(
    (p): p is PromptPreset =>
      !!p && typeof p.id === 'string' && typeof p.label === 'string' && typeof p.positivePrompt === 'string',
  ).map((p) => ({ ...p, negativePrompt: typeof p.negativePrompt === 'string' ? p.negativePrompt : '' }));
  return parsed.length > 0 ? parsed : null;
}

/** Load presets: DB (site_settings) → local file mirror → defaults. */
export async function loadPromptPresets(supabase?: SupabaseLike): Promise<PromptPreset[]> {
  if (cache && Date.now() - cache.at < 10_000) return cache.presets;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', PROMPT_PRESETS_KEY)
        .maybeSingle();
      if (!error && data?.value) {
        const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        const presets = normalize(val?.presets ?? val);
        if (presets) {
          cache = { presets, at: Date.now() };
          return presets;
        }
      }
    } catch (e) {
      logger.warn('[prompt-presets] db load failed', { err: String(e) });
    }
  }

  try {
    const raw = await readFile(filePath(), 'utf8');
    const presets = normalize(JSON.parse(raw));
    if (presets) {
      cache = { presets, at: Date.now() };
      return presets;
    }
  } catch {
    // fall through to defaults
  }
  cache = { presets: DEFAULT_PROMPT_PRESETS, at: Date.now() };
  return DEFAULT_PROMPT_PRESETS;
}

/** Persist presets: DB upsert (site_settings) + local file mirror. */
export async function savePromptPresets(
  presets: PromptPreset[],
  supabase?: SupabaseLike,
): Promise<{ source: 'db' | 'file' }> {
  if (supabase) {
    try {
      const { error } = await supabase.from('site_settings').upsert(
        {
          key: PROMPT_PRESETS_KEY,
          value: { presets, updated_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );
      if (!error) {
        cache = { presets, at: Date.now() };
        await mkdir(path.dirname(filePath()), { recursive: true }).catch(() => undefined);
        await writeFile(filePath(), JSON.stringify(presets, null, 2), 'utf8').catch(() => undefined);
        return { source: 'db' };
      }
      logger.warn('[prompt-presets] db save failed', { err: error.message });
    } catch (e) {
      logger.warn('[prompt-presets] db save failed', { err: String(e) });
    }
  }
  await mkdir(path.dirname(filePath()), { recursive: true });
  await writeFile(filePath(), JSON.stringify(presets, null, 2), 'utf8');
  cache = { presets, at: Date.now() };
  return { source: 'file' };
}

export function invalidatePromptPresetsCache(): void {
  cache = null;
}
