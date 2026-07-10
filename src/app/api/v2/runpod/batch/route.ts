import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';
import { uploadFile, resolveImageUrl } from '@/lib/storage';
import {
  assembleGirlfriendFromRow,
} from '@/lib/prompt/girlfriend';
import { runpodClient } from '@/lib/runpod';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ============================================================
// v2 batch image generation (SSE) — fill missing girlfriend portraits
// Events: start | log | progress | complete | error | done
// ============================================================

function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function isMissingPortrait(row: {
  portrait_url?: string | null;
  avatar_url?: string | null;
}): boolean {
  const p = (row.portrait_url || '').trim();
  const a = (row.avatar_url || '').trim();
  return !p && !a;
}

/** Guaranteed non-empty FLUX portrait prompt (fallback if card assembly fails). */
function buildBatchPrompt(char: Record<string, unknown>): { positive: string; negative: string } {
  const name = String(char.name || 'a beautiful young woman');
  let positive = '';
  let negative = '';
  try {
    const assembled = assembleGirlfriendFromRow(char, String(char.image_prompt || ''));
    positive = String(assembled.positive || '').trim();
    negative = String(assembled.negative || '').trim();
  } catch (e) {
    logger.warn('[batch] assembleGirlfriendFromRow failed, using fallback', {
      name,
      err: e instanceof Error ? e.message : String(e),
    });
  }

  if (!positive || positive.length < 20) {
    const personality = String(char.personality || 'warm, alluring').slice(0, 120);
    positive = [
      'RAW photo, masterpiece, best quality, ultra photorealistic, 8k',
      `three-quarter body portrait of ${name}`,
      'gorgeous young adult woman, 21-28 years old',
      personality,
      'large breasts, wide hips, hourglass figure, sexy alluring',
      'looking at viewer, soft cinematic lighting, detailed skin, detailed face',
    ].join(', ');
  }

  if (!negative) {
    negative =
      'blurry, deformed, bad anatomy, child, underage, watermark, text, logo, cartoon, anime';
  }

  return { positive, negative };
}

async function generateAndUpload(
  char: Record<string, unknown>,
  params: Record<string, unknown>,
): Promise<{ name: string; imageUrl: string; id?: string }> {
  const name = String(char.name || 'Character');
  const { positive, negative } = buildBatchPrompt(char);

  if (!runpodClient.isConfigured) {
    throw new Error(
      'RunPod 未配置：请设置 RUNPOD_API_KEY 与 RUNPOD_ENDPOINT_ID（或 Comfy 端点）',
    );
  }

  logger.info('[batch] generate', {
    name,
    id: char.id,
    promptLen: positive.length,
    promptHead: positive.slice(0, 80),
  });

  const result = await runpodClient.generate({
    prompt: positive,
    negative_prompt: negative,
    width: Number(params.width) || 832,
    height: Number(params.height) || 1216,
    num_inference_steps: Number(params.steps) || 28,
    guidance_scale: Number(params.cfg_scale ?? params.cfg) || 3.5,
    seed:
      params.seed != null && Number(params.seed) > 0
        ? Number(params.seed)
        : undefined,
    ckpt_name: String(params.ckpt_name || 'flux1-dev-fp8.safetensors'),
  });

  if (!result.images?.length) {
    throw new Error('RunPod 未返回图片');
  }

  const buf = Buffer.from(result.images[0], 'base64');
  const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_').slice(0, 40);
  const { key, url } = await uploadFile(
    buf,
    `batch_${Date.now()}_${safeName}.png`,
    'image/png',
    'batch-portraits',
  );

  const publicUrl = url || (await resolveImageUrl(key));
  if (!publicUrl) throw new Error('图片上传成功但无法解析 URL');

  return {
    name,
    imageUrl: publicUrl,
    id: char.id ? String(char.id) : undefined,
  };
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) {
    return new Response(
      encodeSSE('log', { type: 'error', message: '无管理员权限' }) +
        encodeSSE('done', { completed: 0, failed: 0, total: 0, skipped: true }),
      {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const params = (body.params as Record<string, unknown>) || {};
  const limit = Math.min(Math.max(Number(body.limit) || 12, 1), 30);
  const forceAll = body.force === true || body.force === 'all';
  let characters = Array.isArray(body.characters)
    ? (body.characters as Record<string, unknown>[])
    : [];

  // Auto-load missing portraits from DB (same criteria as admin images list)
  if (!characters.length) {
    try {
      const db = guard.supabase;
      const { data, error } = await db
        .from('girlfriends')
        .select(
          'id, name, personality, tags, backstory, short_description, image_prompt, character_card, appearance_race, appearance_hair, appearance_hair_color, appearance_eyes, appearance_body, appearance_style, portrait_url, avatar_url, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        logger.error('[batch] DB fetch error', { err: error.message });
      } else {
        const rows = data || [];
        const missing = forceAll
          ? rows
          : rows.filter((g) => isMissingPortrait(g));
        characters = missing.slice(0, limit).map((gf) => ({
          ...gf,
          isGirlfriend: true,
          itemCategory: 'girlfriend',
        }));
      }
    } catch (err) {
      logger.error('[batch] Failed to fetch girlfriends', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSSE(event, data)));
      };

      let completed = 0;
      let failed = 0;

      if (!characters.length) {
        send('log', {
          type: 'info',
          message: forceAll
            ? '库中没有女友记录，无需生成'
            : '没有缺失肖像的女友（portrait_url 与 avatar_url 都为空才算缺图）。若要强制重生成请传 force:true',
        });
        send('start', { total: 0 });
        send('done', { completed: 0, failed: 0, total: 0 });
        controller.close();
        return;
      }

      if (!runpodClient.isConfigured) {
        send('log', {
          type: 'error',
          message:
            'RunPod 未配置：请在环境变量设置 RUNPOD_API_KEY + RUNPOD_ENDPOINT_ID（Comfy 出图端点，不要填 vLLM）',
        });
        send('done', {
          completed: 0,
          failed: characters.length,
          total: characters.length,
        });
        controller.close();
        return;
      }

      const endpointHint = (process.env.RUNPOD_ENDPOINT_ID || '').slice(0, 8);
      send('log', {
        type: 'info',
        message: `准备生成 ${characters.length} 张${forceAll ? '（强制）' : '（仅缺图）'} · endpoint ${endpointHint || '?'}…`,
      });
      send('start', { total: characters.length });

      for (let i = 0; i < characters.length; i++) {
        const char = characters[i];
        const name = String(char.name || `Character ${i + 1}`);
        send('progress', {
          index: i,
          total: characters.length,
          name,
          status: 'generating',
        });
        send('log', {
          type: 'info',
          message: `[${i + 1}/${characters.length}] 正在生成：${name}`,
        });

        try {
          const result = await generateAndUpload(char, params);

          // Persist portrait + avatar so list hasImage becomes true
          if (char.isGirlfriend && char.id) {
            const { error: upErr } = await guard.supabase
              .from('girlfriends')
              .update({
                portrait_url: result.imageUrl,
                avatar_url: result.imageUrl,
              })
              .eq('id', String(char.id));

            if (upErr) {
              logger.warn('[batch] DB update failed', {
                id: char.id,
                err: upErr.message,
              });
              send('log', {
                type: 'error',
                message: `${name} 图已出但写库失败：${upErr.message}`,
              });
            } else {
              send('log', {
                type: 'success',
                message: `✓ ${name} 已写回 portrait_url / avatar_url`,
              });
            }
          }

          completed += 1;
          send('complete', {
            index: i,
            name: result.name,
            imageUrl: result.imageUrl,
            status: 'completed',
          });
          send('log', {
            type: 'success',
            message: `✓ 完成 ${name}`,
          });
        } catch (error) {
          failed += 1;
          const msg = error instanceof Error ? error.message : 'Unknown error';
          logger.error('[batch] item failed', { name, err: msg });
          send('error', { index: i, name, error: msg, status: 'failed' });
          send('log', {
            type: 'error',
            message: `✗ ${name}：${msg}`,
          });
        }
      }

      send('log', {
        type: 'info',
        message: `全部结束：成功 ${completed}，失败 ${failed}`,
      });
      send('done', {
        completed,
        failed,
        total: characters.length,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
