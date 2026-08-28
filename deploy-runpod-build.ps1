# RunPod Docker 镜像部署脚本（2026-08-27 修复版）

# 🔍 环境检查...
Write-Host "🔍 环境检查..." -ForegroundColor Cyan

# 1. 检查 Docker 状态
$dockerStatus = docker ps 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker Desktop 未运行！请手动启动 Docker Desktop" -ForegroundColor Red
    Write-Host "💡 在开始菜单搜索 'Docker Desktop' 并打开" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Docker 正在运行" -ForegroundColor Green

# 2. 检查 RunPod 环境变量
$envFile = "c:\Users\71489\soulmate9\.env.prod.local"
if (Test-Path $envFile) {
    . $envFile
    
    if (-not $RUNPOD_API_KEY) {
        Write-Host "❌ RUNPOD_API_KEY 缺失 - 请确保 .env.prod.local 已配置" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ RunPod API Key: ${RUNPOD_API_KEY.Substring(0,15)}..." -ForegroundColor Green
} else {
    Write-Host "⚠️  .env.prod.local 不存在，使用环境变量中的 RUNPOD_API_KEY" -ForegroundColor Yellow
}

# 🚀 开始构建
Write-Host "`n🏗️ 开始构建 SDXL-Pro 镜像..." -ForegroundColor Magenta

# Step 1: 构建 SDXL-Pro
Write-Host "[1/3] Building sdxl-pro mirror..." -ForegroundColor Cyan
docker build --platform linux/amd64 --progress plain -t sdxl-pro:fix-20260827 `
    -f c:\Users\71489\soulmate9\runpod\comfyui-worker\Dockerfile.sdxl-pro `
    c:\Users\71489\soulmate9

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ SDXL-Pro 构建失败！" -ForegroundColor Red
    exit 1
}
Write-Host "✅ SDXL-Pro 构建完成" -ForegroundColor Green

Write-Host "`n🏗️ 开始构建 FLUX Premium 镜像..." -ForegroundColor Magenta

# Step 2: 构建 FLUX Premium
Write-Host "[2/3] Building flux-premium mirror..." -ForegroundColor Cyan
docker build --platform linux/amd64 --progress plain -t flux-premium:fix-20260827 `
    -f c:\Users\71489\soulmate9\runpod\comfyui-worker\Dockerfile.flux-premium `
    c:\Users\71489\soulmate9

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ FLUX Premium 构建失败！" -ForegroundColor Red
    exit 1
}
Write-Host "✅ FLUX Premium 构建完成" -ForegroundColor Green

# 📦 准备推送
Write-Host "`n📤 准备推送镜像到 RunPod..." -ForegroundColor Magenta

# 提示用户输入信息
Write-Host "`n请按以下步骤获取你的 Registry 信息：" -ForegroundColor Yellow
Write-Host "1. 登录 https://www.runpod.io/console" -ForegroundColor White
Write-Host "2. Settings → Access Tokens → Create Token" -ForegroundColor White
Write-Host "3. Settings → Account Info → 复制 Account ID" -ForegroundColor White
Write-Host "4. Settings → Regions → 记录你使用的区域（如 eu-1, us-east-1）" -ForegroundColor White

$account = Read-Host "请输入你的 RunPod Account ID"
$region = Read-Host "请输入你的 RunPod Region（如 eu-1、us-east-1）"

# 验证输入
if ([string]::IsNullOrEmpty($account) -or [string]::IsNullOrEmpty($region)) {
    Write-Host "❌ Account ID 或 Region 不能为空" -ForegroundColor Red
    exit 1
}

# 构建完整镜像标签
$tagPrefix = "pod-run${account}.dkr.${region}.container-registry.runpod.io"
$sdxlTag = "${tagPrefix}/sdxl-pro:fix-20260827"
$fluxTag = "${tagPrefix}/flux-premium:fix-20260827"

Write-Host "`n🏷️ 镜像标签:" -ForegroundColor Cyan
Write-Host "  • SDXL-Pro: $sdxlTag"
Write-Host "  • FLUX Premium: $fluxTag"

# Step 3: 标记镜像
Write-Host "`n[3/3] Tagging mirrors..." -ForegroundColor Cyan
docker tag sdxl-pro:fix-20260827 $sdxlTag
docker tag flux-premium:fix-20260827 $fluxTag
Write-Host "✅ 镜像标签完成" -ForegroundColor Green

# Step 4: 登录 RunPod Registry
Write-Host "`n🔐 登录 RunPod Container Registry..." -ForegroundColor Cyan
Write-Host "按提示输入 RUNPOD_API_KEY: $RUNPOD_API_KEY" -ForegroundColor Yellow
Write-Host "(如果提示输入密码，直接按回车)" -ForegroundColor Yellow

docker login $tagPrefix

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 登录失败！请检查 RUNPOD_API_KEY 是否正确" -ForegroundColor Red
    exit 1
}
Write-Host "✅ 登录成功" -ForegroundColor Green

# Step 5: 推送镜像
Write-Host "`n📤 推送 SDXL-Pro 镜像..." -ForegroundColor Magenta
Write-Host "[Step 1 of 2] Pushing sdxl-pro (${sdxlTag})..." -ForegroundColor Cyan
docker push $sdxlTag

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ SDXL-Pro 推送失败！请检查网络连接" -ForegroundColor Red
    exit 1
}
Write-Host "✅ SDXL-Pro 推送完成" -ForegroundColor Green

Write-Host "`n📤 推送 FLUX Premium 镜像..." -ForegroundColor Magenta
Write-Host "[Step 2 of 2] Pushing flux-premium (${fluxTag})..." -ForegroundColor Cyan
docker push $fluxTag

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ FLUX Premium 推送失败！请检查网络连接" -ForegroundColor Red
    exit 1
}
Write-Host "✅ FLUX Premium 推送完成" -ForegroundColor Green

# 🎉 完成
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🎉 部署成功！" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Write-Host "`n下一步操作：" -ForegroundColor Yellow
Write-Host "1. 登录 https://www.runpod.io/console" -ForegroundColor White
Write-Host "2. 进入 Serverless 或 Cloud Pods" -ForegroundColor White
Write-Host "3. 找到以下端点并更新镜像版本：" -ForegroundColor White
Write-Host "   - SDXL-Pro 端点 ID: kbca2e380jc74s" -ForegroundColor Cyan
Write-Host "   - Comfy Dual 端点 ID: e40cgshtouocg8" -ForegroundColor Cyan
Write-Host "4. 在镜像选择器中查找：" -ForegroundColor White
Write-Host "   - sdxl-pro:fix-20260827" -ForegroundColor Cyan
Write-Host "   - flux-premium:fix-20260827" -ForegroundColor Cyan
Write-Host "5. 保存并重新加载端点" -ForegroundColor White
Write-Host "6. 测试捏脸生图和对话生图功能" -ForegroundColor White

Write-Host "`n提示：可以通过 GitHub Actions 自动化此流程" -ForegroundColor Blue
Write-Host "参考文档：DEPLOY-RUNPOD-MIRRORS.md" -ForegroundColor Blue

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan