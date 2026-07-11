import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const PRESETS_FILE = '/tmp/prompts_presets.json';

interface PromptPreset {
  id: string;
  label: string;
  positivePrompt: string;
  negativePrompt: string;
}

function loadPresets(): PromptPreset[] {
  try {
    if (fs.existsSync(PRESETS_FILE)) {
      const data = fs.readFileSync(PRESETS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // fallback to defaults
  }
  return DEFAULT_PRESETS;
}

function savePresets(presets: PromptPreset[]): void {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), 'utf-8');
}

/** FLUX.1 scene presets — natural language, bright/sharp, empty negatives for portraits */
const DEFAULT_PRESETS: PromptPreset[] = [
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

// GET  list all presets
export async function GET() {
  return NextResponse.json({ presets: loadPresets() });
}

// POST  add a new preset
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const body = await req.json();
  const { label, positivePrompt, negativePrompt } = body as {
    label: string;
    positivePrompt: string;
    negativePrompt: string;
  };

  if (!label || !positivePrompt) {
    return NextResponse.json({ error: 'Missing required fields: label, positivePrompt' }, { status: 400 });
  }

  const presets = loadPresets();
  const newPreset: PromptPreset = {
    id: `preset_${Date.now()}`,
    label,
    positivePrompt,
    negativePrompt: negativePrompt || DEFAULT_PRESETS[0].negativePrompt,
  };
  presets.push(newPreset);
  savePresets(presets);

  return NextResponse.json({ preset: newPreset });
}

// DELETE  remove a preset by id
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id query param' }, { status: 400 });
  }

  let presets = loadPresets();
  presets = presets.filter((p) => p.id !== id);
  savePresets(presets);

  return NextResponse.json({ success: true });
}