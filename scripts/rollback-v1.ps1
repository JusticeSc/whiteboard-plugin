# Point the Harness web profile back at the preserved sibling v1 source.
# Replaces the plugin junction and updates an existing matching link: dependency.
# This switches source only; restart explicitly and restore data separately if needed.
$ErrorActionPreference = 'Stop'

$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\web'
$v1 = Resolve-Path (Join-Path (Split-Path -Parent $PSScriptRoot) '..\whiteboard-plugin-v1') -ErrorAction Stop
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
