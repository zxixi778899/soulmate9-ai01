# Soulmate9 - LoRA 下载脚本 (PowerShell 版本)
# 支持断点续传，自动创建目录
# 使用方法：.\download-loras.ps1 -UrlsFile "data\lora-urls.recommended.txt"

param(
    [string]$CivitaiToken = "",
    [string]$OutputDir = "$env:USERPROFILE\models\loras",
    [string]$UrlsFile = "data\lora-urls.recommended.txt"
)

# 创建输出目录
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Set-Location $OutputDir

# 下载函数（支持断点续传）
function Download-File {
    param(
        [string]$Url,
        [string]$FileName,
        [string]$Token
    )
    
    # 检查是否已存在
    if (Test-Path $FileName) {
        Write-Host "[SKIP] $FileName 已存在" -ForegroundColor Cyan
        return
    }
    
    Write-Host "[DOWN] $FileName" -ForegroundColor Yellow
    
    # 构建请求头
    $headers = @{}
    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
        Write-Host "[AUTH] 使用 Civitai Token" -ForegroundColor Green
    }
    
    try {
        # 使用 Invoke-WebRequest 支持断点续传
        Invoke-WebRequest -Uri $Url -OutFile $FileName -Headers $headers -UseBasicParsing -TimeoutSec 300 | Out-Null
        
        if ($?) {
            Write-Host "[OK] $FileName" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] $FileName" -ForegroundColor Red
        }
    } catch {
        Write-Host "[ERROR] $_" -ForegroundColor Red
    }
}

# 读取 URL 文件
if (-not (Test-Path $UrlsFile)) {
    Write-Error "URLs 文件不存在：$UrlsFile"
    exit 1
}

$urls = Get-Content $UrlsFile | Where-Object { $_ -match '^\S+\.safetensors\|https://' }

Write-Host "`n========== SoulMate LoRA 下载开始 ==========" -ForegroundColor Cyan
Write-Host "目标目录：$OutputDir" -Information
Write-Host "总共需要下载：$($urls.Count) 个文件`n" -Information

# 执行下载
foreach ($line in $urls) {
    $parts = $line -split '\|'
    if ($parts.Count -ge 2) {
        $fileName = $parts[0]
        $url = $parts[1]
        Download-File -Url $url -FileName $fileName -Token $CivitaiToken
        Start-Sleep -Milliseconds 500  # 避免请求过快被限流
    }
}

# 统计结果
Write-Host "`n========== 下载完成 ==========" -ForegroundColor Cyan
$files = Get-ChildItem -Path $OutputDir -Filter "*.safetensors" | Measure-Object
Write-Host "共 $($files.Count) 个 safetensors 文件"
