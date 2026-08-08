#!/usr/bin/env bash
set -euo pipefail

umask 077
root="/workspace/ComfyUI/models"
state="/workspace/model-manifests"
mkdir -p "$root/checkpoints" "$root/loras" "$state"

# Full SSH sessions intentionally sanitize custom container variables. Recover
# only the named secret from the container init process without printing or
# persisting its value.
if [[ -z "${CIVITAI_API_TOKEN:-}" && -r /proc/1/environ ]]; then
  while IFS= read -r -d '' item; do
    case "$item" in
      CIVITAI_API_TOKEN=*) export "$item"; break ;;
    esac
  done < /proc/1/environ
fi

if [[ -z "${CIVITAI_API_TOKEN:-}" || "${CIVITAI_API_TOKEN}" == *RUNPOD_SECRET* ]]; then
  echo "CIVITAI_API_TOKEN secret was not resolved" >&2
  exit 22
fi

fetch() {
  local kind="$1" name="$2" version_id="$3" expected="$4"
  local target="$root/$kind/$name"
  local partial="$target.part"

  if [[ -f "$target" && "$expected" != "-" ]] &&
    printf '%s  %s\n' "$expected" "$target" | sha256sum -c - >/dev/null 2>&1; then
    printf 'verified-existing|%s|%s\n' "$name" "$expected" >> "$state/sdxl-production-installed.txt"
    return
  fi

  curl --fail --location --retry 10 --retry-all-errors --retry-delay 5 \
    --connect-timeout 30 --max-time 10800 --continue-at - \
    --header "Authorization: Bearer $CIVITAI_API_TOKEN" \
    --output "$partial" "https://civitai.com/api/download/models/$version_id"

  local actual
  actual="$(sha256sum "$partial" | awk '{print toupper($1)}')"
  if [[ "$expected" != "-" && "$actual" != "$expected" ]]; then
    printf 'hash-mismatch|%s|expected=%s|actual=%s\n' "$name" "$expected" "$actual" >&2
    exit 23
  fi
  mv "$partial" "$target"
  printf 'installed|%s|%s\n' "$name" "$actual" >> "$state/sdxl-production-installed.txt"
}

printf 'started=%s\n' "$(date -u +%FT%TZ)" > "$state/sdxl-production.status"
: > "$state/sdxl-production-installed.txt"

# Checkpoints
fetch checkpoints ponyRealism_V22.safetensors 914390 7C97ECF786A50A54835A22277C35703787B840E98C04C318A4E3FEF9D3B463F7
fetch checkpoints waiMatureIllustrious_v20.safetensors 2183030 7E4B5E6D917B52FEFF9153BEDE22EA391B1638CF350C8A64ABA23AAE56472FF9

# Base quality LoRAs
fetch loras pony_detailifier_v5.safetensors 624633 -
fetch loras BackgroundDetailerV3-000004.safetensors 726791 DF9E5D5356D662FEE519FF2C448EE1422A43B516BF26798B6AEE4EED410391B3
fetch loras AddMicroDetails_Illustrious_v6.safetensors 2832991 CE12AF9C5E510A745618F76F1197C5776CD283E5DDDD707FC0371AFD940B4454
fetch loras StS-Illustrious-Detail-Slider-v1.0.safetensors 1122976 2E7A68EC7E2EBA5A07881E885E072213BBB1B03CBF881D852F0F85623AD99349

# Female, male, transgender and 2D adult category coverage
fetch loras pony_mature_female_slider_v2.safetensors 1969907 53AF6969C5ECD7AED26D44F73A2DBA7549CE76FB32356E655B14F4CC253D3CCD
fetch loras pony_gender_transition_slider.safetensors 518559 B4290F390036DA023A44B49F4188468BE938EB2ACBD6528BC946E634D46A390B
fetch loras pony_futa_style.safetensors 568579 E7115E3D6A483C6404D78AF54F49D179BE0665B1D53D36B80E5A02B1E7738BA7
fetch loras pony_sex_box_v3.safetensors 1769189 C64899CCDFE6ECC9E4BF40DBC73CB441F6B4D3AEBE39A7D108A40CB7C4EC93BE
fetch loras pony_girl_size_rank4.safetensors 544022 E023A619852C6AC2FEED5484206169B9687A47133979A06233A76BFA7481B0CF
fetch loras illustrious_nsfw_slider_v1.safetensors 1017934 D6DEB0E995E5694D29FE9571D68235D220E6AF0D79F5FF5576FB3F0AF6B522E3
fetch loras illustrious_gender_transition_slider.safetensors 1981172 862DB60020FC989554E7FAE1E833F5FBA22B8B571BCB338132949EE9C32AB1D9
fetch loras illustrious_sex_box_v3.safetensors 1769196 26BBD9B3EA9D004620EE801273B6414EDCE4A0B7ABEFBD573C6F0158929B96E0
fetch loras illustrious_realism_slider_v1.safetensors 1681903 42ABFB595AFC7992C91B542849CA2F3DDB4FED44A21CA1036EB530E0F1BEF053

sync
printf 'completed=%s\n' "$(date -u +%FT%TZ)" >> "$state/sdxl-production.status"
