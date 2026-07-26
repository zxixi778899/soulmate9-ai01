#!/usr/bin/env bash
set -Eeuo pipefail

manifest="${1:?usage: install-essential-loras.sh MANIFEST [MODELS_ROOT]}"
requested_root="${2:-}"
min_bytes="${LORA_MIN_BYTES:-1000000}"

find_models_root() {
  if [[ -n "$requested_root" ]]; then printf '%s\n' "$requested_root"; return; fi
  for candidate in /workspace/models /runpod-volume/models /workspace/ComfyUI/models; do
    [[ -d "$candidate" ]] && { printf '%s\n' "$candidate"; return; }
  done
  printf '%s\n' /workspace/models
}

models_root="$(find_models_root)"
lora_dir="$models_root/loras"
mkdir -p "$lora_dir"
[[ -f "$manifest" ]] || { echo "manifest not found: $manifest" >&2; exit 2; }

validate_file() {
  local file="$1" bytes prefix
  [[ -f "$file" ]] || return 1
  bytes="$(stat -c '%s' "$file" 2>/dev/null || wc -c < "$file")"
  [[ "${bytes:-0}" -ge "$min_bytes" ]] || return 1
  prefix="$(head -c 64 "$file" 2>/dev/null || true)"
  [[ "$prefix" != '<!DOCTYPE'* && "$prefix" != '<html'* && "$prefix" != '{"error"'* ]]
}

download_one() {
  local name="$1" url="$2" expected="$3" target="$lora_dir/$1" part="$lora_dir/$1.part"
  if validate_file "$target"; then
    if [[ -z "$expected" || "$expected" == '-' ]] || printf '%s  %s\n' "$expected" "$target" | sha256sum -c - >/dev/null 2>&1; then
      echo "SKIP verified: $name"; return 0
    fi
  fi
  local auth_url="$url"
  [[ -n "${CIVITAI_API_TOKEN:-}" ]] && auth_url="${url}?token=${CIVITAI_API_TOKEN}"
  echo "DOWNLOAD: $name"
  curl --location --fail --retry 6 --retry-delay 3 --connect-timeout 30 \
    --continue-at - --output "$part" "$auth_url"
  validate_file "$part" || { echo "FAIL invalid file: $name" >&2; return 1; }
  if [[ -n "$expected" && "$expected" != '-' ]]; then
    printf '%s  %s\n' "$expected" "$part" | sha256sum -c -
  fi
  mv "$part" "$target"
  echo "OK: $name"
}

failed=0
while IFS='|' read -r name url expected family trigger; do
  name="${name//$'\r'/}"; url="${url//$'\r'/}"; expected="${expected//$'\r'/}"
  [[ -z "$name" || "$name" == \#* ]] && continue
  download_one "$name" "$url" "$expected" || failed=1
done < "$manifest"

find "$lora_dir" -maxdepth 1 -type f -name '*.safetensors' -printf '%f\n' | sort > "$lora_dir/RUNPOD_INSTALLED_LORAS.txt"
sha256sum "$lora_dir"/*.safetensors > "$lora_dir/SHA256SUMS.txt"
echo "Inventory: $lora_dir/RUNPOD_INSTALLED_LORAS.txt"
exit "$failed"
