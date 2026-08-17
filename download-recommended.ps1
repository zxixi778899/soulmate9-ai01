# Soulmate9 - 直接下载脚本（SFW 部分，无需 Token）
# NSFW 文件需要 CIVITAI_API_TOKEN，见 download-loras.ps1

param(
    [string]$CivitaiToken = "",
    [string]$OutputDir = "c:\Users\71489\soulmate9\loras"
)

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Push-Location $OutputDir

# Recommended Pack: filename|versionId|nsfw
$entries = @(
    "flux_style_photoreal_v1.safetensors|1084957|0",
    "flux_style_hyperreal_aidma_v1.safetensors|980278|0",
    "flux_detail_skin_v1.safetensors|827325|0",
    "flux_detail_skin_nplastic_v1.safetensors|1301668|0",
    "flux_detail_hands_v1.safetensors|1003317|0",
    "flux_detail_upgrader_v1.safetensors|984672|0",
    "flux_body_curvy_v1.safetensors|1668530|0",
    "flux_body_pear_v1.safetensors|1276427|0",
    "flux_outfit_lingerie_v1.safetensors|869894|1",
    "flux_outfit_bunny_v1.safetensors|817758|1",
    "flux_outfit_maid_v1.safetensors|1588611|1",
    "flux_outfit_bikini_v1.safetensors|1184191|0",
    "flux_outfit_latex_v1.safetensors|734230|1",
    "flux_outfit_school_v1.safetensors|2163726|0",
    "flux_pose_nsfw_dynamic_v1.safetensors|746602|1",
    "flux_face_ahegao_v1.safetensors|1477302|1",
    "flux_style_cinematic_v1.safetensors|953083|0"
)

$ok = @(); $fail = @(); $skip = @(); $blocked = @()

foreach ($e in $entries) {
    $p = $e.Split('|')
    $name = $p[0]; $vid = $p[1]; $isNsfw = ($p[2] -eq "1")

    if (Test-Path $name) {
        Write-Host "[SKIP] $name (already exists)"
        $skip += $name
        continue
    }
    if ($isNsfw -and -not $CivitaiToken) {
        Write-Host "[NEED-TOKEN] $name (NSFW, requires CIVITAI_API_TOKEN)" -ForegroundColor Yellow
        $blocked += $name
        continue
    }

    Write-Host "[DOWN] $name ..." -ForegroundColor Cyan
    $authArgs = @()
    if ($CivitaiToken) { $authArgs = @("-H", "Authorization: Bearer $CivitaiToken") }

    # curl -C - 断点续传; --fail 让 401/404 返回非零
    & curl.exe -L -C - --fail --retry 3 --retry-delay 5 -o $name @authArgs "https://civitai.com/api/download/models/$vid"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] $name" -ForegroundColor Green
        $ok += $name
    } else {
        Write-Host "[FAIL] $name (exit $LASTEXITCODE)" -ForegroundColor Red
        $fail += $name
        # 删除不完整的残留文件（<1MB 视为失败残留）
        if ((Test-Path $name) -and ((Get-Item $name).Length -lt 1MB)) { Remove-Item $name -Force }
    }
}

Pop-Location

Write-Host "`n========== 下载汇总 ==========" -ForegroundColor Cyan
Write-Host "成功: $($ok.Count) | 跳过: $($skip.Count) | 失败: $($fail.Count) | 需Token(NSFW): $($blocked.Count)"
if ($blocked.Count -gt 0) {
    Write-Host "`n待下载 NSFW 文件（需提供 Token）:" -ForegroundColor Yellow
    $blocked | ForEach-Object { Write-Host "  - $_" }
}
Get-ChildItem $OutputDir -Filter "*.safetensors" | Measure-Object -Property Length -Sum | ForEach-Object {
    Write-Host ("目录总大小: {0:N2} GB ({1} files)" -f ($_.Sum / 1GB), $_.Count)
}
