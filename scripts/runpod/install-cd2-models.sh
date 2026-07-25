#!/usr/bin/env bash
set -uo pipefail

manifest="${2:-$(dirname "$0")/cd2-models.txt}"
requested_root="${1:-}"

find_models_root() {
  if [[ -n "$requested_root" ]]; then
    printf '%s\n' "$requested_root"
    return
  fi
  for candidate in /workspace/models /runpod-volume/models /workspace/ComfyUI/models; do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  printf '%s\n' /workspace/models
}

models_root="$(find_models_root)"
checkpoint_dir="$models_root/checkpoints"
mkdir -p "$checkpoint_dir"

if [[ ! -f "$manifest" ]]; then
  echo "Manifest not found: $manifest" >&2
  exit 2
fi

download_one() {
  local name="$1"
  local url="$2"
  local expected="$3"
  local target="$checkpoint_dir/$name"
  local partial="$target.part"
  local auth_url="$url"

  if [[ -n "${CIVITAI_API_TOKEN:-}" ]]; then
    auth_url="${url}?token=${CIVITAI_API_TOKEN}"
  fi

  if [[ -f "$target" ]] && printf '%s  %s\n' "$expected" "$target" | sha256sum -c - >/dev/null 2>&1; then
    echo "SKIP verified: $name"
    return 0
  fi

  echo "DOWNLOAD: $name"
  if ! curl -fL --retry 6 --retry-delay 3 --connect-timeout 30 \
    -C - -o "$partial" "$auth_url"; then
    echo "FAIL download: $name" >&2
    return 1
  fi
  if ! printf '%s  %s\n' "$expected" "$partial" | sha256sum -c -; then
    echo "FAIL checksum: $name" >&2
    return 1
  fi
  mv "$partial" "$target"
  echo "OK: $target"
}

failed=0
while IFS='|' read -r name url expected; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  download_one "$name" "$url" "$expected" || failed=1
done < "$manifest"

find "$checkpoint_dir" -maxdepth 1 -type f -name '*.safetensors' -printf '%f | %k KB\n' | sort
exit "$failed"
