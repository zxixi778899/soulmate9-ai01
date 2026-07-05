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

const DEFAULT_PRESETS: PromptPreset[] = [
  {
    id: 'golden_hour',
    label: 'Golden Hour',
    positivePrompt: 'Full body portrait of a stunning young woman standing barefoot on warm sand, weight on one leg, hip tilted, one hand brushing hair behind her ear. She gazes at viewer with a warm knowing smile, lips slightly parted. Golden hour backlight creates ethereal rim glow around her hair and shoulders. Long soft shadows stretch across wet sand reflecting amber and rose sky. Shot on Canon EOS R5, 85mm f/1.4, shallow depth of field with creamy bokeh. Skin texture visible, natural beauty, no retouching. Romantic, alluring, effortlessly captivating.',
    negativePrompt: 'blurry, low quality, deformed, bad anatomy, bad hands, extra fingers, ugly, watermark, text, dark lighting, harsh shadows, grainy, out of focus, looking away, expressionless, plastic skin, airbrushed',
  },
  {
    id: 'boudoir',
    label: 'Boudoir',
    positivePrompt: 'Full body portrait of a gorgeous young woman reclining on white silk sheets, S-curve pose, arm draped above head, one knee slightly bent. She gazes at viewer with magnetic intensity, plush lips parted slightly, smoky bedroom eyes. Soft diffused window light from the left wraps her form, creating gentle Rembrandt shadows. Plush pillows and dried pampas grass in background. Warm amber tones, intimate atmosphere. Shot on Canon EOS R5, 85mm f/1.4, dreamy bokeh. Skin texture visible, natural pores, no plastic smoothing. Sensual, romantically alluring, editorial boudoir.',
    negativePrompt: 'blurry, low quality, deformed, bad anatomy, bad hands, extra fingers, ugly, watermark, text, dark moody lighting, harsh shadows, grainy, out of focus, looking away, expressionless, tacky, plastic skin',
  },
  {
    id: 'fitness',
    label: 'Athletic Glow',
    positivePrompt: 'Full body portrait of a fit young woman in a modern gym, standing in a confident athletic stance, one hand holding a water bottle, the other on her hip. Post-workout glow, slight sheen of sweat on skin, bright expressive eyes full of confidence, playful flirtatious smile. Hair in loose messy bun with strands framing her face. Form-fitting sports bra and leggings showcasing sculpted figure. Bright natural light from large gym windows, energetic atmosphere. Shot on Canon EOS R5, 50mm f/1.8, soft bokeh of equipment behind. Skin texture visible, real and raw. Energetic, healthily alluring, empowering.',
    negativePrompt: 'blurry, low quality, deformed, bad anatomy, bad hands, extra fingers, ugly, watermark, text, flat lighting, grainy, out of focus, looking away, expressionless, out of shape, plastic skin',
  },
  {
    id: 'rooftop',
    label: 'City Romance',
    positivePrompt: 'Full body portrait of a breathtaking young woman on a rooftop at blue hour, leaning against glass railing, looking directly at camera with inviting gaze. Long hair flowing in gentle breeze catching last sunlight. City skyline glowing amber and rose behind her, first stars appearing. She wears a stylish off-shoulder fitted dress, gold bracelets catching the light. Cool-warm contrast between twilight sky and warm city lights. Shot on Canon EOS R5, 35mm f/1.4, dreamy city bokeh. Skin texture visible, natural beauty. Cosmopolitan, intoxicating, cinematic.',
    negativePrompt: 'blurry, low quality, deformed, bad anatomy, bad hands, extra fingers, ugly, watermark, text, dark shadows, harsh midday light, grainy, out of focus, looking away, expressionless, plastic skin',
  },
  {
    id: 'morning_bed',
    label: 'Morning Intimacy',
    positivePrompt: 'Full body portrait of a ravishing young woman sitting up in bed against fluffy pillows, knee drawn up, holding a coffee mug with both hands. Oversized white button-down shirt slipping off one shoulder. Tousled hair falling messily, sleepy magnetic bedroom eyes, naturally flushed lips slightly parted. Soft morning light through sheer curtains creating ethereal rays and gentle shadows. White linen sheets, minimalist bedroom. Shot on Canon EOS R5, 85mm f/1.4, creamy bokeh. Skin texture visible, real morning face, no makeup. Tender, deeply inviting, intimate.',
    negativePrompt: 'blurry, low quality, deformed, bad anatomy, bad hands, extra fingers, ugly, watermark, text, dark lighting, harsh shadows, grainy, out of focus, looking away, expressionless, messy dirty room, plastic skin',
  },
  {
    id: 'poolside',
    label: 'Poolside Glamour',
    positivePrompt: 'Full body portrait of a gorgeous young woman lounging on a white sunbed by a crystal turquoise pool, looking over shoulder at viewer with playful seductive gaze. Glowing bronzed skin glistening with water droplets, wet hair in loose waves. Stylish swimsuit flattering toned figure, oversized sunglasses pushed up on head. Bright midday sun with reflector fill creating crisp highlights. Palm trees and white villa soft in background. Shot on Canon EOS R5, 85mm f/1.4, sparkling water bokeh. Skin texture visible, real sun-kissed glow. Luxurious, sun-drenched, aspirational.',
    negativePrompt: 'blurry, low quality, deformed, bad anatomy, bad hands, extra fingers, ugly, watermark, text, harsh shadows, overexposed, grainy, out of focus, looking away, expressionless, dirty pool, plastic skin',
  },
  {
    id: 'cafe',
    label: 'Cafe Moment',
    positivePrompt: 'Full body portrait of a charming young woman sitting at a vintage cafe table, legs crossed, one hand wrapping around a steaming coffee cup. She looks up from her book with a surprised delighted expression, as if she just noticed you. Exposed brick walls, warm wood tones, afternoon light streaming through large windows. She wears a cozy knit sweater, minimal gold jewelry. Shot on Canon EOS R5, 50mm f/1.4, bokeh of cafe interior. Skin texture visible, natural flushed cheeks. Warm, approachable, candid moment captured.',
    negativePrompt: 'blurry, low quality, deformed, bad anatomy, bad hands, extra fingers, ugly, watermark, text, dark lighting, harsh shadows, grainy, out of focus, looking away, expressionless, plastic skin, staged pose',
  },
  {
    id: 'neon_night',
    label: 'Neon Nights',
    positivePrompt: 'Full body portrait of a striking young woman standing on a rain-slicked city street at night, neon signs reflecting off wet pavement. She leans against a brick wall, arms crossed, one eyebrow raised, confident mysterious expression. Vibrant color splashes of pink and blue neon on her face and body. She wears a leather jacket over a simple top, dark jeans. Shot on Canon EOS R5, 35mm f/1.4, cinematic bokeh of city lights. Skin texture visible, rain droplets on skin. Urban, edgy, cinematic noir atmosphere.',
    negativePrompt: 'blurry, low quality, deformed, bad anatomy, bad hands, extra fingers, ugly, watermark, text, flat lighting, grainy, out of focus, looking away, expressionless, plastic skin, daytime',
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