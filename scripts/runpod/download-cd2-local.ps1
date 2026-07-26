$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$root = 'C:\tmp\soulmate-cd2-upload\models'
New-Item -ItemType Directory -Force -Path "$root\checkpoints", "$root\loras" | Out-Null

$sets = @(
  @{ Manifest = "$PSScriptRoot\cd2-models.txt"; Dir = "$root\checkpoints" },
  @{ Manifest = "$PSScriptRoot\cd2-loras.txt"; Dir = "$root\loras" }
)

foreach ($set in $sets) {
  Get-Content $set.Manifest |
    Where-Object { $_ -and -not $_.StartsWith('#') } |
    ForEach-Object {
      $parts = $_ -split '\|'
      $name = $parts[0]
      $url = $parts[1]
      $expected = $parts[2]
      $target = Join-Path $set.Dir $name

      Write-Output "DOWNLOAD $name"
      & curl.exe -fL --silent --show-error --retry 6 --retry-delay 3 `
        --connect-timeout 30 --speed-time 60 --speed-limit 1024 `
        -G --data-urlencode "token=$env:CIVITAI_API_TOKEN" `
        -C - -o $target $url
      if ($LASTEXITCODE -ne 0) {
        throw "download failed: $name"
      }

      $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash
      if ($actual -ne $expected) {
        throw "checksum failed: $name expected=$expected actual=$actual"
      }
      Write-Output "VERIFIED $name $((Get-Item $target).Length)"
    }
}

Write-Output 'DOWNLOADS_COMPLETE'
