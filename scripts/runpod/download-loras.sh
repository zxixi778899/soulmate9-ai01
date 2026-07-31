#!/usr/bin/env bash
set -euo pipefail

VOLUME_ROOT="${VOLUME_ROOT:-/runpod-volume}"
LORA_DIR="${LORA_DIR:-$VOLUME_ROOT/models/loras}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFESTS=("$SCRIPT_DIR/cd1-essential-loras.txt" "$SCRIPT_DIR/cd2-essential-loras.txt")
mkdir -p "$LORA_DIR"

download_one() {
  local name="$1" url="$2" expected_sha="$3"
  local dest="$LORA_DIR/$name"
  if [[ ! -s "$dest" ]]; then
    echo "[download] $name"
    local auth=()
    [[ -n "${CIVITAI_TOKEN:-}" ]] && auth=(-H "Authorization: Bearer $CIVITAI_TOKEN")
    curl -L --fail --retry 3 "${auth[@]}" -o "$dest.part" "$url"
    mv "$dest.part" "$dest"
  fi
  if [[ "$expected_sha" != "-" ]]; then
    echo "$expected_sha  $dest" | sha256sum --check --status || {
      echo "[error] checksum mismatch: $name" >&2
      return 1
    }
  fi
}

for manifest in "${MANIFESTS[@]}"; do
  while IFS='|' read -r name url sha family trigger || [[ -n "${name:-}" ]]; do
    [[ -z "${name:-}" || "$name" == \#* ]] && continue
    download_one "$name" "$url" "$sha"
  done < "$manifest"
done

mapfile -t all < <(find "$LORA_DIR" -maxdepth 1 -type f -name '*.safetensors' -printf '%f\n' | sort)
join_csv() { local IFS=,; echo "$*"; }
flux=(); pony=(); illustrious=()
for file in "${all[@]}"; do
  lower="${file,,}"
  if [[ "$lower" == *illustrious* ]]; then
    illustrious+=("$file")
  elif [[ "$lower" == *pony* || "$lower" == *backgrounddetailer* ]]; then
    pony+=("$file")
  else
    flux+=("$file")
  fi
done

inventory="$LORA_DIR/soulmate-lora-inventory.env"
{
  echo "RUNPOD_INSTALLED_LORAS_FLUX=$(join_csv "${flux[@]}")"
  echo "RUNPOD_INSTALLED_LORAS_PONY=$(join_csv "${pony[@]}")"
  echo "RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS=$(join_csv "${illustrious[@]}")"
} > "$inventory"
echo "[ok] Runtime inventory written to $inventory"
cat "$inventory"