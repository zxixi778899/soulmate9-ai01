import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { runpodClient } from "@/lib/runpod";
import {
  DEFAULT_PREGEN_TEMPLATES,
  DEFAULT_PREGEN_POOL_CONFIG,
  getPoolStatus,
  type PregenPoolConfig,
  type PregenSceneTemplate,
} from "@/lib/pregeneration-pool";

export const dynamic = "force-dynamic";

const PREGEN_CONFIG_KEY = "pregen_pool_config";

// --- Helpers ---

async function loadPoolConfig(supabase: any): Promise<PregenPoolConfig> {
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", PREGEN_CONFIG_KEY)
      .maybeSingle();
    if (data?.value) {
      return { ...DEFAULT_PREGEN_POOL_CONFIG, ...data.value };
    }
  } catch {
    // Table may not exist yet
  }
  return DEFAULT_PREGEN_POOL_CONFIG;
}

/**
 * Build a final prompt from a template + companion appearance data.
 */
function buildPromptFromTemplate(
  template: PregenSceneTemplate,
  appearance: { name: string; hair_color: string; eye_color: string },
): string {
  return template.prompt_template
    .replace(/{name}/g, appearance.name || "the girl")
    .replace(/{hair_color}/g, appearance.hair_color || "dark")
    .replace(/{eye_color}/g, appearance.eye_color || "brown");
}

// --- GET: Pool status + templates + recent generations ---

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;

  try {
    const config = await loadPoolConfig(admin.supabase);
    const companionId = request.nextUrl.searchParams.get("companion_id") || undefined;
    const status = await getPoolStatus(admin.supabase, companionId);

    // Recent generations (last 20)
    let recent: unknown[] = [];
    try {
      let q = admin.supabase
        .from("pregen_image_pool")
        .select("id, companion_id, scene, image_url, usage_count, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (companionId) q = q.eq("companion_id", companionId);
      const { data } = await q;
      recent = data || [];
    } catch {
      // Table may not exist
    }

    return NextResponse.json({
      config,
      templates: DEFAULT_PREGEN_TEMPLATES,
      status,
      recent,
    });
  } catch (e) {
    logger.error("[pregen-admin] GET failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Failed to load pool status" }, { status: 500 });
  }
}

// --- POST: Trigger batch pre-generation ---
// Body: { companion_ids: string[], scene_ids: string[] }

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, "admin");
  if (admin.error) return admin.error;

  try {
    const body = await request.json();
    const companionIds: string[] = body.companion_ids || [];
    const sceneIds: string[] = body.scene_ids || [];

    if (!companionIds.length || !sceneIds.length) {
      return NextResponse.json(
        { error: "Both companion_ids and scene_ids are required" },
        { status: 400 },
      );
    }

    const config = await loadPoolConfig(admin.supabase);
    const templates = (config.scenes || DEFAULT_PREGEN_TEMPLATES).filter((t) =>
      sceneIds.includes(t.id),
    );

    if (!templates.length) {
      return NextResponse.json({ error: "No valid scene_ids found" }, { status: 400 });
    }

    const results: Array<{ companion_id: string; scene: string; status: string; image_url?: string; error?: string }> = [];

    for (const companionId of companionIds) {
      // Fetch companion appearance data
      const { data: companion } = await admin.supabase
        .from("girlfriends")
        .select("id, name, hair_color, eye_color")
        .eq("id", companionId)
        .maybeSingle();

      if (!companion) {
        for (const t of templates) {
          results.push({ companion_id: companionId, scene: t.id, status: "skipped", error: "Companion not found" });
        }
        continue;
      }

      const appearance = {
        name: companion.name || "the girl",
        hair_color: companion.hair_color || "dark",
        eye_color: companion.eye_color || "brown",
      };

      for (const template of templates) {
        try {
          const prompt = buildPromptFromTemplate(template, appearance);

          // Submit to RunPod via existing client
          const urls = await runpodClient.generateAndUpload(
            {
              prompt,
              width: 832,
              height: 1216,
              num_inference_steps: 22,
              guidance_scale: 1.8,
              num_images: 1,
            },
            "pregen-pool",
          );

          if (!urls.length) {
            results.push({ companion_id: companionId, scene: template.id, status: "failed", error: "No image returned" });
            continue;
          }

          // Store in pregen_image_pool
          const { error: insertError } = await admin.supabase
            .from("pregen_image_pool")
            .insert({
              companion_id: companionId,
              scene: template.id,
              prompt,
              image_url: urls[0],
              tags: template.tags,
              usage_count: 0,
            });

          if (insertError) {
            results.push({ companion_id: companionId, scene: template.id, status: "failed", error: insertError.message });
          } else {
            results.push({ companion_id: companionId, scene: template.id, status: "ok", image_url: urls[0] });
          }
        } catch (e) {
          results.push({
            companion_id: companionId,
            scene: template.id,
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    const succeeded = results.filter((r) => r.status === "ok").length;
    logger.info("[pregen-admin] batch complete", { total: results.length, succeeded });

    return NextResponse.json({ results, succeeded, total: results.length });
  } catch (e) {
    logger.error("[pregen-admin] POST failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Batch generation failed" }, { status: 500 });
  }
}

// --- DELETE: Remove pool entries ---
// Query params: ?id=xxx (single entry) or ?companion_id=xxx (clear all for companion)

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request, "admin");
  if (admin.error) return admin.error;

  try {
    const id = request.nextUrl.searchParams.get("id");
    const companionId = request.nextUrl.searchParams.get("companion_id");

    if (!id && !companionId) {
      return NextResponse.json(
        { error: "Provide ?id=xxx or ?companion_id=xxx" },
        { status: 400 },
      );
    }

    let query = admin.supabase.from("pregen_image_pool").delete();
    if (id) {
      query = query.eq("id", id);
    } else {
      query = query.eq("companion_id", companionId!);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logger.info("[pregen-admin] deleted entries", { id, companionId });
    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("[pregen-admin] DELETE failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

// --- PATCH: Update pool config (stored in site_settings) ---

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request, "admin");
  if (admin.error) return admin.error;

  try {
    const body = await request.json();
    const current = await loadPoolConfig(admin.supabase);

    const next: PregenPoolConfig = {
      enabled: body.enabled ?? current.enabled,
      max_pool_size: body.max_pool_size ?? current.max_pool_size,
      scenes: body.scenes ?? current.scenes,
      auto_fill: body.auto_fill ?? current.auto_fill,
    };

    // Upsert into site_settings
    const { error } = await admin.supabase.from("site_settings").upsert(
      { key: PREGEN_CONFIG_KEY, value: next, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logger.info("[pregen-admin] config updated", { enabled: next.enabled, max_pool_size: next.max_pool_size });
    return NextResponse.json({ success: true, config: next });
  } catch (e) {
    logger.error("[pregen-admin] PATCH failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Config update failed" }, { status: 500 });
  }
}

