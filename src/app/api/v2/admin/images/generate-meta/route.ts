import { NextRequest, NextResponse } from 'next/server';
import { getCozeAccessToken, COZE_API_BASE, DEFAULT_LLM_MODEL } from '@/lib/coze-auth';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
//  Coze API coze_workload_identity  JWT token
// ============================================================

/**
 *  LLM 
 *  Coze  doubao-seed-2-0-pro 
 */
async function callLLM(prompt: string): Promise<string> {
  const token = await getCozeAccessToken();

  const res = await fetch(`${COZE_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: DEFAULT_LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  const text = await res.text();
  
  // Coze API  SSE  JSON
  //  JSON 
  try {
    const json = JSON.parse(text);
    const content = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.delta?.content;
    if (content) return content.trim();
  } catch {
    //  JSON SSE 
  }
  
  //  SSE 
  let content = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const parsed = JSON.parse(line.slice(6));
        const delta = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content;
        if (delta) content += delta;
      } catch { /* skip [DONE] etc */ }
    }
  }

  return content.trim();
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
      ? `A luxurious haute couture ${(concept || 'elegant').toLowerCase()} outfit perfectly centered and symmetrically framed in the middle of the composition, headless invisible ghost mannequin support so the garment holds a sensual feminine 3D silhouette with natural drape, full front view of the entire outfit clearly visible from neckline to hem, premium opulent material  silk satin lace velvet leather  with intricate fabric weave, refined stitching, tailored couture cut, vivid saturated rich color and luxurious texture, moody dark charcoal gradient seamless studio backdrop with subtle atmospheric mist, dramatic colored rim light glowing from behind creating a luminous halo edge silhouette, soft key light from the front highlighting fabric texture, accent spotlight from above, high-end magazine editorial sensual mood, RAW photo 4K 8K UHD ultra-high resolution, tack sharp focus, hyperrealistic editorial product photography, Vogue style`
      : type === 'shop_item'
        ? `A luxurious ${(concept || 'romantic').toLowerCase()} gift item perfectly centered and symmetrically framed in the middle of the composition filling about 60 percent of the frame, isolated still life, polished opulent material with intricate surface details craftsmanship and reflections, smooth neutral gradient studio backdrop transitioning from medium cool gray at the top to soft light gray near the bottom, clean minimalist museum-gallery aesthetic with generous negative space, soft diffused key light coming from front-top-left direction gently sculpting the form and revealing every surface detail, balanced soft fill light from the opposite side reducing harsh shadows so all details remain clearly visible, gentle natural shadow grounding the product on the soft matte floor below, cool neutral color temperature, premium luxurious commercial mood, RAW photo 4K 8K UHD ultra-high resolution, tack sharp focus on every texture, hyperrealistic commercial product shot, product hero shot`
        : concept || 'A stunning woman with natural beauty',
  };
  return NextResponse.json({ metadata: fallback });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;

    const { concept, type, girlfriendData, outfitData, propData } = await req.json();

    if (!concept || !type) {
      return NextResponse.json({ error: 'Missing concept or type' }, { status: 400 });
    }

    //   
    if (type === 'outfit') {
      const od = (outfitData as Record<string, unknown>) || {};
      const outfitPrompt = `You are a creative director for a premium fashion catalog. Generate metadata for a single CLOTHING OUTFIT (no people, no models).

OUTFIT INFO:
- Name: ${od.name || concept}
- Category: ${od.category || 'general'}
- Tier: ${od.tier || 'free'}
- Description: ${od.description || 'Not provided'}

Generate the following in valid JSON format:

1. name: A creative English outfit name (2-3 words, fashion-forward, e.g. "Velvet Allure", "Crimson Bloom")
2. description: A 2-3 sentence English bio describing the outfit's style, fabric feel, and occasion. Tone: fashion magazine, elegant.
3. tags: An array of 4-6 English fashion tags (e.g. "silk", "evening", "elegant", "lace")
4. appearance: A comprehensive visual description for AI image generation, 150-250 words. CRITICAL RULES:
-  WRITE IN POSITIVE LANGUAGE ONLY. DESCRIBE WHAT IS THERE, NEVER WHAT IS ABSENT.
-  FORBIDDEN phrases (NEVER write): "no person", "no model", "no mannequin", "no human", "no body", "no face", "without a person", "no people"
   (those negative directives belong in the negative prompt, not here  writing them here will cause empty black output)
-  Instead use POSITIVE phrasing: "headless invisible ghost mannequin support holding the garment's 3D silhouette", "garment displayed alone", "floating sensual silhouette", "isolated couture piece"
- Composition: GARMENT PERFECTLY CENTERED AND SYMMETRICALLY FRAMED in the middle of the composition, full front view of entire outfit from neckline to hem
- Silhouette: dimensional 3D feminine sensual silhouette with natural couture drape (no body parts visible, just the garment shape)
- Background: MOODY DARK background ONLY (dark charcoal / deep gray / black gradient backdrop) with subtle atmospheric mist. Never use white or light background.
- Lighting: dramatic colored rim light glowing from behind creating a luminous halo edge silhouette around the garment, soft key light from the front highlighting fabric, accent spotlight from above
- Material: emphasize LUXURY OPULENT material quality  silk, satin, lace, velvet, leather, sequins  rich textures and premium craftsmanship
- MUST include: fabric type and texture, dominant rich saturated colors, couture cut/silhouette, neckline/hemline details, trim/accents (lace, embroidery, buttons, zippers, seams), drape behavior
- Mood: HIGH-END LUXURIOUS SENSUAL EDITORIAL  think Vogue / Harper's Bazaar magazine
- Camera/quality keywords: tack sharp focus, ultra-detailed, 4K, 8K UHD, crisp, hyperrealistic, RAW photo, Hasselblad
- FORBIDDEN keywords (NEVER use): blurry, blur, soft focus, out of focus, hazy, dreamy, ethereal, bokeh, depth of field, shallow dof, motion blur, plain, cheap, dull
- Describe the GARMENT ITSELF as the centered hero subject (its fabric, color, cut, details), on a dark moody background with backlight halo effect.

Return ONLY valid JSON: name, description, tags, appearance. No markdown.`;

      return await tryLLMWithFallback(outfitPrompt, concept, type);
    }

    //   
    if (type === 'shop_item') {
      const pd = (propData as Record<string, unknown>) || {};
      const propPrompt = `You are a creative director for a virtual gift / prop catalog. Generate metadata for a single PROP / GIFT ITEM (no people, no models).

ITEM INFO:
- Name: ${pd.name || concept}
- Type: ${pd.item_type || 'gift'}
- Category: ${pd.category || 'general'}
- Intimacy boost: ${pd.intimacy_boost ?? 0}
- Description: ${pd.description || 'Not provided'}

Generate the following in valid JSON format:

1. name: A creative English item name (1-3 words, e.g. "Eternal Rose", "Moonlight Pendant")
2. description: A 1-2 sentence English description of what this item is and the feeling it conveys. Tone: warm, romantic, gift-card style.
3. tags: An array of 3-5 English tags (e.g. "romantic", "luxury", "floral", "gift")
4. appearance: A comprehensive visual description for AI image generation, 100-180 words. CRITICAL RULES:
-  WRITE IN POSITIVE LANGUAGE ONLY. DESCRIBE WHAT IS THERE.
-  FORBIDDEN phrases (NEVER write): "no person", "no human", "no face", "no body part", "no model", "without a person"
   (those belong in the negative prompt  writing them here will cause empty black output)
-  Instead use POSITIVE phrasing: "isolated still life", "single object centered", "standalone product shot", "the item alone"
- Style: clean product photography, centered composition, isolated still life of the object filling about 60% of the frame
- Background: SMOOTH NEUTRAL GRADIENT studio backdrop transitioning from medium cool gray at the top to soft light gray near the bottom (NOT pure black  the product must be clearly visible against a clean gallery-style backdrop), generous negative space around the product
- MUST include: object material (gold, crystal, silk, porcelain, etc.), color palette, fine details (engraving, gemstones, petals, etc.)
- Lighting (REQUIRED): soft diffused key light coming from the front-top-left direction gently sculpting the form and revealing every surface detail; balanced soft fill light from the opposite side reducing harsh shadows so all details remain clearly visible; subtle catchlights on glossy surfaces; gentle natural shadow grounding the product on the soft matte floor below  clean, museum-gallery aesthetic, NOT moody darkness
- Camera/quality: tack sharp focus on the product, ultra-detailed, 4K, 8K UHD, hyperrealistic, commercial product hero shot
- FORBIDDEN keywords (NEVER use): blurry, blur, soft focus, out of focus, hazy, dreamy, bokeh, depth of field, motion blur, completely black background, pitch black, harsh dramatic spotlight
- Tone: luxury e-commerce, gift catalog, museum-gallery product hero
- Describe the OBJECT ITSELF as the subject, like a still-life product shot.

Return ONLY valid JSON: name, description, tags, appearance. No markdown.`;

      return await tryLLMWithFallback(propPrompt, concept, type);
    }

    //   
    // 
    let detailedPrompt = `You are a creative director for a premium AI companion platform targeting the Western market. Create metadata for a ${type} with the following concept: "${concept}".`;
    
    // 
    if (girlfriendData) {
      detailedPrompt += `

GIRLFRIEND'S UNIQUE CHARACTERISTICS:
- Name: ${girlfriendData.name || 'Unknown'}
- Personality: ${girlfriendData.personality || 'Not specified'}
- Tags: ${Array.isArray(girlfriendData.tags) ? girlfriendData.tags.join(', ') : girlfriendData.tags || 'Not specified'}
- Appearance: ${girlfriendData.appearance || 'Not specified'}
- Race/Ethnicity: ${girlfriendData.appearance_race || 'Not specified'}
- Hair: ${girlfriendData.appearance_hair || 'Not specified'}
- Eyes: ${girlfriendData.appearance_eyes || 'Not specified'}
- Body: ${girlfriendData.appearance_body || 'Not specified'}
- Style: ${girlfriendData.appearance_style || 'Not specified'}

IMPORTANT: Create metadata that reflects THIS SPECIFIC girlfriend's unique characteristics. Do NOT create generic metadata. The name, description, and appearance should be tailored to her specific traits.`;
    }
    
    detailedPrompt += `

Generate the following in valid JSON format:

1. name: A creative English name (2-3 words, like "Luna Hart", "Scarlett Rose") - should match the girlfriend's vibe

2. description: A warm 2-3 sentence English bio about HER personality and interests. Tone: friendly, confident, approachable. MUST reflect her specific personality traits.

3. tags: An array of 4-6 English tags that match HER specific style and interests (e.g., "romantic", "playful", "elegant", "fitness lover")

4. appearance: A comprehensive visual description for AI image generation. MUST be 200-300 words (1200-1800 characters).

CRITICAL RULES for appearance - EACH GIRLFRIEND MUST BE UNIQUE:
- Write like a photographer describing a REAL person in a REAL moment  natural, not artificial
- Subject: attractive young Western woman (20-28) matching HER specific characteristics
- MUST include ALL of these elements, tailored to HER specific traits:
  a) FULL BODY: her overall figure, height impression, body type (slender/curvy/athletic/petite) - match her appearance_body
  b) FACE: eye color and shape (match her appearance_eyes), lip description, natural expression, makeup style
  c) HAIR: length, style, color, texture (match her appearance_hair and appearance_hair_color)
  d) CLOTHING: specific outfit description, fit, color, style (match her appearance_style) - describe how it fits her body naturally
  e) POSE/ACTION: what she's doing RIGHT NOW, body language, hand position, stance - be specific and unique
  f) SCENE/SETTING: specific location, background elements, time of day - create a unique environment for HER
  g) LIGHTING: specific natural lighting description (golden hour through window, soft morning light, warm sunset glow, etc.) - describe how light falls on her
  h) MOOD/ATMOSPHERE: the emotional feel of the scene - intimate, playful, romantic, confident, etc.

UNIQUENESS REQUIREMENTS:
- Each girlfriend must have a COMPLETELY DIFFERENT scene, pose, and lighting
- Use her personality and tags to inspire the scene and mood
- Vary the locations: indoor/outdoor, day/night, urban/nature, etc.
- Vary the poses: standing, sitting, leaning, walking, etc.
- Vary the lighting: golden hour, soft window light, sunset glow, morning light, etc.

SHARPNESS REQUIREMENTS (CRITICAL - DO NOT VIOLATE):
- Always describe everything with TACK SHARP, in-focus, crisp, ultra-detailed, 4K, 8K UHD quality
- FORBIDDEN keywords (NEVER use any of these): blurry, blur, blurred, soft focus, out of focus, defocused, hazy, haze, misty, foggy, dreamy, ethereal, gauzy, motion blur, gaussian blur, lens blur, bokeh, shallow depth of field, depth of field, shallow dof
- The background can be softly lit but must NEVER be described as blurred / out-of-focus / bokeh
- Skin texture, eye details, hair strands, fabric weave must all be described as sharp and clear

EXAMPLE appearance (study the STYLE and LENGTH, do not copy):
"She stands barefoot on sun-warmed wooden floorboards, one hand brushing her tousled waves behind her ear. Her turquoise eyes catch the light as she glances over her shoulder, lips parted in a soft smile. She wears a loose linen shirt unbuttoned at the collar, sleeves rolled to her elbows, paired with high-waisted denim shorts that hug her curves. Through the large window behind her, golden afternoon light streams in, casting long shadows and illuminating dust motes in the air. The room smells of salt air from the nearby beach, curtains billowing gently. Her expression is dreamy and content, as if caught in a private moment of bliss."

Return ONLY valid JSON: name, description, tags, appearance. No markdown.`;

    const userPrompt = detailedPrompt;

    return await tryLLMWithFallback(userPrompt, concept, type);
  } catch (error) {
    logger.error('Generate metadata error:', { data: error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate metadata' },
      { status: 500 }
    );
    }
}
