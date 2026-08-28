# RunPod Docker Deploy Script - Fix 2026-08-27
# Fixes: ADetailer path prefix + Impact Pack missing

Write-Host "=== Checking Environment ===" -ForegroundColor Cyan

# Check Docker
docker ps >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker Desktop not running!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop from Start Menu" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Docker is running" -ForegroundColor Green

# Load env
$envFile = "c:\Users\71489\soulmate9\.env.prod.local"
if (Test-Path $envFile) {
    . $envFile
    if (-not $RUNPOD_API_KEY) {
        Write-Host "ERROR: RUNPOD_API_KEY missing in .env.prod.local" -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] RunPod API Key loaded" -ForegroundColor Green
} else {
    Write-Host "WARNING: .env.prod.local not found" -ForegroundColor Yellow
}

# Build SDXL-Pro
Write-Host ""
Write-Host "=== Building SDXL-Pro Image ===" -ForegroundColor Magenta
docker build --platform linux/amd64 --progress plain `
    -t sdxl-pro:fix-20260827 `
    -f c:\Users\71489\soulmate9\runpod\comfyui-worker\Dockerfile.sdxl-pro `
    c:\Users\71489\soulmate9

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: SDXL-Pro build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] SDXL-Pro built successfully" -ForegroundColor Green

# Build FLUX Premium
Write-Host ""
Write-Host "=== Building FLUX Premium Image ===" -ForegroundColor Magenta
docker build --platform linux/amd64 --progress plain `
    -t flux-premium:fix-20260827 `
    -f c:\Users\71489\soulmate9\runpod\comfyui-worker\Dockerfile.flux-premium `
    c:\Users\71489\soulmate9

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: FLUX Premium build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] FLUX Premium built successfully" -ForegroundColor Green

# Get user input
Write-Host ""
Write-Host "=== Push to RunPod ===" -ForegroundColor Magenta
Write-Host "Steps to get your info:" -ForegroundColor Yellow
Write-Host "1. Login to https://www.runpod.io/console"
Write-Host "2. Settings -> Access Tokens -> Create Token"
Write-Host "3. Settings -> Account Info -> Copy Account ID"
Write-Host "4. Settings -> Regions -> Note region (e.g., eu-1, us-east-1)"

$account = Read-Host "Enter your RunPod Account ID"
$region = Read-Host "Enter your RunPod Region"

if ([string]::IsNullOrEmpty($account) -or [string]::IsNullOrEmpty($region)) {
    Write-Host "ERROR: Account ID and Region cannot be empty" -ForegroundColor Red
    exit 1
}

$tagPrefix = "pod-run${account}.dkr.${region}.container-registry.runpod.io"
$sdxlTag = "${tagPrefix}/sdxl-pro:fix-20260827"
$fluxTag = "${tagPrefix}/flux-premium:fix-20260827"

Write-Host ""
Write-Host "=== Tagging Images ===" -ForegroundColor Cyan
Write-Host "SDXL-Pro tag: $sdxlTag"
Write-Host "FLUX Premium tag: $fluxTag"

docker tag sdxl-pro:fix-20260827 $sdxlTag
docker tag flux-premium:fix-20260827 $fluxTag
Write-Host "[OK] Images tagged" -ForegroundColor Green

# Login
Write-Host ""
Write-Host "=== Login to RunPod Registry ===" -ForegroundColor Cyan
Write-Host "API Key: ${RUNPOD_API_KEY.Substring(0,15)}..."
docker login $tagPrefix

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Login failed! Check API Key" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Login successful" -ForegroundColor Green

# Push SDXL-Pro
Write-Host ""
Write-Host "=== Pushing SDXL-Pro ===" -ForegroundColor Magenta
Write-Host "Pushing: $sdxlTag"
docker push $sdxlTag

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: SDXL-Pro push failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] SDXL-Pro pushed" -ForegroundColor Green

# Push FLUX Premium
Write-Host ""
Write-Host "=== Pushing FLUX Premium ===" -ForegroundColor Magenta
Write-Host "Pushing: $fluxTag"
docker push $fluxTag

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: FLUX Premium push failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] FLUX Premium pushed" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Login to https://www.runpod.io/console"
Write-Host "2. Go to Serverless or Cloud Pods"
Write-Host "3. Update endpoints with new image versions:"
Write-Host "   - SDXL-Pro endpoint ID: kbca2e380jc74s"
Write-Host "   - Comfy Dual endpoint ID: e40cgshtouocg8"
Write-Host "4. Select images:"
Write-Host "   - sdxl-pro:fix-20260827"
Write-Host "   - flux-premium:fix-20260827"
Write-Host "5. Save and reload endpoints"
Write-Host "6. Test face detailer and chat image generation"
Write-Host ""
Write-Host "Reference: DEPLOY-RUNPOD-MIRRORS.md" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Cyan