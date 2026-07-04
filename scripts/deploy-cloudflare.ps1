param(
  [string]$DatabaseId = "",
  [string]$AdminPassword = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Invoke-Step {
  param([string]$Label, [scriptblock]$Command)
  Write-Host "`n==> $Label"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed"
  }
}

function Get-WranglerJson {
  return Get-Content -LiteralPath "$repo\wrangler.jsonc" -Raw | ConvertFrom-Json
}

function Save-WranglerJson {
  param($Config)
  $Config | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath "$repo\wrangler.jsonc" -Encoding ascii
}

if ($DryRun) {
  Invoke-Step "Type check" { npm run check }
  Invoke-Step "Wrangler deploy dry-run" { npx wrangler deploy --dry-run }
  exit 0
}

$whoami = & npx wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0 -or ($whoami -join "`n") -match "not authenticated") {
  throw "Wrangler is not logged in. Run: npx wrangler login"
}

$config = Get-WranglerJson
$db = $config.d1_databases | Where-Object { $_.binding -eq "DB" } | Select-Object -First 1
if (-not $db) {
  throw "No DB binding found in wrangler.jsonc"
}

if ([string]::IsNullOrWhiteSpace($DatabaseId) -and $db.database_id -ne "00000000-0000-0000-0000-000000000000") {
  $DatabaseId = $db.database_id
}

if ([string]::IsNullOrWhiteSpace($DatabaseId)) {
  Write-Host "`n==> Create D1 database"
  $createOutput = & npx wrangler d1 create $db.database_name 2>&1
  $createText = $createOutput -join "`n"
  Write-Host $createText
  if ($LASTEXITCODE -ne 0) {
    throw "D1 create failed. If the database already exists, rerun with -DatabaseId <id>."
  }
  $match = [regex]::Match($createText, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
  if (-not $match.Success) {
    throw "Could not find database_id in Wrangler output"
  }
  $DatabaseId = $match.Value
}

$db.database_id = $DatabaseId
Save-WranglerJson $config
Write-Host "Updated wrangler.jsonc database_id: $DatabaseId"

if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $AdminPassword = [Convert]::ToBase64String($bytes).TrimEnd("=")
}

Write-Host "`n==> Upload ADMIN_PASSWORD secret"
$AdminPassword | npx wrangler secret put ADMIN_PASSWORD
if ($LASTEXITCODE -ne 0) {
  throw "ADMIN_PASSWORD secret upload failed"
}

Invoke-Step "Apply remote D1 migrations" { npx wrangler d1 migrations apply $db.database_name --remote }
Invoke-Step "Deploy Worker" { npx wrangler deploy }

Write-Host "`nCloudflare deploy complete."
Write-Host "Admin password was generated for this deployment and not saved to the repo."
