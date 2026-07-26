param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$ExpectedSha256
)

$ErrorActionPreference = 'Stop'
$directory = Split-Path -Parent $Target
New-Item -ItemType Directory -Force -Path $directory | Out-Null

Write-Output "DOWNLOAD $(Split-Path -Leaf $Target)"
& curl.exe -fL --silent --show-error --retry 6 --retry-delay 3 `
  --connect-timeout 30 --speed-time 60 --speed-limit 1024 `
  -G --data-urlencode "token=$env:CIVITAI_API_TOKEN" `
  -C - -o $Target $Url
if ($LASTEXITCODE -ne 0) {
  throw "download failed: $Target"
}

$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Target).Hash
if ($actual -ne $ExpectedSha256) {
  throw "checksum failed: $Target expected=$ExpectedSha256 actual=$actual"
}

Write-Output "VERIFIED $(Split-Path -Leaf $Target) $((Get-Item $Target).Length)"
