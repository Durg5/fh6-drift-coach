# prepare-sidecar.ps1
#
# Downloads a portable Node.js binary for Windows and places it in
# src-tauri/binaries/ with the Tauri externalBin naming convention.

$ErrorActionPreference = "Stop"

$NodeVersion = if ($env:NODE_SIDECAR_VERSION) { $env:NODE_SIDECAR_VERSION } else { "v22.11.0" }
$Root = (Resolve-Path "$PSScriptRoot\..").Path
$BinDir = Join-Path $Root "src-tauri\binaries"
$Tmp = New-Item -ItemType Directory -Path ([System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.Guid]::NewGuid()))

try {
  Write-Host "Detecting host platform" -ForegroundColor Cyan

  $arch = (Get-CimInstance Win32_Processor).Architecture
  switch ($arch) {
    9  { $target = "x86_64-pc-windows-msvc"; $nodeDist = "node-$NodeVersion-win-x64.zip" }
    12 { $target = "aarch64-pc-windows-msvc"; $nodeDist = "node-$NodeVersion-win-arm64.zip" }
    default {
      Write-Host "Unsupported Windows arch: $arch" -ForegroundColor Red
      exit 1
    }
  }

  $url = "https://nodejs.org/dist/$NodeVersion/$nodeDist"
  $dest = Join-Path $BinDir "node-sidecar-$target.exe"

  if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir | Out-Null }

  if (Test-Path $dest) {
    Write-Host "  Sidecar already present: $dest" -ForegroundColor Green
    Write-Host "  (delete it to force a re-download)" -ForegroundColor Green
    exit 0
  }

  Write-Host "Downloading Node $NodeVersion for $target" -ForegroundColor Cyan
  Write-Host "  $url" -ForegroundColor Yellow

  $archive = Join-Path $Tmp "node.zip"
  Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing

  Write-Host "Extracting" -ForegroundColor Cyan
  Expand-Archive -Path $archive -DestinationPath $Tmp -Force
  $extracted = Get-ChildItem $Tmp -Directory | Where-Object { $_.Name -like "node-*" } | Select-Object -First 1
  if (-not $extracted) {
    Write-Host "Failed to find extracted Node directory" -ForegroundColor Red
    exit 1
  }

  Copy-Item -Path (Join-Path $extracted.FullName "node.exe") -Destination $dest -Force

  Write-Host "OK  Sidecar ready: $dest" -ForegroundColor Green
}
finally {
  if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp }
}
