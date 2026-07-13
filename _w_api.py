from pathlib import Path

# --- API: comfy GET volume + installed ---
p = Path("src/app/api/admin/comfy/route.ts")
t = p.read_text(encoding="utf-8")
if "view === 'volume'" not in t and "view === \"volume\"" not in t:
    needle = "  if (view === 'loras') {"
    insert = r'''  if (view === 'volume' || view === 'installed') {
    const { VOLUME_INSTALLED_LORAS, getInstalledLoraSet } = await import('@/lib/runpod-loras');
    const installed = [...getInstalledLoraSet()].sort();
    return NextResponse.json({
      volume: cfg.network_volume,
      target_volume: LORA_CATALOG.target_volume,
      region: LORA_CATALOG.region,
      base_model: LORA_CATALOG.base_model,
      installed_loras: installed,
      code_allowlist: [...VOLUME_INSTALLED_LORAS],
      env_override: !!(process.env.RUNPOD_INSTALLED_LORAS || process.env.COMFY_INSTALLED_LORAS),
      paths: {
        loras: cfg.network_volume?.loras_dir || 'models/loras',
        checkpoints: cfg.network_volume?.checkpoints_dir || 'models/checkpoints',
      },
      note:
        'installed_loras 与 Comfy LoraLoader 白名单一致；下载新文件后请更新 VOLUME_INSTALLED_LORAS 或设置 RUNPOD_INSTALLED_LORAS，并重新部署。',
    });
  }

'''
    if needle not in t:
        raise SystemExit("loras view not found")
    t = t.replace(needle, insert + needle, 1)
    p.write_text(t, encoding="utf-8", newline="\n")
    print("comfy volume view ok")
else:
    print("comfy volume already")

# --- model-library POST sync_installed ---
p2 = Path("src/app/api/admin/model-library/route.ts")
t2 = p2.read_text(encoding="utf-8")
if "sync_installed" not in t2:
    # add import if needed
    if "getInstalledLoraSet" not in t2:
        t2 = t2.replace(
            "import { LORA_CATALOG, groupLorasByCategory } from '@/lib/comfy-console/lora-catalog';",
            "import { LORA_CATALOG, groupLorasByCategory } from '@/lib/comfy-console/lora-catalog';\nimport { getInstalledLoraSet } from '@/lib/runpod-loras';",
            1,
        )
    marker = "  if (action === 'import_catalog') {"
    block = r'''  if (action === 'sync_installed') {
    const lib = await loadModelLibrary(admin.supabase);
    const installed = getInstalledLoraSet();
    let updated = 0;
    const now = new Date().toISOString();
    for (const it of lib.items) {
      const fn = String(it.filename || '').trim();
      if (!fn) continue;
      if (installed.has(fn) && it.status !== 'downloaded') {
        it.status = 'downloaded';
        it.updated_at = now;
        updated += 1;
      } else if (!installed.has(fn) && it.status === 'downloaded' && body.demote_missing) {
        it.status = 'wishlist';
        it.updated_at = now;
        updated += 1;
      }
    }
    lib.updated_at = now;
    await saveModelLibrary(lib, admin.supabase);
    return NextResponse.json({
      ok: true,
      updated,
      installed: [...installed].sort(),
      library: lib,
    });
  }

'''
    if marker not in t2:
        # try before unknown action return
        if "Unknown action" in t2:
            t2 = t2.replace(
                "  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });",
                block + "  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });",
                1,
            )
            p2.write_text(t2, encoding="utf-8", newline="\n")
            print("model-library sync via unknown")
        else:
            raise SystemExit("import_catalog marker missing")
    else:
        t2 = t2.replace(marker, block + marker, 1)
        p2.write_text(t2, encoding="utf-8", newline="\n")
        print("model-library sync ok")
else:
    print("sync already")

# verify saveModelLibrary exists
print("saveModelLibrary", "saveModelLibrary" in Path("src/lib/model-library.ts").read_text(encoding="utf-8"))
print("export save", "export async function saveModelLibrary" in Path("src/lib/model-library.ts").read_text(encoding="utf-8") or "export function saveModelLibrary" in Path("src/lib/model-library.ts").read_text(encoding="utf-8"))
