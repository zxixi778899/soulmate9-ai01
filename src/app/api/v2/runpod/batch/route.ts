import { NextRequest } from 'next/server';
import { getCozeAccessToken, COZE_API_BASE } from '@/lib/coze-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { uploadDataUrl, resolveImageUrl } from '@/lib/storage';
import { requireAdmin } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for batch generation

// ============================================================
// v2 — 完全自包含的批量生成路由（SSE 流式输出）
// ============================================================

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';
const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

async function callLLM(messages: { role: string; content: string }[]): Promise<string> {
  const token = await getCozeAccessToken();
  const res = await fetch(`${COZE_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: 'doubao-seed-2-0-pro-260215',
      messages,
      temperature: 0.8,
      max_tokens: 1024,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`LLM error: ${await res.text().catch(() => 'unknown')}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let fullContent = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6));
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) fullContent += delta;
        } catch {}
      }
    }
  }
  return fullContent.trim();
}

// ── 核心提示词常量 — 强调美女/女友/性感 ──
const QUALITY_DIRECTION = "ultra photorealistic, shot on Canon EOS R5 with 85mm f/1.4 lens, shallow depth of field, creamy bokeh, magazine cover quality, 8K UHD, visible natural skin texture, natural skin pores and subtle imperfections, no plastic smoothing, no AI artifacts, hyperrealistic photograph, natural film grain";

const BEAUTY_DIRECTION = "stunningly beautiful gorgeous young woman, sexy attractive alluring, perfect figure, flawless glowing skin, magazine model quality, Instagram influencer aesthetic, captivating natural beauty, warm radiant complexion";

const MOOD_DIRECTION = "warm vibrant colors, bright and inviting atmosphere, intimate genuine moment, girlfriend-next-door vibe, approachable beauty, natural genuine emotion, alive and dynamic, soft warm tones, romantic tender quality";

const EXPRESSION_POOL = [
  // 基于参考图片的自然表情
  'soft warm genuine smile showing teeth, eyes sparkling with natural catchlights, looking directly at viewer',
  'lips slightly parted, soft contemplative gaze, eyes half-lidded, looking at viewer with quiet confidence',
  'playful smirk, one corner of mouth lifted, mischievous glint in eyes, natural asymmetry',
  'bright warm smile, eyes crinkling at corners, genuine joy, head tilted slightly',
  'soft seductive smile, lips slightly parted, inviting gaze, chin tilted down slightly',
  'gentle shy smile, looking up through lashes, natural blush, vulnerable and approachable',
  'confident knowing smile, direct eye contact, self-assured, relaxed features',
  'dreamy contented look, eyes half-closed, peaceful bliss, soft parted lips',
  'candid laughter, head tilted back slightly, natural unposed moment, eyes closed with joy',
  'soft biting lower lip, looking up with anticipation, natural curiosity',
  'sultry bedroom eyes, relaxed features, sensual mood, lips naturally parted',
  'warm welcoming expression, soft eyes, natural smile, approachable beauty',
  'thoughtful pensive look, eyes slightly off-camera, lips parted, introspective mood',
  'bright-eyed curious look, slight head tilt, engaged attention, natural catchlights',
  'soft pensive half-smile, lips slightly parted, warm engaged gaze, natural skin texture visible',
];

function genPrompt(gf: Record<string, unknown>): string {
  const card = (gf.character_card && typeof gf.character_card === 'object')
    ? gf.character_card as Record<string, unknown>
    : {} as Record<string, unknown>;
  const cardAppearance = (card.appearance && typeof card.appearance === 'object')
    ? card.appearance as Record<string, string>
    : {} as Record<string, string>;

  const race = (gf.appearance_race as string) || cardAppearance.race || '';
  const hair = (gf.appearance_hair as string) || cardAppearance.hair_style || '';
  const hairColor = (gf.appearance_hair_color as string) || cardAppearance.hair_color || '';
  const eyes = (gf.appearance_eyes as string) || cardAppearance.eyes || '';
  const body = (gf.appearance_body as string) || cardAppearance.body || '';
  const style = (gf.appearance_style as string) || cardAppearance.style || '';

  // Random pools for diversity — 基于参考图片的自然姿势
  // 核心：不对称、放松、自然S曲线、亲密感
  const posePool = [
    // 参考图1: 跪坐沙发旁，手托脸颊
    'kneeling on wooden floor, leaning forward with elbows resting on sofa arm, head tilted and resting on fist, relaxed asymmetrical pose, soft natural body curve',
    // 参考图2: 靠窗拉伸，双手举过头顶
    'standing leaning back against window frame, arms raised overhead in loose stretch, one hand resting on back of head, weight on back leg, front leg bent, casual relaxed pose',
    // 参考图3: 站立三分身，手放在内衣边缘
    'standing in relaxed three-quarter pose, weight shifted to one hip, natural S-curve in torso, hands resting lightly on bra edge, fingers slightly curled, confident inviting stance',
    // 参考图4: 盘腿坐在镜面房间
    'sitting cross-legged on reflective floor, torso leaning back slightly, one hand resting on floor behind, other hand lifted to face with fingers touching lower lip, thoughtful pensive pose',
    // 参考图5: 跪姿，双手拉起衣服下摆
    'kneeling with knees spread, hips slightly forward, torso upright with slight back arch, hands gripping bottom of top pulling it upward, confident direct gaze at viewer',
    // 参考图6: 海滩自拍角度
    'casual selfie angle, one arm extended forward holding camera, upper body turned slightly, head tilted toward shoulder, relaxed asymmetrical pose, wind-tousled hair',
    // 参考图7: 坐在椅子上，肩带滑落
    'seated in wooden chair, leaning slightly forward toward camera, head tilted gently to one side, one shoulder strap slipped down arm, relaxed unposed posture, introspective downward gaze',
    // 参考图8: 坐在沙发上，手放在大腿上
    'seated cross-legged on soft sofa, knees bent wide, torso slightly angled toward camera with gentle backward lean, hands resting loosely on thighs, relaxed casual slouch',
    // 更多自然姿势
    'sitting on windowsill, legs dangling, chin resting on one hand, gazing at viewer with soft inviting eyes, warm natural light on face',
    'leaning against doorframe, one hand on frame above head, looking back over shoulder with coy smile, hair cascading down',
    'walking toward camera mid-stride, hair flowing with movement, caught in candid moment, natural smile, arms relaxed at sides',
    'lying on her side propped up on one elbow, free hand tracing collarbone, smoldering gaze, hair spread naturally',
    'reclining in armchair, one leg tucked under, holding glass casually, relaxed sensual posture, soft warm lighting',
    'standing barefoot on balcony, wind catching hair, eyes closed briefly, peaceful expression, arms relaxed',
    'sitting at vanity applying lipstick, caught in mirror reflection, intimate private moment, soft focused expression',
    'standing with one foot on step, hand on knee, leaning forward slightly, engaging pose, direct eye contact',
    'sitting on floor legs stretched out, leaning back on hands, head tilted back, laughing naturally',
    'standing with arms raised stretching, mid-yawn, caught in private morning moment, natural unposed',
    'lying on back looking up at camera, hair spread around, dreamy contented expression, soft natural light',
    'sitting on stairs, elbows on knees, hands clasped, looking down thoughtfully, hair falling forward',
    'walking away looking over shoulder, hair cascading down back, inviting follow-me gesture, natural smile',
    'standing with arms outstretched, face to sky, breathing deeply, free-spirited moment, eyes closed',
    'sitting at cafe table, holding cup with both hands, steam rising, cozy intimate pose, warm smile',
    'leaning against bookshelf, one leg bent with foot on shelf, book in hand, intellectual allure, soft smile',
    'kneeling on floor sitting back on heels, hands in lap, looking up with innocent eyes, natural light on face',
    'reclining on chaise lounge, one arm behind head, legs crossed, elegant relaxation, confident gaze',
    'standing in contrapposto, one knee slightly bent, arms relaxed, serene confident expression, natural hip tilt',
    'sitting on edge of bed, hands behind supporting weight, looking up at viewer through lashes, intimate mood',
    'leaning forward with elbows on table, chin on interlocked fingers, intense eye contact, lips slightly parted',
    'standing with one hand touching hair, slight head tilt, lips parted, eyes locked on viewer, natural catchlights',
  ];

  // ── 光线池 — 基于参考图片的温暖自然光 ──
  const lightingPool = [
    'soft natural window light streaming from side, warm golden highlights on skin, gentle diffused shadows, radiant glowing complexion, creamy bokeh background',
    'bright natural daylight from large window, soft diffused quality, subtle lens flare, warm skin tones, natural catchlights in eyes, gentle shadow gradients',
    'soft bright diffused indoor lighting, warm even illumination, no harsh shadows, skin glowing naturally, vibrant warm colors, magazine quality light',
    'warm overhead key light creating soft shadows under chin and neck, ambient colored reflections adding depth, skin luminous and warm, dramatic but flattering',
    'dual-color dramatic lighting, warm pink-red light on one side blending with cool blue-purple on other, soft gradients across skin, sensual moody atmosphere',
    'bright natural overhead sunlight, warm golden quality, sun-kissed skin with natural highlights on collarbones and shoulders, vibrant turquoise water reflections, summer energy',
    'golden hour sunlight through large windows, warm amber glow on skin, vibrant colors, soft shadow gradients, radiant ethereal quality',
    'warm sunset light casting golden-orange tones, romantic glow, skin luminous and radiant, hair catching light with warm highlights',
    'bright morning sunlight, fresh energetic vibe, clear vibrant colors, dewy fresh skin, natural window light quality',
    'soft diffused overcast natural light, even flattering illumination, skin smooth and luminous, colors vibrant and warm, no harsh shadows',
    'warm interior lighting mixed with window light, cozy inviting atmosphere, skin warm and glowing, intimate bedroom vibe',
    'bright studio beauty lighting, soft overhead key light with fill, catchlights sparkling in eyes, skin flawless and radiant, professional magazine quality',
    'backlit by warm sun creating rim lighting on hair, subtle lens flare, glowing ethereal halo effect, face softly lit by fill light',
    'warm candlelight mixed with soft fairy lights, romantic intimate golden glow, skin warm and inviting, flickering natural quality',
    'bright beach sunlight with water reflections, sun-kissed glowing skin, vibrant summer colors, energetic vacation vibe',
    'warm fireplace glow casting orange-amber light, cozy intimate atmosphere, skin glowing warmly, soft dancing light quality',
    'soft moonlight through sheer curtains, gentle silver-blue glow mixed with warm interior light, dreamy romantic quality',
    'warm pink and purple sunset colors reflecting on skin, romantic dreamy atmosphere, golden hour magic, skin glowing with warm tones',
    'bright window light through sheer curtains diffusing softly, warm intimate glow, bedroom morning vibe, natural skin texture visible',
    'warm tropical sunlight with palm tree shadow patterns, vibrant vacation vibes, sun-kissed glowing skin, paradise atmosphere',
  ];

  // ── 场景池 — 基于参考图片的温馨亲密场景 ──
  const scenePool = [
    'warm sunlit room with honey-blonde wooden floor, plush white tufted sofa, large window with sheer curtains revealing green garden outside, shallow depth of field, cozy intimate home atmosphere',
    'bright cozy bedroom with patterned curtain, black-framed window with bright daylight, warm neutral walls, lived-in intimate space, natural home environment',
    'bright modern apartment with white-framed glass door, blurred greenery visible outside, plain white walls, warm natural light flooding in, clean inviting living space',
    'stylish mirrored room creating infinite reflections, dim neon-lit urban space visible in background, warm overhead lighting, sophisticated intimate atmosphere, urban luxury vibe',
    'soft draped white fabric backdrop with gentle folds catching colored light, minimalist intimate studio setting, focus entirely on subject, clean elegant background',
    'beautiful tropical beach with turquoise ocean water, clear blue sky with soft clouds, white sand, distant boats, bright summer paradise, vacation atmosphere',
    'intimate room with vintage carved wooden chair, warm muted wall split between cool blue-gray shadow and bright sunlit white section, shallow depth of field, nostalgic film-like atmosphere',
    'cozy living room with dark teal textured sofa, warm-toned wooden door with small metal plate, light gray walls, soft natural light from side, lived-in intimate home setting',
    'bright modern apartment with large windows, city view, white walls, vibrant decor, sunlight flooding in, warm inviting atmosphere',
    'cozy colorful bedroom with fairy lights, plants, pastel colors, warm inviting atmosphere, soft morning light',
    'rooftop terrace at sunset, string lights overhead, city skyline in background, golden hour glow, romantic intimate vibe',
    'bright cafe with large windows, warm wood tones, fresh flowers on table, morning sunlight streaming in, cozy atmosphere',
    'sunny Mediterranean balcony with colorful flowers, sea view in background, bright blue sky, warm stone walls',
    'lush greenhouse with tropical plants, bright natural light filtering through glass, fresh green colors, exotic intimate setting',
    'bright hotel room with marble floors, fresh flowers, warm ambient light, luxurious feel, large windows with view',
    'tropical beach at golden hour, white sand, turquoise water, palm trees casting shadows, paradise vacation vibe',
    'bright garden with blooming flowers, warm sunshine, spring atmosphere, soft bokeh background, natural beauty',
    'modern bright kitchen with white cabinets, fresh fruit bowl, morning light through window, cheerful domestic vibe',
    'bright Parisian-style apartment with large windows, fresh flowers in vase, elegant decor, soft diffused light',
    'luxury yacht deck, ocean view, bright sunshine, blue sky, vacation paradise, exclusive intimate setting',
  ];

  const randomPose = posePool[Math.floor(Math.random() * posePool.length)];
  const randomLighting = lightingPool[Math.floor(Math.random() * lightingPool.length)];
  const randomScene = scenePool[Math.floor(Math.random() * scenePool.length)];

  // ── Build subject description — 强调美女/性感 ──
  const subjectParts: string[] = [BEAUTY_DIRECTION, 'Full body portrait'];
  if (race) subjectParts.push(`${race} ethnicity`);
  if (hair || hairColor) subjectParts.push(`with beautiful ${[hairColor, hair].filter(Boolean).join(' ')} hair`);
  if (eyes) subjectParts.push(`gorgeous ${eyes} eyes`);
  if (body) subjectParts.push(`${body} sexy figure`);

  const clothingDescs: Record<string, string> = {
    'casual chic': 'a fitted white tee and high-waisted jeans, simple gold necklace',
    'elegant': 'a sleek black midi dress with thin straps, delicate gold earrings',
    'sporty': 'a form-fitting athletic crop top and leggings, sneakers',
    'bohemian': 'a flowy floral maxi dress with bare shoulders, layered boho jewelry',
    'minimalist': 'a tailored cream blazer over a silk camisole, straight-leg trousers',
    'trendy': 'a cropped knit top and pleated mini skirt, chunky gold hoops',
    'classic': 'a crisp button-down shirt tucked into a pencil skirt, pearl studs',
    'edgy': 'a leather moto jacket over a graphic tee, dark skinny jeans, ankle boots',
    'glamorous': 'a figure-hugging satin slip dress, strappy heels, statement earrings',
    'street style': 'an oversized denim jacket over a hoodie, biker shorts, dad sneakers',
  };
  const clothing = clothingDescs[style] || `a stylish ${style || 'casual'} outfit that flatters her figure`;

  // 随机选择表情
  const randomExpression = EXPRESSION_POOL[Math.floor(Math.random() * EXPRESSION_POOL.length)];

  const fullPrompt = [
    subjectParts.join(', ') + '.',
    `She wears ${clothing}.`,
    `${randomPose.charAt(0).toUpperCase() + randomPose.slice(1)}.`,
    `Expression: ${randomExpression}.`,
    `Setting: ${randomScene}.`,
    `Lighting: ${randomLighting}.`,
    `Shot on ${QUALITY_DIRECTION}.`,
    MOOD_DIRECTION + '.',
  ].join(' ');

  return fullPrompt;
}

function genNegativePrompt(): string {
  return 'deformed, bad anatomy, disfigured, poorly drawn face, mutation, extra limbs, ugly, ' +
    'watermark, text, logo, signature, username, low quality, blurry, distorted, bad proportions, ' +
    'disfigured hands, missing fingers, bad hands, worst quality, normal quality, jpeg artifacts, ' +
    'stiff, unnatural, plastic, artificial, dead eyes, blank expression, gloomy, depressing, ' +
    'dark shadows, harsh contrast, uncanny valley, symmetrical pose, rigid posture, forced smile, ' +
    'mannequin-like, wax figure, doll-like, oversaturated, washed out, flat lighting, cartoon, anime';
}

function buildWorkflow(prompt: string, negativePrompt: string, params: any) {
  const seed = params.seed > 0 ? params.seed : Math.floor(Math.random() * 2147483647);
  return {
    '1': { class_type: 'KSampler', inputs: { seed, steps: params.steps || 15, cfg: params.cfg_scale || 2.5, sampler_name: params.sampler || 'euler', scheduler: params.scheduler || 'simple', denoise: 1, model: ['2', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0] } },
    '2': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 1] } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['2', 1] } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: params.width || 512, height: params.height || 768, batch_size: 1 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['1', 0], vae: ['2', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'soulmate', images: ['6', 0] } },
  };
}

async function generateAndUpload(char: any, params: any): Promise<{ name: string; imageUrl: string; id?: string }> {
  const prompt = genPrompt(char);
  const negativePrompt = genNegativePrompt();
  const workflow = buildWorkflow(prompt, negativePrompt, params);

  console.log(`[batch] Generating for ${char.name || 'unknown'}, prompt length: ${prompt.length}`);

  // Submit to RunPod
  const submitRes = await fetch(`${RUNPOD_BASE_URL}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RUNPOD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { workflow } }),
  });
  if (!submitRes.ok) throw new Error(`RunPod submit failed: ${await submitRes.text()}`);
  const { id: jobId } = await submitRes.json();
  if (!jobId) throw new Error('No RunPod job ID');

  // Poll for completion
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await fetch(`${RUNPOD_BASE_URL}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    });
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.status === 'COMPLETED') {
      const images = status.output?.images || [];
      if (!images.length) throw new Error('No images in output');
      const imageBase64 = images[0].data || images[0];
      const buffer = Buffer.from(imageBase64, 'base64');
      
      // Upload to Vercel Blob
      const fileName = `batch/${Date.now()}_${(char.name || 'char').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
      const key = await uploadDataUrl(dataUrl, fileName);
      const url = await resolveImageUrl(key);

      // 如果是女友，更新数据库中的 avatar_url
      if (char.isGirlfriend && char.id) {
        try {
          const supabase = getSupabaseClient();
          await supabase
            .from('girlfriends')
            .update({ avatar_url: url })
            .eq('id', char.id);
          console.log(`[batch] Updated girlfriend ${char.id} avatar_url`);
        } catch (err) {
          console.error(`[batch] Failed to update girlfriend ${char.id}:`, err);
        }
      }

      return { name: char.name || 'Character', imageUrl: url, id: char.id };
    }
    if (status.status === 'FAILED') throw new Error(`RunPod error: ${status.error || 'unknown'}`);
  }
  throw new Error('RunPod timeout');
}

// ── SSE Helper ────────────────────────────────────
function encodeSSE(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── 批量生成入口 ──────────────────────────────────
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) {
    return new Response(encodeSSE('error', { message: 'Forbidden: admin only' }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  let characters = body.characters || [];
  const params = body.params || {};
  const specCategory = body.specCategory;

  // 如果没有传入 characters，从数据库获取没有头像的女友
  if (!characters.length) {
    try {
      const supabase = getSupabaseClient();
      const { data: girlfriends, error } = await supabase
        .from('girlfriends')
        .select('*')
        .is('avatar_url', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[batch] DB fetch error:', error);
      }

      if (girlfriends && girlfriends.length > 0) {
        characters = girlfriends.map((gf: Record<string, unknown>) => ({
          ...gf,
          isGirlfriend: true,
        }));
      } else {
        // 如果没有没有头像的女友，获取所有女友
        const { data: allGirlfriends } = await supabase
          .from('girlfriends')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (allGirlfriends) {
          characters = allGirlfriends.map((gf: Record<string, unknown>) => ({
            ...gf,
            isGirlfriend: true,
          }));
        }
      }
    } catch (err) {
      console.error('[batch] Failed to fetch girlfriends:', err);
    }
  }

  // 如果还是没有，使用默认角色
  if (!characters.length) {
    const categories = body.categories || ['girlfriend', 'girlfriend', 'girlfriend', 'girlfriend'];
    characters = categories.map((cat: string, i: number) => ({
      name: `Character ${i + 1}`,
      gender: 'woman',
      concept: ['blonde beauty', 'brunette model', 'redhead goddess', 'asian angel', 'latin beauty'][i % 5],
      appearance: '',
      itemCategory: cat,
      isGirlfriend: false,
    }));
  }

  // 过滤
  const chars = specCategory ? characters.filter((c: any) => c.itemCategory === specCategory) : characters;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(encodeSSE(event, data)));
      };

      send('start', { total: chars.length });

      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        const name = char.name || char.concept || `Character ${i + 1}`;
        send('progress', { index: i, total: chars.length, name, status: 'generating' });

        try {
          const result = await generateAndUpload(char, params);
          send('complete', { index: i, name: result.name, imageUrl: result.imageUrl, status: 'completed' });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          send('error', { index: i, name, error: msg, status: 'failed' });
        }
      }

      send('done', {});
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}