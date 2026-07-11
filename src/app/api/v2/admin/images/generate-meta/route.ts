import { NextRequest, NextResponse } from 'next/server';
import { generateText } from '@/lib/llm-service';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified LLM call via RunPod vLLM (or Together AI fallback).
 * Previously used Coze doubao-seed-2-0-pro (removed — NSFW censorship).
 */
async function callLLM(prompt: string): Promise<string> {
  return generateText({ prompt, temperature: 0.7, maxTokens: 2048 });
}

/**
 *  LLM  JSON markdown 
 */
function extractJSON(text: string): string {
  //  markdown 
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  //  JSON 
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : cleaned;
}

/**
 *  LLM  JSON 
 */
function fixLLMJson(jsonStr: string): string {
  let fixed = jsonStr;

  // : {key: "value"}  {"key": "value"}
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // : "key" "value"  "key": "value"
  fixed = fixed.replace(/"\s+"(?=[^:]*["}\]])/g, '": "');

  // : [...,]  [...]
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

  // : 'value'  "value"
  fixed = fixed.replace(/'([^']*)'/g, '"$1"');

  return fixed;
}

/**
 *  JSON
 */
function safeParseJSON(text: string): any {
  //  JSON
  const jsonStr = extractJSON(text);

  // 
  try {
    return JSON.parse(jsonStr);
  } catch {
    // 
    try {
      const fixed = fixLLMJson(jsonStr);
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

//  LLM  +  + 
async function tryLLMWithFallback(userPrompt: string, concept: string, type: string) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const content = await callLLM(userPrompt);

      if (!content || content.length < 10) {
        throw new Error(`LLM returned empty or too short content (length: ${content?.length || 0})`);
      }

      const metadata = safeParseJSON(content);

      if (metadata && metadata.name && metadata.description && metadata.tags && metadata.appearance) {
        return NextResponse.json({
          metadata: {
            title: metadata.name,
            description: metadata.description,
            tags: metadata.tags,
            appearance: metadata.appearance,
          },
        });
      }

      throw new Error('Invalid metadata structure from LLM');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.error(`[generate-meta] Attempt ${attempt} failed:`, { data: lastError.message });

      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  // LLM  type 
  logger.warn('[generate-meta] LLM unavailable, returning default metadata for type:', { type });
  const fallback = {
    title: concept || 'Generated Image',
    description: type === 'outfit'
      ? `An elegant ${concept || 'outfit'} crafted with refined fabric and tasteful detailing.`
      : type === 'shop_item'
        ? `A thoughtfully designed ${concept || 'gift'} that conveys warmth and intention.`
        : `A beautiful ${type} image`,
    tags: type === 'outfit'
      ? ['fashion', 'apparel', 'elegant', 'studio']
      : type === 'shop_item'
        ? ['gift', 'product', 'romantic', 'studio']
        : [type, 'beautiful', 'portrait'],
    appearance: type === 'outfit'
      ? `sexy cosplay costume game wardrobe item, ${(concept || 'elegant couture').toLowerCase()}, invisible ghost mannequin, full garment front view neckline to hem, centered product, dark studio inventory backdrop, bright key light on fabric, sharp fabric weave and lace detail, rich saturated color, 8k sharp game asset render`
      : type === 'shop_item'
        ? `fantasy game prop icon of ${(concept || 'magical gift').toLowerCase()}, special effects glow, particles, centered product, dark UI backdrop, bright readable lighting on the object, sharp materials metal crystal gem, 8k game asset hero shot`
        : `photorealistic three-quarter portrait of a gorgeous young adult woman age 23-28, ${(concept || 'natural beauty').toLowerCase()}, looking at viewer, sharp detailed face and eyes, natural skin texture, large breasts, wide hips, hourglass figure, bright clear lighting, well-lit, 8k ultra photorealistic`,
  };
  return NextResponse.json({ metadata: fallback });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;

    let concept: string;
    let type: string;
    let girlfriendData: any;
    let outfitData: any;
    let propData: any;
    try {
      const body = await req.json();
      concept = body.concept;
      type = body.type;
      girlfriendData = body.girlfriendData;
      outfitData = body.outfitData;
      propData = body.propData;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!concept || !type) {
      return NextResponse.json({ error: 'Missing concept or type' }, { status: 400 });
    }

    //   
    if (type === 'outfit') {
      const od = (outfitData as Record<string, unknown>) || {};
      const outfitPrompt = `You write FLUX.1 image captions for a game wardrobe catalog (clothing as product assets).

OUTFIT INFO:
- Name: ${od.name || concept}
- Category: ${od.category || 'general'}
- Tier: ${od.tier || 'free'}
- Description: ${od.description || 'Not provided'}

Return valid JSON only:
1. name: creative English outfit name (2-3 words)
2. description: 1-2 sentence fashion blurb
3. tags: 4-6 English fashion tags
4. appearance: FLUX caption, 60-120 words, natural language. Rules:
- POSITIVE language only (never write "no person/no face/without human" — causes black frames on FLUX)
- Use: "invisible ghost mannequin", "clothing only display", "full garment front view"
- Centered product, neckline to hem visible
- Dark studio / game inventory backdrop
- Bright clear key light on fabric (never soft focus / bokeh / blur / dreamy)
- Describe fabric, color, cut, trim, sexy cosplay vibe
- End with: sharp 8k game asset, crisp fabric detail

Return ONLY JSON: name, description, tags, appearance.`;

      return await tryLLMWithFallback(outfitPrompt, concept, type);
    }

    //   
    if (type === 'shop_item') {
      const pd = (propData as Record<string, unknown>) || {};
      const propPrompt = `You write FLUX.1 image captions for fantasy game prop / gift shop icons.

ITEM INFO:
- Name: ${pd.name || concept}
- Type: ${pd.item_type || 'gift'}
- Category: ${pd.category || 'general'}
- Intimacy boost: ${pd.intimacy_boost ?? 0}
- Description: ${pd.description || 'Not provided'}

Return valid JSON only:
1. name: creative English item name (1-3 words)
2. description: 1-2 warm romantic sentences
3. tags: 3-5 English tags
4. appearance: FLUX caption, 50-100 words. Rules:
- POSITIVE language only (never "no person/no face")
- Single centered prop, fills ~60% of frame
- Magical VFX: glow, particles, aura as appropriate
- Dark game UI backdrop; prop itself brightly lit and readable
- Materials: metal, crystal, gem, silk etc. with crisp detail
- NEVER: blurry, soft focus, bokeh, dreamy, shallow dof
- End with: 8k sharp game asset, commercial shop hero

Return ONLY JSON: name, description, tags, appearance.`;

      return await tryLLMWithFallback(propPrompt, concept, type);
    }

    // Girlfriend portrait — FLUX.1 natural-language caption
    let detailedPrompt = `You write FLUX.1-dev image captions for photoreal AI companion portraits. Concept: "${concept}".`;

    if (girlfriendData) {
      detailedPrompt += `

GIRLFRIEND TRAITS (must match — do not invent conflicting look):
- Name: ${girlfriendData.name || 'Unknown'}
- Personality: ${girlfriendData.personality || 'Not specified'}
- Tags: ${Array.isArray(girlfriendData.tags) ? girlfriendData.tags.join(', ') : girlfriendData.tags || 'Not specified'}
- Appearance notes: ${girlfriendData.appearance || 'Not specified'}
- Race/Ethnicity: ${girlfriendData.appearance_race || 'Not specified'}
- Hair: ${girlfriendData.appearance_hair || 'Not specified'} ${girlfriendData.appearance_hair_color || ''}
- Eyes: ${girlfriendData.appearance_eyes || 'Not specified'}
- Body: ${girlfriendData.appearance_body || 'Not specified'}
- Style: ${girlfriendData.appearance_style || 'Not specified'}

Tailor name, bio, and appearance to THIS person only.`;
    }

    detailedPrompt += `

Return valid JSON only:
1. name: English name (2-3 words) matching her vibe
2. description: warm 2-3 sentence English bio reflecting her personality
3. tags: 4-6 English tags
4. appearance: FLUX image caption — 80-140 words max (shorter is better for FLUX). Natural language, not SD1.5 tag spam.

STRUCTURE for appearance (single flowing paragraph):
- "photorealistic three-quarter body portrait of [name/description], gorgeous young adult woman age 23-28"
- Face: eyes, hair, expression looking at viewer
- Body: large breasts, wide hips, hourglass / match her body type; sexy figure
- Clothing: specific outfit matching her style
- Pose + scene: unique action and location
- Lighting: BRIGHT CLEAR well-lit (studio softbox / golden hour sun / window daylight) — subject must be clearly visible
- Quality close: sharp focus, detailed face and natural skin texture, 8k ultra photorealistic

FORBIDDEN in appearance (causes black/muddy FLUX frames):
blurry, blur, soft focus, bokeh, shallow depth of field, dreamy, ethereal, hazy, foggy, out of focus, "no person", "without face"

NEVER write negative directives in appearance. Prefer empty negative prompt on FLUX.

EXAMPLE (style only, do not copy):
"photorealistic three-quarter portrait of a stunning young woman with long auburn waves and green eyes, looking at viewer with a soft smile, large breasts, wide hips, hourglass figure, wearing a cream knit sweater and high-waisted jeans, standing by a sunlit cafe window, bright natural daylight on face, sharp detailed face and eyes, natural skin texture, 8k ultra photorealistic"

Return ONLY JSON: name, description, tags, appearance. No markdown.`;

    return await tryLLMWithFallback(detailedPrompt, concept, type);
  } catch (error) {
    logger.error('Generate metadata error:', { data: error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate metadata' },
      { status: 500 }
    );
    }
}
