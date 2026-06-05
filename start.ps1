# Drift Coach — start script for Windows (PowerShell)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# Load .env into the environment if present
if (Test-Path .env) {
  Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*#') { return }
    if ($_ -match '^\s*$') { return }
    $kv = $_ -split '=', 2
    if ($kv.Length -eq 2) {
      [System.Environment]::SetEnvironmentVariable($kv[0].Trim(), $kv[1].Trim(), 'Process')
    }
  }
}

$port = if ($env:PORT) { $env:PORT } else { "3002" }
$host = if ($env:HOST) { $env:HOST } else { "0.0.0.0" }
$udp  = if ($env:FORZA_PORT) { $env:FORZA_PORT } else { "5330" }

Write-Host "[drift-coach] starting on http://$host`:$port (FORZA UDP: $udp)" -ForegroundColor Cyan
node ".\.output\server\index.mjs"
