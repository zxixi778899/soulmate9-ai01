# SoulMate AI - 查看 RunPod 卷文件结构脚本
# 用于检查和列出 RunPod 网络卷中的所有文件

param(
    [string]$RunPodVolumePath = "C:\runpod-volume",
    [switch]$Detailed,
    [switch]$LargeOnly,
    [int]$MaxDepth = 5
)

Write-Host "📊 Analyzing RunPod Volume Structure" -ForegroundColor Cyan
Write-Host "Path: $RunPodVolumePath" -ForegroundColor Gray
Write-Host ""

if (-not (Test-Path $RunPodVolumePath)) {
    Write-Host "❌ Error: $RunPodVolumePath does not exist!" -ForegroundColor Red
    Write-Host "Please check your volume path configuration." -ForegroundColor Yellow
    exit 1
}

# ============================================
# 1. 目录概览
# ============================================
Write-Host "🗂️ Directory Structure Overview:" -ForegroundColor Yellow
Write-Host ""

Get-ChildItem -Path $RunPodVolumePath -Directory -ErrorAction SilentlyContinue | 
    Select-Object Name, @{Name='Size(MB)';Expression={[math]::Round($_.GetTotalSize() / 1MB, 2)}} |
    Sort-Object 'Size(MB)' -Descending |
    Format-Table -AutoSize

Write-Host ""

# ============================================
# 2. 文件大小统计
# ============================================
Write-Host "📈 File Size Statistics:" -ForegroundColor Yellow

$totalFiles = 0
$totalSize = 0
$byExtension = @{}

Get-ChildItem -Path $RunPodVolumePath -Recurse -File -ErrorAction SilentlyContinue | 
    Where-Object { $_.LinkCount -eq 0 -or $_.Mode -ne 'd' } |
    ForEach-Object {
        $totalFiles++
        $totalSize += $_.Length
        
        $ext = if ($_.Extension) { $_.Extension } else { "(no extension)" }
        if ($byExtension[$ext]) {
            $byExtension[$ext] += $_.Length
        } else {
            $byExtension[$ext] = $_.Length
        }
    }

Write-Host "Total Files: $totalFiles" -ForegroundColor White
Write-Host "Total Size: $('{0:N2}' -f ($totalSize / 1GB)) GB" -ForegroundColor White
Write-Host ""

Write-Host "By Extension:" -ForegroundColor Cyan
$byExtension.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 15 |
    ForEach-Object {
        $sizeMB = '{0:N2}' -f ($_.Value / 1MB)
        Write-Host "  $($_.Key): $sizeMB MB"
    }

Write-Host ""

# ============================================
# 3. 大型文件 (>100MB)
# ============================================
if ($LargeOnly) {
    Write-Host "🔍 Large Files (>100MB):" -ForegroundColor Yellow
    
    Get-ChildItem -Path $RunPodVolumePath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -gt 100MB } |
        Select-Object FullName, @{N='Size(MB)';E={[math]::Round($_.Length/1MB, 2)}}, Length |
        Sort-Object 'Size(MB)' -Descending |
        Format-Table -AutoSize
    
    Write-Host ""
}

# ============================================
# 4. 可疑文件（临时文件、备份）
# ============================================
Write-Host "⚠️ Temporary/Backup Files:" -ForegroundColor Yellow

$tempFiles = @(
    Get-ChildItem -Path $RunPodVolumePath -Recurse -Include *.tmp, *_tmp*, *_temp*, *.bak, *.backup, *~, *old, *.log -File -ErrorAction SilentlyContinue
)

if ($tempFiles.Count -gt 0) {
    $tempFiles | Select-Object FullName, @{N='Size(KB)';E={[math]::Round($_.Length/1KB, 2)}}, LastWriteTime |
        Format-Table -AutoSize
    
    Write-Host ""
    Write-Host "Total temp files: $($tempFiles.Count)" -ForegroundColor Red
} else {
    Write-Host "No temporary/backup files found." -ForegroundColor Green
}

Write-Host ""

# ============================================
# 5. 详细的树形结构
# ============================================
if ($Detailed) {
    Write-Host "🌳 Detailed Directory Tree:" -ForegroundColor Yellow
    
    function Show-Tree($path, $depth) {
        $indent = "  " * $depth
        $items = Get-ChildItem -Path $path -ErrorAction SilentlyContinue
        
        foreach ($item in $items) {
            if ((Get-Item $item).Name.Length -lt 20) {
                Write-Host "$indent├── $($item.Name)" -ForegroundColor $(if ($item.PSIsContainer) { "Green" } else { "White" })
                
                if ($item.PSIsContainer -and $depth -lt $MaxDepth) {
                    Show-Tree $item.FullName ($depth + 1)
                }
            }
        }
    }
    
    Show-Tree $RunPodVolumePath 0
    Write-Host ""
}

# ============================================
# 6. 模型文件检查
# ============================================
Write-Host "🎬 Model Files Status:" -ForegroundColor Yellow

$modelTypes = @{
    'Checkpoints' = @('*.safetensors', '*.ckpt', '*.pt')
    'LoRA' = @('*.safetensors')
    'VAE' = @('*.vae*.pt', '*.vae*.safetensors')
    'CLIP' = @('*.bin', '*.torch', '*.pt')
    'ControlNet' = @('*.pth', '*.pt', '*.bin')
    'IPAdapter' = @('*.ipadapter*', '*.pb')
    'Upscale' = @('*.esrgan*', '*.realesrgan*')
}

foreach ($modelType in $modelTypes.Keys) {
    Write-Host "`n${modelType}:" -ForegroundColor Cyan
    $found = $false
    
    foreach ($pattern in $modelTypes[$modelType]) {
        $files = Get-ChildItem -Path $RunPodVolumePath -Recurse -Filter $pattern -ErrorAction SilentlyContinue
        
        if ($files.Count -gt 0) {
            $files | Select-Object FullName, @{N='Size(MB)';E={[math]::Round($_.Length/1MB, 2)}} |
                Format-Table -AutoSize
            
            $found = $true
        }
    }
    
    if (-not $found) {
        Write-Host "  (None found)" -ForegroundColor Gray
    }
}

Write-Host ""

# ============================================
# 7. 建议操作
# ============================================
Write-Host "💡 Recommendations:" -ForegroundColor Yellow

# 检查是否有大量临时文件
if ($tempFiles.Count -gt 100) {
    Write-Host "⚠️ Found $($tempFiles.Count) temporary files - Consider cleaning them up" -ForegroundColor Red
}

# 检查是否有大型未压缩文件
$lzmaFiles = Get-ChildItem -Path $RunPodVolumePath -Recurse -Filter "*.xz" -File -ErrorAction SilentlyContinue
if ($lzmaFiles.Count -gt 0) {
    Write-Host "⚠️ Found $($lzmaFiles.Count) .xz files - These might be compressed archives that can be removed after extraction" -ForegroundColor Yellow
}

# 检查 Git 缓存
$gitDirs = Get-ChildItem -Path $RunPodVolumePath -Recurse -Directory -Filter ".git" -ErrorAction SilentlyContinue
if ($gitDirs.Count -gt 0) {
    Write-Host "⚠️ Found $($gitDirs.Count) .git directories - These are unnecessary in production environment" -ForegroundColor Yellow
}

# 总空间使用
$usedSpace = (Get-ChildItem -Path $RunPodVolumePath -Recurse | Measure-Object -Property Length -Sum).Sum
$freeSpace = (Get-Volume -DrivePath $RunPodVolumePath.Replace(":", "")).SizeRemaining
Write-Host ""
Write-Host "Used Space: $(('{0:N2}' -f ($usedSpace / 1GB))) GB" -ForegroundColor Cyan
Write-Host "Free Space: $(('{0:N2}' -f ($freeSpace / 1GB))) GB" -ForegroundColor Cyan
Write-Host ""

# 生成清理命令提示
Write-Host "🧹 Suggested Cleanup Commands (PowerShell):" -ForegroundColor Cyan
Write-Host '```powershell'
Write-Host '# Clean temporary files'
Write-Host "Get-ChildItem -Path `\"$RunPodVolumePath`\" -Recurse -Include *.tmp, *.bak, *.backup, *~ -File | Remove-Item -Force"
Write-Host ""
Write-Host '# Clean old log files'
Write-Host '\$cutoff = (Get-Date).AddDays(-1)'
Write-Host "Get-ChildItem -Path `\"$RunPodVolumePath`\" -Recurse -Filter *.log -File | Where-Object { \$_.LastWriteTime -lt \$cutoff } | Remove-Item -Force"
Write-Host ""
Write-Host '# Remove empty directories'
Write-Host "Get-ChildItem -Path `\"$RunPodVolumePath`\" -Recurse -Directory | Where-Object { (Get-ChildItem `$.FullName -Recurse).Count -eq 0 } | Remove-Item -Force -Recurse"
Write-Host '```'
Write-Host ""
