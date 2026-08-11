import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { resolveImageGenerationRoute, specialistModelsReadyFromEnv } from '@/lib/image-generation-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if (adminCheck.error) return adminCheck.error;

    const sp = new URL(req.url).searchParams;
    const intensity = Number(sp.get('intensity') || 3);
    const category = (sp.get('category') || 'female') as any;
    const renderStyle = (sp.get('style') || 'realistic') as any;

    // Raw env values
    const envCheck = {
      RUNPOD_ENDPOINT_ID_SDXL: process.env.RUNPOD_ENDPOINT_ID_SDXL || '(empty)',
      RUNPOD_SDXL_MODELS_READY: process.env.RUNPOD_SDXL_MODELS_READY || '(empty)',
      RUNPOD_SDXL_CHECKPOINTS: process.env.RUNPOD_SDXL_CHECKPOINTS || '(undeclared — flag-only mode)',
      RUNPOD_CHECKPOINT_PONY: process.env.RUNPOD_CHECKPOINT_PONY || '(empty)',
      RUNPOD_CHECKPOINT_ILLUSTRIOUS: process.env.RUNPOD_CHECKPOINT_ILLUSTRIOUS || '(empty)',
      RUNPOD_INSTALLED_LORAS_PONY: (process.env.RUNPOD_INSTALLED_LORAS_PONY || '(empty)').slice(0, 80),
      RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS: (process.env.RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS || '(empty)').slice(0, 80),
      specialistModelsReady: specialistModelsReadyFromEnv(),
    };

    // Routing decisions for NSFW 1-5
    const routes = [1, 2, 3, 4, 5].map((nsfw) => {
      const route = resolveImageGenerationRoute({
        surface: 'companion',
        category,
        renderStyle,
        nsfwIntensity: nsfw as any,
        specialistModelsReady: specialistModelsReadyFromEnv(),
      });
      return {
        nsfw,
        modelFamily: route.modelFamily,
        endpointId: route.endpointId,
        checkpoint: route.checkpoint,
        sampler: route.sampler,
        scheduler: route.scheduler,
        steps: route.steps,
        cfg: route.cfg,
        reason: route.reason,
      };
    });

    return NextResponse.json({ envCheck, routes });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
