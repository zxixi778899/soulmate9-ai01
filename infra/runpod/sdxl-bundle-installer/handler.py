"""RunPod serverless handler that provisions the SDXL bundle onto the
attached network volume (/runpod-volume). Pure-python downloader (no
curl/apt needed). Progress + final report are relayed to Supabase
site_settings so runs are observable without pod logs.

Job input:
  {"cmd": "download"}  -> install the bundle (idempotent)
  {"cmd": "inventory"} -> list model files with sizes (verification)
  anything else         -> no-op ping
"""
import hashlib
import os
import time

import requests
import runpod

ROOT = "/runpod-volume/models"
STATE = "/runpod-volume/model-manifests"
SB_URL = os.environ.get("SB_URL", "")
SB_KEY = os.environ.get("SB_KEY", "")

# (name, civitai_version_id, expected_sha256_or_None)
CHECKPOINTS = [
    ("ponyRealism_V22.safetensors", "914390",
     "7C97ECF786A50A54835A22277C35703787B840E98C04C318A4E3FEF9D3B463F7"),
    ("waiMatureIllustrious_v20.safetensors", "2183030",
     "7E4B5E6D917B52FEFF9153BEDE22EA391B1638CF350C8A64ABA23AAE56472FF9"),
]
LORAS = [
    ("pony_detailifier_v5.safetensors", "624633", None),
    ("pony_mature_female_slider_v2.safetensors", "1969907",
     "53AF6969C5ECD7AED26D44F73A2DBA7549CE76FB32356E655B14F4CC253D3CCD"),
    ("pony_gender_transition_slider.safetensors", "518559",
     "B4290F390036DA023A44B49F4188468BE938EB2ACBD6528BC946E634D46A390B"),
    ("pony_futa_style.safetensors", "568579",
     "E7115E3D6A483C6404D78AF54F49D179BE0665B1D53D36B80E5A02B1E7738BA7"),
    ("illustrious_nsfw_slider_v1.safetensors", "1017934",
     "D6DEB0E995E5694D29FE9571D68235D220E6AF0D79F5FF5576FB3F0AF6B522E3"),
    ("illustrious_realism_slider_v1.safetensors", "1681903",
     "42ABFB595AFC7992C91B542849CA2F3DDB4FED44A21CA1036EB530E0F1BEF053"),
    ("AddMicroDetails_Illustrious_v6.safetensors", "2832991",
     "CE12AF9C5E510A745618F76F1197C5776CD283E5DDDD707FC0371AFD940B4454"),
]
# (subdir, name, url)
HF_ASSETS = [
    # IPAdapter_plus FaceID (SDXL) resolves ClipVision by filename pattern
    # ViT.H.14.*s32B.b79K — the official extra_model_paths.yaml already maps
    # clip_vision to /runpod-volume/models/clip_vision.
    ("clip_vision", "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors",
     "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors"),
    ("controlnet", "xinsir-openpose-sdxl.safetensors",
     "https://huggingface.co/xinsir/controlnet-openpose-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors"),
    ("controlnet", "xinsir-depth-sdxl.safetensors",
     "https://huggingface.co/xinsir/controlnet-depth-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors"),
    ("ipadapter", "ip-adapter-faceid-plusv2_sdxl.bin",
     "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl.bin"),
    ("ipadapter", "ip-adapter-faceid-plusv2_sdxl_lora.safetensors",
     "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl_lora.safetensors"),
    # IPAdapter_plus resolves the FaceID lora from the "loras" folder, so keep
    # a copy there as well (start-sdxl-pro.sh also symlinks it at boot).
    ("loras", "ip-adapter-faceid-plusv2_sdxl_lora.safetensors",
     "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl_lora.safetensors"),
    ("ultralytics/bbox", "face_yolov8m.pt",
     "https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt"),
    ("upscale_models", "4x-UltraSharp.pth",
     "https://huggingface.co/Kim2091/UltraSharp/resolve/main/4x-UltraSharp.pth"),
]


def beacon(value):
    if not SB_URL or not SB_KEY:
        return
    try:
        requests.post(
            f"{SB_URL}/rest/v1/site_settings",
            json={"key": "_sdxl_bundle_progress", "value": value},
            headers={
                "apikey": SB_KEY,
                "Authorization": f"Bearer {SB_KEY}",
                "Prefer": "resolution=merge-duplicates",
            },
            timeout=15,
        )
    except Exception:
        pass


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def stream_download(url, target, headers, max_attempts=8):
    """Streaming download with resume support."""
    for attempt in range(1, max_attempts + 1):
        hdrs = dict(headers)
        existing = os.path.getsize(target) if os.path.exists(target) else 0
        if existing:
            hdrs["Range"] = f"bytes={existing}-"
        try:
            with requests.get(url, headers=hdrs, stream=True,
                              timeout=(30, 120), allow_redirects=True) as r:
                if r.status_code == 416:  # range past end -> already complete
                    return True
                r.raise_for_status()
                mode = "ab" if r.status_code == 206 else "wb"
                with open(target, mode) as f:
                    for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
                        if chunk:
                            f.write(chunk)
            return True
        except Exception:
            if attempt == max_attempts:
                return False
            time.sleep(5 * attempt)
    return False


def fetch_civitai(token, subdir, name, version_id, expected):
    target = os.path.join(ROOT, subdir, name)
    if os.path.exists(target) and expected:
        if sha256_of(target) == expected:
            return f"verified-existing|{name}"
    url = f"https://civitai.com/api/download/models/{version_id}"
    partial = target + ".part"
    ok = stream_download(url, partial,
                         {"Authorization": f"Bearer {token}"})
    if not ok:
        return f"download-failed|{name}"
    if expected:
        actual = sha256_of(partial)
        if actual != expected:
            return f"hash-mismatch|{name}|expected={expected}|actual={actual}"
    os.replace(partial, target)
    return f"installed|{name}"


def fetch_hf(subdir, name, url):
    target = os.path.join(ROOT, subdir, name)
    if os.path.exists(target) and os.path.getsize(target) > 0:
        return f"verified-existing|{name}"
    partial = target + ".part"
    ok = stream_download(url, partial, {})
    if not ok:
        return f"download-failed|{name}"
    os.replace(partial, target)
    return f"installed|{name}"


def run_download():
    token = os.environ.get("CIVITAI_API_TOKEN", "")
    if not token or "RUNPOD_SECRET" in token:
        return {"rc": 22, "error": "CIVITAI_API_TOKEN secret was not resolved"}

    for sub in ("checkpoints", "loras", "controlnet", "ipadapter",
                "clip_vision", "ultralytics/bbox", "upscale_models"):
        os.makedirs(os.path.join(ROOT, sub), exist_ok=True)
    os.makedirs(STATE, exist_ok=True)
    manifest = os.path.join(STATE, "sdxl-matrix-installed.txt")

    beacon({"phase": "download_start", "total": len(CHECKPOINTS) + len(LORAS) + len(HF_ASSETS)})
    results = []
    done = 0
    for name, vid, sha in CHECKPOINTS:
        r = fetch_civitai(token, "checkpoints", name, vid, sha)
        results.append(r)
        done += 1
        beacon({"phase": "downloading", "installed": done, "last": r})
    for name, vid, sha in LORAS:
        r = fetch_civitai(token, "loras", name, vid, sha)
        results.append(r)
        done += 1
        beacon({"phase": "downloading", "installed": done, "last": r})
    for subdir, name, url in HF_ASSETS:
        r = fetch_hf(subdir, name, url)
        results.append(r)
        done += 1
        beacon({"phase": "downloading", "installed": done, "last": r})

    with open(manifest, "w") as f:
        f.write("\n".join(results) + "\n")
    with open(os.path.join(STATE, "sdxl-matrix.status"), "w") as f:
        f.write(f"completed={time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\n")

    rc = 0 if all(r.startswith(("installed", "verified-existing")) for r in results) else 1
    beacon({"phase": "done", "rc": rc, "installed": done})
    return {"rc": rc, "results": results}


def run_inventory():
    exts = (".safetensors", ".bin", ".pt", ".pth")
    files = []
    for dirpath, _dirs, names in os.walk(ROOT):
        for n in sorted(names):
            if n.endswith(exts):
                p = os.path.join(dirpath, n)
                files.append({
                    "path": os.path.relpath(p, "/runpod-volume"),
                    "size_mb": round(os.path.getsize(p) / (1024 * 1024), 1),
                })
    files.sort(key=lambda f: f["path"])
    manifest = os.path.join(STATE, "sdxl-matrix-installed.txt")
    manifest_lines = []
    if os.path.exists(manifest):
        with open(manifest) as f:
            manifest_lines = [ln.strip() for ln in f if ln.strip()]
    return {"files": files, "count": len(files), "manifest": manifest_lines}


def handler(job):
    inp = job.get("input", {}) or {}
    cmd = inp.get("cmd")
    if cmd == "download":
        return run_download()
    if cmd == "inventory":
        return run_inventory()
    return {"pong": True, "volume_mounted": os.path.isdir("/runpod-volume")}


runpod.serverless.start({"handler": handler})
