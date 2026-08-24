# SoulMate AI RunPod 卷清理和 Custom Nodes 安装脚本 (PowerShell 版本)
# 适用于 Windows 本地环境或 WSL

param(
    [string]$RunPodVolumePath = "C:\runpod-volume",
    [string]$ComfyUIPath = "C:\comfyui",
    [switch]$InstallAllNodes,
    [switch]$DownloadModels,
    [switch]$CleanOnly
)

$ErrorActionPreference = "Continue"

Write-Host "🔧 Starting RunPod volume cleanup and node installation..." -ForegroundColor Cyan
Write-Host ""

# ============================================
# 检查目录结构
# ============================================
Write-Host "📋 Checking directory structure..." -ForegroundColor Yellow

if (-not (Test-Path $RunPodVolumePath)) {
    Write-Host "❌ Error: $RunPodVolumePath does not exist!" -ForegroundColor Red
    Write-Host "Please mount or configure your RunPod volume path first." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Volume path found: $RunPodVolumePath" -ForegroundColor Green
Write-Host ""

# ============================================
# 显示当前文件内容
# ============================================
Write-Host "📦 Current files in volume:" -ForegroundColor Yellow
Get-ChildItem -Path $RunPodVolumePath -Recurse -Depth 2 | Select-Object FullName, Length | Format-Table -AutoSize | Out-String | Write-Host

Write-Host ""

# ============================================
# 清理临时文件
# ============================================
if (-not $CleanOnly) {
    Write-Host "🗑️ Cleaning up temporary files..." -ForegroundColor Yellow
    
    # 删除 .tmp 文件
    Get-ChildItem -Path $RunPodVolumePath -Recurse -Include *.tmp, *_tmp*, *_temp*, *.tmp* -File | 
        Where-Object { $_.Name -match '\.tmp|_tmp|_temp' } | 
        Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
    
    # 删除备份文件
    Get-ChildItem -Path $RunPodVolumePath -Recurse -Include *.bak, *.backup, *~, *old -File |
        Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
    
    # 删除日志文件（超过 1 天的）
    $cutoffDate = (Get-Date).AddDays(-1)
    Get-ChildItem -Path $RunPodVolumePath -Recurse -Filter *.log -File |
        Where-Object { $_.LastWriteTime -lt $cutoffDate } |
        Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
    
    # 查找空目录并删除
    function Remove-EmptyDirectories($path) {
        Get-ChildItem -Path $path -Directory | ForEach-Object {
            Remove-EmptyDirectories($_.FullName)
            if ((Get-ChildItem -Path $_.FullName -Recurse).Count -eq 0) {
                Remove-Item -Force -Recurse $_.FullName
            }
        }
    }
    Remove-EmptyDirectories $RunPodVolumePath
    
    Write-Host "✅ Temporary files cleaned" -ForegroundColor Green
    Write-Host ""
}

# ============================================
# 显示已安装的 Custom Nodes
# ============================================
Write-Host "📦 Checking installed Custom Nodes..." -ForegroundColor Yellow

$CustomNodesPath = Join-Path $ComfyUIPath "custom_nodes"
if (Test-Path $CustomNodesPath) {
    Write-Host "Current Custom Nodes:" -ForegroundColor White
    Get-ChildItem -Path $CustomNodesPath -Directory | Select-Object Name | Format-Table -AutoSize
} else {
    Write-Host "⚠️ $CustomNodesPath does not exist" -ForegroundColor Yellow
}

Write-Host ""

# ============================================
# 安装缺失的 Custom Nodes
# ============================================
if (-not $CleanOnly) {
    Write-Host "🎯 Installing Core Custom Nodes..." -ForegroundColor Cyan
    
    $CoreNodes = @{
        'IPAdapter-Flux' = 'https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git'
        'ControlNet' = 'https://github.com/Mikubill/sd-webui-controlnet.git'
        'ADetailer' = 'https://github.com/Gourieff/ComfyUI-ADetailer.git'
        'KJNodes' = 'https://github.com/kijai/ComfyUI-KJNodes.git'
        'ImageMosaic' = 'https://github.com/city96/ComfyUI-Image-Mosaic.git'
        'FlexLoraManager' = 'https://github.com/shiimizu/ComfyUI-Flex-Lora-Manager.git'
    }
    
    foreach ($nodeName in $CoreNodes.Keys) {
        $nodeDir = switch ($nodeName) {
            'IPAdapter-Flux' { 'comfyui-ipadapter-flux' }
            'ControlNet' { 'sd-webui-controlnet' }
            default { "$nodeName" }
        }
        
        $nodePath = Join-Path $CustomNodesPath $nodeDir
        
        if (-not (Test-Path $nodePath)) {
            Write-Host "📥 Installing $nodeName..." -ForegroundColor Green
            try {
                Git clone --depth 1 $CoreNodes[$nodeName] $nodePath
                Write-Host "  ✅ $nodeName installed successfully" -ForegroundColor Green
                
                # 尝试安装 Python 依赖（如果存在 requirements.txt）
                $requirementsPath = Join-Path $nodePath "requirements.txt"
                if (Test-Path $requirementsPath) {
                    Write-Host "  📦 Installing requirements..." -ForegroundColor Yellow
                    pip install --no-cache-dir -r $requirementsPath -ErrorAction SilentlyContinue
                }
            } catch {
                Write-Host "  ⚠️ Failed to install ${nodeName}: ${_}" -ForegroundColor Red
            }
        } else {
            Write-Host "✅ ${nodeName} already installed" -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "🚀 Installing Recommended Nodes (if requested)..." -ForegroundColor Cyan
    
    if ($InstallAllNodes) {
        $RecommendedNodes = @{
            'ImpactPack' = 'https://github.com/ltdrdata/ComfyUI-Impact-Pack.git'
            'ComfyUIManager' = 'https://github.com/pythongosssss/ComfyUI-Manager.git'
            'WASNodeSuite' = 'https://github.com/BadCafé/was-node-suite-comfyui.git'
            'RGThreeComfy' = 'https://github.com/rgthree/rgthree-comfy.git'
            'EasyNotes' = 'https://github.com/nodelove/ComfyUI-Easy-Notes.git'
        }
        
        foreach ($nodeName in $RecommendedNodes.Keys) {
            $nodePath = Join-Path $CustomNodesPath $nodeName.ToLower().Replace(' ', '-')
            
            if (-not (Test-Path $nodePath)) {
                Write-Host "📥 Installing $nodeName..." -ForegroundColor Green
                try {
                    Git clone --depth 1 $RecommendedNodes[$nodeName] $nodePath
                    Write-Host "  ✅ $nodeName installed successfully" -ForegroundColor Green
                } catch {
                    Write-Host "  ⚠️ Failed to install $nodeName: $_" -ForegroundColor Red
                }
            } else {
                Write-Host "✅ $nodeName already installed" -ForegroundColor Gray
            }
        }
    }
    
    Write-Host ""
    
    # ============================================
    # 下载模型脚本
    # ============================================
    if ($DownloadModels) {
        Write-Host "📥 Downloading model download scripts..." -ForegroundColor Cyan
        
        # 创建 ADetailer 脚本
        $AdetailerDir = Join-Path $RunPodVolumePath "models\adetailer\checkpoints"
        New-Item -ItemType Directory -Force -Path $AdetailerDir | Out-Null
        
        $AdetailerScript = @'
#!/bin/bash
MODEL_DIR="/runpod-volume/models/adetailer/checkpoints"
echo "Downloading face detection models..."
wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8n-face.pt -O "$MODEL_DIR/yolov8n-face.pt" --quiet
wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8m-face.pt -O "$MODEL_DIR/yolov8m-face.pt" --quiet
wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8l-face.pt -O "$MODEL_DIR/yolov8l-face.pt" --quiet
echo "✅ Face models downloaded"
echo "Downloading hand detection models..."
wget https://huggingface.co/bottomkeys/yolov8-hand-models/resolve/main/yolov8n-hand.pt -O "$MODEL_DIR/yolov8n-hand.pt" --quiet
wget https://huggingface.co/bottomkeys/yolov8-hand-models/resolve/main/yolov8m-hand.pt -O "$MODEL_DIR/yolov8m-hand.pt" --quiet
echo "✅ Hand models downloaded"
"@
        
        Set-Content -Path (Join-Path $AdetailerDir "checkpoints.sh") -Value $AdetailerScript -Force
        
        # 创建 ControlNet 脚本
        $ControlnetDir = Join-Path $RunPodVolumePath "models\controlnet\preprocessors"
        New-Item -ItemType Directory -Force -Path $ControlnetDir | Out-Null
        
        $ControlnetScript = @'
#!/bin/bash
PREPROCESSOR_DIR="/runpod-volume/models/controlnet/preprocessors"
echo "Downloading pose models..."
wget https://huggingface.co/yzd-v/DWPose/resolve/main/openpose/full.yaml -O "$PREPROCESSOR_DIR/full.yaml" --quiet
wget https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ocr/model.pth -O "$PREPROCESSOR_DIR/model.pth" --quiet
python -m pip install ultralytics==8.3.0 --quiet
echo "✅ Preprocessors configured"
"@
        
        Set-Content -Path (Join-Path $ControlnetDir "preprocessors.sh") -Value $ControlnetScript -Force
        
        # 创建 Upscaler 脚本
        $UpscaleDir = Join-Path $RunPodVolumePath "models\upscale\models"
        New-Item -ItemType Directory -Force -Path $UpscaleDir | Out-Null
        
        $UpscaleScript = @'
#!/bin/bash
UPSCALE_DIR="/runpod-volume/models/upscale/models"
echo "Downloading upscaler models..."
wget https://github.com/xinntao/RealESRGAN/releases/download/v0.2.1/RealESRGAN_x4plus.pth -O "$UPSCALE_DIR/RealESRGAN_x4plus.pth" --quiet
wget https://github.com/xinntao/RealESRGAN/releases/download/v0.2.2/RealESRGAN_x2plus.pth -O "$UPSCALE_DIR/RealESRGAN_x2plus.pth" --quiet
wget https://github.com/xinntao/ESRGAN/releases/download/v0.1.0/ESRGAN_x4.pth -O "$UPSCALE_DIR/ESRGAN_x4.pth" --quiet
wget https://huggingface.co/ultimatheist/ultrasharp-upscalers/resolve/main/4x-UltraSharp.pth -O "$UPSCALE_DIR/4x-UltraSharp.pth" --quiet
echo "✅ Upscaler models downloaded"
"@
        
        Set-Content -Path (Join-Path $UpscaleDir "models.sh") -Value $UpscaleScript -Force
        
        Write-Host "✅ Model download scripts created" -ForegroundColor Green
        Write-Host ""
    }
}

# ============================================
# 显示最终状态
# ============================================
Write-Host "✨ ✅ Installation Complete!" -ForegroundColor Green
Write-Host ""

Write-Host "📦 Installed Custom Nodes:" -ForegroundColor Cyan
if (Test-Path $CustomNodesPath) {
    Get-ChildItem -Path $CustomNodesPath -Directory | Select-Object Name | Format-Table -AutoSize
} else {
    Write-Host "  (No custom nodes found)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "📁 Model Directories:" -ForegroundColor Cyan
Write-Host "  - IP-Adapter: $RunPodVolumePath\models\ipadapter-flux"
Write-Host "  - Clip Vision: $RunPodVolumePath\models\clip_vision"
Write-Host "  - ControlNet: $RunPodVolumePath\models\controlnet\preprocessors"
Write-Host "  - ADetailer: $RunPodVolumePath\models\adetailer\checkpoints"
Write-Host "  - Upscaler: $RunPodVolumePath\models\upscale\models"

Write-Host ""
Write-Host "💡 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Review the installed nodes above"
Write-Host "2. If you want to download models, run:"
Write-Host "   bash `"$AdetailerDir\checkpoints.sh`""
Write-Host "   bash `"$ControlnetDir\preprocessors.sh`""
Write-Host "   bash `"$UpscaleDir\models.sh`""
Write-Host ""
Write-Host "3. Restart ComfyUI to load all new nodes"
Write-Host ""
