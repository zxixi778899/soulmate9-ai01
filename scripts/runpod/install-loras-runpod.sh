#!/usr/bin/env bash
# Robust SoulMate FLUX.1 LoRA installer for a RunPod network volume.
# Token is read from CIVITAI_API_TOKEN. Never hard-code it here.
set -Eeuo pipefail

TIER="all"; ONLY=""; ROOT=""; MANIFEST=""; FORCE=0; DRY_RUN=0
MIN_BYTES="${LORA_MIN_BYTES:-1000000}"

usage() {
  cat <<'EOF'
Usage: bash install-loras-runpod.sh [options]
  --tier A,B       Download tier A-E (default: all)
  --only PATTERN   Filename substring(s), comma-separated
  --manifest FILE  Custom name|url or name|url|tier manifest
  --root DIR       Network-volume root (auto-detected by default)
  --force          Replace valid existing files
  --dry-run        Print the plan without downloading

Secure token input:
  read -rsp "Civitai token: " CIVITAI_API_TOKEN; echo
  export CIVITAI_API_TOKEN
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier) TIER="${2:?missing tier}"; shift 2 ;;
    --only) ONLY="${2:?missing pattern}"; shift 2 ;;
    --manifest) MANIFEST="${2:?missing manifest}"; shift 2 ;;
    --root) ROOT="${2:?missing root}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[error] unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$ROOT" ]]; then
  for candidate in /runpod-volume /workspace/runpod-volume /workspace; do
    [[ -d "$candidate" ]] && ROOT="$candidate" && break
  done
fi
ROOT="${ROOT:-$(pwd)/soulmate-models-local}"
LORA_DIR="$ROOT/models/loras"
mkdir -p "$LORA_DIR"

declare -a ROWS=(
  "flux_style_photoreal_v1.safetensors|https://civitai.com/api/download/models/1084957|A"
  "flux_style_hyperreal_aidma_v1.safetensors|https://civitai.com/api/download/models/980278|A"
  "flux_detail_skin_v1.safetensors|https://civitai.com/api/download/models/827325|A"
  "flux_detail_skin_nplastic_v1.safetensors|https://civitai.com/api/download/models/1301668|A"
  "flux_detail_hands_v1.safetensors|https://civitai.com/api/download/models/1003317|A"
  "flux_detail_upgrader_v1.safetensors|https://civitai.com/api/download/models/984672|A"
  "flux_body_curvy_v1.safetensors|https://civitai.com/api/download/models/1668530|B"
  "flux_body_pear_v1.safetensors|https://civitai.com/api/download/models/1276427|B"
  "flux_outfit_lingerie_v1.safetensors|https://civitai.com/api/download/models/869894|C"
  "flux_outfit_bunny_v1.safetensors|https://civitai.com/api/download/models/817758|C"
  "flux_outfit_maid_v1.safetensors|https://civitai.com/api/download/models/1588611|C"
  "flux_outfit_bikini_v1.safetensors|https://civitai.com/api/download/models/1184191|C"
  "flux_outfit_latex_v1.safetensors|https://civitai.com/api/download/models/734230|C"
  "flux_pose_nsfw_dynamic_v1.safetensors|https://civitai.com/api/download/models/746602|D"
  "flux_face_ahegao_v1.safetensors|https://civitai.com/api/download/models/1477302|D"
  "flux_style_cinematic_v1.safetensors|https://civitai.com/api/download/models/953083|E"
)

if [[ -n "$MANIFEST" ]]; then
  [[ -f "$MANIFEST" ]] || { echo "[error] manifest not found: $MANIFEST" >&2; exit 2; }
  ROWS=()
  while IFS='|' read -r name url tier _ || [[ -n "${name:-}" ]]; do
    name="$(printf '%s' "$name" | tr -d '\r')"
    url="$(printf '%s' "$url" | tr -d '\r')"
    tier="$(printf '%s' "${tier:-}" | tr -d '\r')"
    name="${name#"${name%%[![:space:]]*}"}"
    url="${url#"${url%%[![:space:]]*}"}"
    [[ -z "$name" || "${name:0:1}" == "#" || -z "$url" ]] && continue
    ROWS+=("$name|$url|${tier:-custom}")
  done < "$MANIFEST"
fi

matches_tier() {
  [[ "$TIER" == "all" ]] && return 0
  [[ ",${TIER^^}," == *",${1^^},"* ]]
}

matches_only() {
  [[ -z "$ONLY" ]] && return 0
  local filename="${1,,}" item
  IFS=',' read -ra filters <<< "$ONLY"
  for item in "${filters[@]}"; do
    [[ "$filename" == *"${item,,}"* ]] && return 0
  done
  return 1
}

file_bytes() {
  stat -c '%s' "$1" 2>/dev/null || wc -c < "$1" | tr -d '\r'
}

validate_file() {
  local file="$1" bytes prefix
  [[ -f "$file" ]] || return 1
  bytes="$(file_bytes "$file")"
  [[ "${bytes:-0}" -ge "$MIN_BYTES" ]] || return 1
  prefix="$(head -c 64 "$file" 2>/dev/null || true)"
  [[ "$prefix" != '<!DOCTYPE'* && "$prefix" != '<html'* && "$prefix" != '{"error"'* ]]
}

download_one() {
  local name="$1" url="$2" dest="$LORA_DIR/$1" part="$LORA_DIR/$1.part"
  if [[ "$FORCE" -eq 0 ]] && validate_file "$dest"; then
    echo "[skip] $name ($(du -h "$dest" | cut -f1))"; return 0
  fi
  [[ "$FORCE" -eq 1 ]] && rm -f "$dest" "$part"
  [[ -f "$dest" ]] && mv -f "$dest" "$part"
  [[ "$DRY_RUN" -eq 1 ]] && { echo "[plan] $name <- $url"; return 0; }

  echo "[download] $name"
  local auth_url="$url"
  if [[ -n "${CIVITAI_API_TOKEN:-}" ]]; then
    if [[ "$auth_url" == *"?"* ]]; then
      auth_url="${auth_url}&token=${CIVITAI_API_TOKEN}"
    else
      auth_url="${auth_url}?token=${CIVITAI_API_TOKEN}"
    fi
  fi
  # Use options supported by older curl builds commonly shipped in RunPod images.
  local -a args=(--location --fail --retry 6 --retry-delay 3
    --connect-timeout 30 --continue-at - --output "$part")
  [[ -n "${CIVITAI_API_TOKEN:-}" ]] &&
    args+=(--header "Authorization: Bearer ${CIVITAI_API_TOKEN}")
  curl "${args[@]}" "$auth_url" || { echo "[fail] download: $name" >&2; return 1; }
  if ! validate_file "$part"; then
    echo "[fail] invalid/small: $name ($(file_bytes "$part") bytes)" >&2
    mv -f "$part" "$part.invalid"; return 1
  fi
  mv -f "$part" "$dest"
  echo "[ok] $name ($(du -h "$dest" | cut -f1))"
}

echo "SoulMate LoRA installer"
echo "target=$LORA_DIR tier=$TIER only=${ONLY:-all} token=$([[ -n "${CIVITAI_API_TOKEN:-}" ]] && echo yes || echo no)"
ok=0; failed=0; selected=0
FAILED_FILE="$LORA_DIR/lora-download-failed.txt"
: > "$FAILED_FILE"

for row in "${ROWS[@]}"; do
  IFS='|' read -r name url tier <<< "$row"
  matches_tier "$tier" || continue
  matches_only "$name" || continue
  selected=$((selected + 1))
  if download_one "$name" "$url"; then
    ok=$((ok + 1))
  else
    failed=$((failed + 1)); echo "$name|$url|$tier" >> "$FAILED_FILE"
  fi
done

echo "selected=$selected ok=$ok failed=$failed"
if [[ "$failed" -gt 0 ]]; then
  echo "retry: bash $0 --manifest $FAILED_FILE --root $ROOT"
else
  rm -f "$FAILED_FILE"
fi
find "$LORA_DIR" -maxdepth 1 -type f -name '*.safetensors' -printf '%f\t%k KB\n' 2>/dev/null | sort || true
[[ "$failed" -eq 0 ]]
\\r'/}"
    url="${url//    name="${name#"${name%%[![:space:]]*}"}"
    url="${url#"${url%%[![:space:]]*}"}"
    [[ -z "$name" || "$name" == \#* || -z "$url" ]] && continue
    ROWS+=("$name|$url|${tier:-custom}")
  done < "$MANIFEST"
fi

matches_tier() {
  [[ "$TIER" == "all" ]] && return 0
  [[ ",${TIER^^}," == *",${1^^},"* ]]
}

matches_only() {
  [[ -z "$ONLY" ]] && return 0
  local filename="${1,,}" item
  IFS=',' read -ra filters <<< "$ONLY"
  for item in "${filters[@]}"; do
    [[ "$filename" == *"${item,,}"* ]] && return 0
  done
  return 1
}

file_bytes() {
  stat -c '%s' "$1" 2>/dev/null || wc -c < "$1" | tr -d '\r'
}

validate_file() {
  local file="$1" bytes prefix
  [[ -f "$file" ]] || return 1
  bytes="$(file_bytes "$file")"
  [[ "${bytes:-0}" -ge "$MIN_BYTES" ]] || return 1
  prefix="$(head -c 64 "$file" 2>/dev/null || true)"
  [[ "$prefix" != '<!DOCTYPE'* && "$prefix" != '<html'* && "$prefix" != '{"error"'* ]]
}

download_one() {
  local name="$1" url="$2" dest="$LORA_DIR/$1" part="$LORA_DIR/$1.part"
  if [[ "$FORCE" -eq 0 ]] && validate_file "$dest"; then
    echo "[skip] $name ($(du -h "$dest" | cut -f1))"; return 0
  fi
  [[ "$FORCE" -eq 1 ]] && rm -f "$dest" "$part"
  [[ -f "$dest" ]] && mv -f "$dest" "$part"
  [[ "$DRY_RUN" -eq 1 ]] && { echo "[plan] $name <- $url"; return 0; }

  echo "[download] $name"
  local auth_url="$url"
  if [[ -n "${CIVITAI_API_TOKEN:-}" ]]; then
    if [[ "$auth_url" == *"?"* ]]; then
      auth_url="${auth_url}&token=${CIVITAI_API_TOKEN}"
    else
      auth_url="${auth_url}?token=${CIVITAI_API_TOKEN}"
    fi
  fi
  # Use options supported by older curl builds commonly shipped in RunPod images.
  local -a args=(--location --fail --retry 6 --retry-delay 3
    --connect-timeout 30 --continue-at - --output "$part")
  [[ -n "${CIVITAI_API_TOKEN:-}" ]] &&
    args+=(--header "Authorization: Bearer ${CIVITAI_API_TOKEN}")
  curl "${args[@]}" "$auth_url" || { echo "[fail] download: $name" >&2; return 1; }
  if ! validate_file "$part"; then
    echo "[fail] invalid/small: $name ($(file_bytes "$part") bytes)" >&2
    mv -f "$part" "$part.invalid"; return 1
  fi
  mv -f "$part" "$dest"
  echo "[ok] $name ($(du -h "$dest" | cut -f1))"
}

echo "SoulMate LoRA installer"
echo "target=$LORA_DIR tier=$TIER only=${ONLY:-all} token=$([[ -n "${CIVITAI_API_TOKEN:-}" ]] && echo yes || echo no)"
ok=0; failed=0; selected=0
FAILED_FILE="$LORA_DIR/lora-download-failed.txt"
: > "$FAILED_FILE"

for row in "${ROWS[@]}"; do
  IFS='|' read -r name url tier <<< "$row"
  matches_tier "$tier" || continue
  matches_only "$name" || continue
  selected=$((selected + 1))
  if download_one "$name" "$url"; then
    ok=$((ok + 1))
  else
    failed=$((failed + 1)); echo "$name|$url|$tier" >> "$FAILED_FILE"
  fi
done

echo "selected=$selected ok=$ok failed=$failed"
if [[ "$failed" -gt 0 ]]; then
  echo "retry: bash $0 --manifest $FAILED_FILE --root $ROOT"
else
  rm -f "$FAILED_FILE"
fi
find "$LORA_DIR" -maxdepth 1 -type f -name '*.safetensors' -printf '%f\t%k KB\n' 2>/dev/null | sort || true
[[ "$failed" -eq 0 ]]
\\r'/}"
    tier="${tier//    name="${name#"${name%%[![:space:]]*}"}"
    url="${url#"${url%%[![:space:]]*}"}"
    [[ -z "$name" || "$name" == \#* || -z "$url" ]] && continue
    ROWS+=("$name|$url|${tier:-custom}")
  done < "$MANIFEST"
fi

matches_tier() {
  [[ "$TIER" == "all" ]] && return 0
  [[ ",${TIER^^}," == *",${1^^},"* ]]
}

matches_only() {
  [[ -z "$ONLY" ]] && return 0
  local filename="${1,,}" item
  IFS=',' read -ra filters <<< "$ONLY"
  for item in "${filters[@]}"; do
    [[ "$filename" == *"${item,,}"* ]] && return 0
  done
  return 1
}

file_bytes() {
  stat -c '%s' "$1" 2>/dev/null || wc -c < "$1" | tr -d '\r'
}

validate_file() {
  local file="$1" bytes prefix
  [[ -f "$file" ]] || return 1
  bytes="$(file_bytes "$file")"
  [[ "${bytes:-0}" -ge "$MIN_BYTES" ]] || return 1
  prefix="$(head -c 64 "$file" 2>/dev/null || true)"
  [[ "$prefix" != '<!DOCTYPE'* && "$prefix" != '<html'* && "$prefix" != '{"error"'* ]]
}

download_one() {
  local name="$1" url="$2" dest="$LORA_DIR/$1" part="$LORA_DIR/$1.part"
  if [[ "$FORCE" -eq 0 ]] && validate_file "$dest"; then
    echo "[skip] $name ($(du -h "$dest" | cut -f1))"; return 0
  fi
  [[ "$FORCE" -eq 1 ]] && rm -f "$dest" "$part"
  [[ -f "$dest" ]] && mv -f "$dest" "$part"
  [[ "$DRY_RUN" -eq 1 ]] && { echo "[plan] $name <- $url"; return 0; }

  echo "[download] $name"
  local auth_url="$url"
  if [[ -n "${CIVITAI_API_TOKEN:-}" ]]; then
    if [[ "$auth_url" == *"?"* ]]; then
      auth_url="${auth_url}&token=${CIVITAI_API_TOKEN}"
    else
      auth_url="${auth_url}?token=${CIVITAI_API_TOKEN}"
    fi
  fi
  # Use options supported by older curl builds commonly shipped in RunPod images.
  local -a args=(--location --fail --retry 6 --retry-delay 3
    --connect-timeout 30 --continue-at - --output "$part")
  [[ -n "${CIVITAI_API_TOKEN:-}" ]] &&
    args+=(--header "Authorization: Bearer ${CIVITAI_API_TOKEN}")
  curl "${args[@]}" "$auth_url" || { echo "[fail] download: $name" >&2; return 1; }
  if ! validate_file "$part"; then
    echo "[fail] invalid/small: $name ($(file_bytes "$part") bytes)" >&2
    mv -f "$part" "$part.invalid"; return 1
  fi
  mv -f "$part" "$dest"
  echo "[ok] $name ($(du -h "$dest" | cut -f1))"
}

echo "SoulMate LoRA installer"
echo "target=$LORA_DIR tier=$TIER only=${ONLY:-all} token=$([[ -n "${CIVITAI_API_TOKEN:-}" ]] && echo yes || echo no)"
ok=0; failed=0; selected=0
FAILED_FILE="$LORA_DIR/lora-download-failed.txt"
: > "$FAILED_FILE"

for row in "${ROWS[@]}"; do
  IFS='|' read -r name url tier <<< "$row"
  matches_tier "$tier" || continue
  matches_only "$name" || continue
  selected=$((selected + 1))
  if download_one "$name" "$url"; then
    ok=$((ok + 1))
  else
    failed=$((failed + 1)); echo "$name|$url|$tier" >> "$FAILED_FILE"
  fi
done

echo "selected=$selected ok=$ok failed=$failed"
if [[ "$failed" -gt 0 ]]; then
  echo "retry: bash $0 --manifest $FAILED_FILE --root $ROOT"
else
  rm -f "$FAILED_FILE"
fi
find "$LORA_DIR" -maxdepth 1 -type f -name '*.safetensors' -printf '%f\t%k KB\n' 2>/dev/null | sort || true
[[ "$failed" -eq 0 ]]
\\r'/}"
    name="${name#"${name%%[![:space:]]*}"}"
    url="${url#"${url%%[![:space:]]*}"}"
    [[ -z "$name" || "$name" == \#* || -z "$url" ]] && continue
    ROWS+=("$name|$url|${tier:-custom}")
  done < "$MANIFEST"
fi

matches_tier() {
  [[ "$TIER" == "all" ]] && return 0
  [[ ",${TIER^^}," == *",${1^^},"* ]]
}

matches_only() {
  [[ -z "$ONLY" ]] && return 0
  local filename="${1,,}" item
  IFS=',' read -ra filters <<< "$ONLY"
  for item in "${filters[@]}"; do
    [[ "$filename" == *"${item,,}"* ]] && return 0
  done
  return 1
}

file_bytes() {
  stat -c '%s' "$1" 2>/dev/null || wc -c < "$1" | tr -d '\r'
}

validate_file() {
  local file="$1" bytes prefix
  [[ -f "$file" ]] || return 1
  bytes="$(file_bytes "$file")"
  [[ "${bytes:-0}" -ge "$MIN_BYTES" ]] || return 1
  prefix="$(head -c 64 "$file" 2>/dev/null || true)"
  [[ "$prefix" != '<!DOCTYPE'* && "$prefix" != '<html'* && "$prefix" != '{"error"'* ]]
}

download_one() {
  local name="$1" url="$2" dest="$LORA_DIR/$1" part="$LORA_DIR/$1.part"
  if [[ "$FORCE" -eq 0 ]] && validate_file "$dest"; then
    echo "[skip] $name ($(du -h "$dest" | cut -f1))"; return 0
  fi
  [[ "$FORCE" -eq 1 ]] && rm -f "$dest" "$part"
  [[ -f "$dest" ]] && mv -f "$dest" "$part"
  [[ "$DRY_RUN" -eq 1 ]] && { echo "[plan] $name <- $url"; return 0; }

  echo "[download] $name"
  local auth_url="$url"
  if [[ -n "${CIVITAI_API_TOKEN:-}" ]]; then
    if [[ "$auth_url" == *"?"* ]]; then
      auth_url="${auth_url}&token=${CIVITAI_API_TOKEN}"
    else
      auth_url="${auth_url}?token=${CIVITAI_API_TOKEN}"
    fi
  fi
  # Use options supported by older curl builds commonly shipped in RunPod images.
  local -a args=(--location --fail --retry 6 --retry-delay 3
    --connect-timeout 30 --continue-at - --output "$part")
  [[ -n "${CIVITAI_API_TOKEN:-}" ]] &&
    args+=(--header "Authorization: Bearer ${CIVITAI_API_TOKEN}")
  curl "${args[@]}" "$auth_url" || { echo "[fail] download: $name" >&2; return 1; }
  if ! validate_file "$part"; then
    echo "[fail] invalid/small: $name ($(file_bytes "$part") bytes)" >&2
    mv -f "$part" "$part.invalid"; return 1
  fi
  mv -f "$part" "$dest"
  echo "[ok] $name ($(du -h "$dest" | cut -f1))"
}

echo "SoulMate LoRA installer"
echo "target=$LORA_DIR tier=$TIER only=${ONLY:-all} token=$([[ -n "${CIVITAI_API_TOKEN:-}" ]] && echo yes || echo no)"
ok=0; failed=0; selected=0
FAILED_FILE="$LORA_DIR/lora-download-failed.txt"
: > "$FAILED_FILE"

for row in "${ROWS[@]}"; do
  IFS='|' read -r name url tier <<< "$row"
  matches_tier "$tier" || continue
  matches_only "$name" || continue
  selected=$((selected + 1))
  if download_one "$name" "$url"; then
    ok=$((ok + 1))
  else
    failed=$((failed + 1)); echo "$name|$url|$tier" >> "$FAILED_FILE"
  fi
done

echo "selected=$selected ok=$ok failed=$failed"
if [[ "$failed" -gt 0 ]]; then
  echo "retry: bash $0 --manifest $FAILED_FILE --root $ROOT"
else
  rm -f "$FAILED_FILE"
fi
find "$LORA_DIR" -maxdepth 1 -type f -name '*.safetensors' -printf '%f\t%k KB\n' 2>/dev/null | sort || true
[[ "$failed" -eq 0 ]]
