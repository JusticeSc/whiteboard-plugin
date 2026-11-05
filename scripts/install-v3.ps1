# Point the Harness web profile at this checkout.
# Replaces the plugin junction and updates an existing matching link: dependency
# in the profile package.json. Does not migrate or restore data.
# The running dsh web process is unchanged; restart explicitly to activate.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $PSScriptRoot
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\web'
$link = Join-Path $profileDir 'node_modules\@local\whiteboard'

if (-not (Test-Path (Join-Path $here 'package.json'))) {
  throw "not a plugin directory: $here"
}
if (-not (Test-Path $profileDir)) {
  throw "web profile not found under $env:USERPROFILE\.dsh\profiles\web"
}

$target = (Get-Item $here).FullName
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $link) | Out-Null

if (Test-Path $link) {
  # Directory.Delete removes the link itself (junction/symlink), never the target.
  [System.IO.Directory]::Delete($link)
}
New-Item -ItemType Junction -Path $link -Target $target | Out-Null

$current = (Get-Item $link).Target
"installed @local/whiteboard -> $current"

# Keep the profile manifest in sync so a later `pnpm install` does not silently relink v1.
$pkgFile = Join-Path $profileDir 'package.json'
$raw = Get-Content $pkgFile -Raw
$linkValue = 'link:' + ($target -replace '\\', '/')
$next = [regex]::Replace($raw, '"@local/whiteboard":\s*"link:[^"]*"', '"@local/whiteboard": "' + $linkValue + '"')
if ($next -ne $raw) {
  Set-Content -Path $pkgFile -Value $next -NoNewline -Encoding UTF8
  "profile package.json dependency updated to $linkValue"
}

"restart the port 3080 dsh web process to activate (stopping it ends the current session)."
