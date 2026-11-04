# Point the Harness profile back at the preserved v1 checkout (one-step rollback).
# Only replaces the `node_modules/@local/whiteboard` link — restart 3080 to apply.
$ErrorActionPreference = 'Stop'

$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\web'
$v1 = Resolve-Path (Join-Path (Split-Path -Parent $PSScriptRoot) '..\whiteboard-plugin') -ErrorAction Stop
$link = Join-Path $profileDir 'node_modules\@local\whiteboard'

if (-not (Test-Path (Join-Path $v1 'package.json'))) {
  throw "v1 checkout not found at $v1"
}

if (Test-Path $link) {
  [System.IO.Directory]::Delete($link)
}
New-Item -ItemType Junction -Path $link -Target $v1.Path | Out-Null

$current = (Get-Item $link).Target
"rolled back @local/whiteboard -> $current"

$pkgFile = Join-Path $profileDir 'package.json'
$raw = Get-Content $pkgFile -Raw
$linkValue = 'link:' + ($v1.Path -replace '\\', '/')
$next = [regex]::Replace($raw, '"@local/whiteboard":\s*"link:[^"]*"', '"@local/whiteboard": "' + $linkValue + '"')
if ($next -ne $raw) {
  Set-Content -Path $pkgFile -Value $next -NoNewline -Encoding UTF8
  "profile package.json dependency updated to $linkValue"
}

"restart the port 3080 dsh web process to run v1 again."
