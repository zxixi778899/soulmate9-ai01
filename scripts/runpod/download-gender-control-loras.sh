#!/usr/bin/env bash
set -u
ROOT="${1:-/runpod-volume}"
DEST="${ROOT}/models/loras"
MANIFEST="${2:-./lora-urls.gender-control.txt}"
mkdir -p "$DEST"
failed=0
while IFS='|' read -r name url expected; do
  [ -z "$name" ] && continue
  case "$name" in
    \#*) continue ;;
  esac
  target="$DEST/$name"
  if [ -f "$target" ] && echo "$expected  $target" | sha256sum -c - >/dev/null 2>&1; then
    echo "SKIP verified: $name"
    continue
  fi
  echo "DOWNLOAD: $name"
  auth_url="$url"
  if [ -n "${CIVITAI_API_TOKEN:-}" ]; then
    auth_url="$url?token=${CIVITAI_API_TOKEN}"
  fi
  if ! curl -fL --retry 6 --retry-delay 3 --connect-timeout 30 -C - -o "$target.part" "$auth_url"; then
    echo "FAIL download: $name" >&2; failed=1; continue
  fi
  if ! echo "$expected  $target.part" | sha256sum -c -; then
    echo "FAIL checksum: $name" >&2; rm -f "$target.part"; failed=1; continue
  fi
  mv "$target.part" "$target"
  echo "OK: $name"
done < "$MANIFEST"
find "$DEST" -maxdepth 1 -name '*.safetensors' -printf '%f\n' | sort | paste -sd, - > "$DEST/RUNPOD_INSTALLED_LORAS.txt"
echo "Inventory: $DEST/RUNPOD_INSTALLED_LORAS.txt"
exit "$failed"
