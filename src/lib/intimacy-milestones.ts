/**
 * 亲密值里程碑：跨过 300/600/1000/1500 时奖励积分 + 自动生成专属立绘，
 * 立绘存入伴侣资料库（generation_assets.meta.milestone 标记，幂等），
 * 并在聊天里插入一条庆祝消息。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { grantCredits } from '@/lib/credit-system';
import { logger } from '@/lib/logger';
import { routeImageGeneration } from '@/lib/image-router';
import { resolveImageUrl, uploadDataUrl } from '@/lib/storage';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';
import { normalizeCompanionCategory, normalizeCompanionRenderStyle } from '@/lib/companion-category';

export const INTIMACY_MILESTONES: Record<number, { credits: number; label: string; labelZh: string; prompt: string }> = {
  3: {
    credits: 60,
    label: 'Passionate',
    labelZh: '热恋',
    prompt:
      'seductive lace lingerie half-body portrait, teasing expression, soft bedroom lighting, natural skin texture, photorealistic, tasteful adult mood',
  },
  4: {
    credits: 120,
    label: 'Ultimate Partner',
    labelZh: '极品女友',
    prompt:
      'intimate teasing portrait, sheer silk chemise, warm candlelight, confident loving gaze, natural skin texture, photorealistic, tasteful adult mood',
  },
  5: {
    credits: 200,
    label: 'Ultimate Devotion',
    labelZh: '极品母狗',
    prompt:
      'passionate devoted portrait, elegant sheer robe, warm golden light, loving gaze, natural skin texture, photorealistic, tasteful adult mood',
  },
  6: {
    credits: 300,
    label: 'Soulmate',
    labelZh: '灵魂伴侣',
    prompt:
      'soulmate intimate portrait, soft moonlight, bare shoulders, tender loving eyes, natural skin texture, photorealistic, tasteful adult mood',
  },
};

type SupabaseLike = SupabaseClient;

/** 检查并发放该伴侣当前亲密等级对应的里程碑奖励（幂等）。返回新解锁的里程碑等级。 */
export async function maybeUnlockIntimacyMilestone(
  client: SupabaseLike,
  userId: string,
  girlfriendId: string,
  currentLevel: number,
): Promise<number[]> {
  const unlocked: number[] = [];
  try {
    for (const [lv, cfg] of Object.entries(INTIMACY_MILESTONES)) {
      const level = Number(lv);
      if (currentLevel < level) continue;

      const { data: existing } = await client
        .from('generation_assets')
        .select('id')
        .eq('girlfriend_id', girlfriendId)
        .eq('meta->>milestone', String(level))
        .limit(1);
      if (existing && existing.length > 0) continue;

      unlocked.push(level);

      // 积分奖励
      await grantCredits(
        client,
        userId,
        cfg.credits,
        'intimacy_milestone',
        girlfriendId,
      ).catch(() => undefined);

      // 专属立绘（best-effort，失败不阻塞）
      void generateMilestonePortrait(client, userId, girlfriendId, level, cfg.prompt).catch((e) => {
        logger.warn('[milestone] portrait generation failed', {
          userId,
          girlfriendId,
          level,
          err: e instanceof Error ? e.message : String(e),
        });
      });
    }
  } catch (e) {
    logger.warn('[milestone] check failed', {
      userId,
      girlfriendId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
  if (unlocked.length) {
    logger.info('[milestone] unlocked', { userId, girlfriendId, levels: unlocked });
  }
  return unlocked;
}

async function generateMilestonePortrait(
  client: SupabaseLike,
  userId: string,
  girlfriendId: string,
  level: number,
  prompt: string,
): Promise<void> {
  const { data: gf } = await client.from('girlfriends').select('*').eq('id', girlfriendId).maybeSingle();
  if (!gf) return;
  const rec = gf as Record<string, unknown>;
  const category = normalizeCompanionCategory({
    gender: String(rec.gender || ''),
    style: String(rec.appearance_style || ''),
    tags: rec.tags,
  });
  const renderStyle = normalizeCompanionRenderStyle({
    renderStyle: rec.render_style,
    animeRenderStyle: rec.anime_render_style,
    visualStyle: rec.visual_style,
    appearanceStyle: rec.appearance_style,
    tags: rec.tags,
  });
  const route = resolveImageGenerationRoute({
    surface: 'companion',
    category,
    renderStyle,
    nsfwIntensity: Math.min(level, 5) as 1 | 2 | 3 | 4 | 5,
  });
  const reference =
    String(rec.face_reference_url || '') ||
    String(rec.portrait_url || '') ||
    String(rec.avatar_url || '') ||
    undefined;
  const identity = [
    rec.name,
    rec.age ? `age ${String(rec.age)}` : '',
    rec.appearance_race,
    rec.appearance_hair_color,
    rec.appearance_hair,
    rec.appearance_eyes,
    rec.appearance_body,
    rec.appearance_style,
  ].filter(Boolean).map(String).join(', ');

  const result = await routeImageGeneration({
    prompt: `${prompt}. ${identity ? `Same woman: ${identity}.` : ''} Identical face and body to the reference.`,
    negative_prompt:
      'blurry, lowres, bad anatomy, deformed hands, watermark, text, plastic skin, AI look, oversmoothed, extra limbs',
    width: 832,
    height: 1216,
    num_inference_steps: route.steps,
    guidance_scale: route.cfg,
    ip_adapter_image: reference,
    ip_adapter_weight: 0.7,
    ckpt_name: route.checkpoint,
    sampler_name: route.sampler,
    scheduler: route.scheduler,
    clip_skip: route.clipSkip,
    model_family: route.modelFamily,
    force_provider: route.modelFamily === 'flux' ? 'runpod' : 'runpod_dc2',
    endpoint_id: route.endpointId,
    nsfw: true,
  });
  if (result.pending || !result.images[0]) {
    throw new Error(result.pending ? 'queued' : 'no image');
  }

  const first = result.images[0];
  const dataUrl = first.startsWith('http') || first.startsWith('data:')
    ? first
    : `data:image/png;base64,${first}`;
  const key = `girlfriends/${girlfriendId}/milestone_${level}_${Date.now()}`;
  const storedKey = await uploadDataUrl(dataUrl, key);
  const url = (await resolveImageUrl(storedKey)) || storedKey;

  await client.from('generation_assets').insert({
    created_by: userId,
    girlfriend_id: girlfriendId,
    kind: 'girlfriend',
    storage_key: key,
    url,
    prompt: prompt.slice(0, 500),
    category: 'photo',
    media_type: 'image',
    meta: {
      milestone: level,
      milestone_reward: true,
      source: 'intimacy_milestone',
      nsfw_intensity: Math.min(level, 5),
    },
  });

  const cfg = INTIMACY_MILESTONES[level];
  await client.from('chat_messages').insert({
    user_id: userId,
    girlfriend_id: girlfriendId,
    role: 'assistant',
    content: `我们的关系到「${cfg.labelZh}」啦……这张专属立绘，只给你看 💝`,
    media_url: url,
    media_type: 'image',
    metadata: { source: 'intimacy_milestone', milestone: level },
  });
}
