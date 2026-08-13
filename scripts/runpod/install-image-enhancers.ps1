$ErrorActionPreference = 'Stop'
$root = if ($env:COMFY_ROOT) { $env:COMFY_ROOT } else { 'C:\workspace\ComfyUI' }
& bash (Join-Path $PSScriptRoot 'install-image-enhancers.sh')
