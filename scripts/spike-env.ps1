# spike-env.ps1 — 隔离的 DSH 环境（不碰 3080 / 真实 DSH_HOME）
#
# 用法：
#   pwsh scripts/spike-env.ps1                      # 启动隔离 GUI（默认 3091 端口）
#   pwsh scripts/spike-env.ps1 -PluginPath <dir>    # 先把插件装进隔离 profile，再启动
#   pwsh scripts/spike-env.ps1 -Stop                # 停止隔离实例
#   pwsh scripts/spike-env.ps1 -Port 3092           # 换端口
#
# 行为：
#   - DSH_HOME = <workspace>\.spike\dsh-home（可删，不影响真实数据）
#   - 从真实 DSH_HOME 只读复制 `.credentials.yaml`（模型可用），不写回
#   - 首次启动自动创建 profile/web；安装插件后会再启动一次
#   - 输出带 token 的 URL；pid 写入 .spike\web.pid，日志在 .spike\web.*.log
param(
  [int]$Port = 3091,
  [string]$DshHome = '',
  [string]$PluginPath = '',
  [switch]$Stop,
  [int]$TimeoutSec = 90
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$spike = Join-Path (Split-Path -Parent $root) '.spike'
if (-not $DshHome) { $DshHome = Join-Path $spike 'dsh-home' }
$pidFile = Join-Path $spike 'web.pid'
$logFile = Join-Path $spike 'web.out.log'
$errFile = Join-Path $spike 'web.err.log'

function Stop-Isolated {
  if (Test-Path $pidFile) {
    $procId = [int]((Get-Content $pidFile -Raw).Trim())
    & taskkill /PID $procId /T /F 2>$null | Out-Null
  }
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

function Start-Isolated {
  Stop-Isolated
  Remove-Item $logFile, $errFile -ErrorAction SilentlyContinue
  $spawnArgs = '-NoProfile', '-Command', ("`$env:DSH_HOME='" + $DshHome + "'; & dsh web --port " + $Port + " --no-open")
  Start-Process -FilePath 'pwsh' -ArgumentList $spawnArgs -RedirectStandardOutput $logFile -RedirectStandardError $errFile -WindowStyle Hidden | Out-Null
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $url = $null
  while ((Get-Date) -lt $deadline -and -not $url) {
    Start-Sleep -Milliseconds 750
    if (Test-Path $logFile) {
      $m = Select-String -Path $logFile -Pattern ("http://127\.0\.0\.1:" + $Port + "/\?token=[A-Za-z0-9_\-]+") -AllMatches -ErrorAction SilentlyContinue
      if ($m) { $url = $m.Matches[0].Value }
    }
  }
  if (-not $url) { throw ("isolated dsh web did not print an auth URL; see " + $logFile + " / " + $errFile) }
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conn) { $conn.OwningProcess | Set-Content $pidFile }
  Write-Output ("isolated GUI: " + $url)
  Write-Output ("DSH_HOME: " + $DshHome)
  Write-Output ("logs: " + $logFile + " / " + $errFile)
}

if ($Stop) {
  Stop-Isolated
  Write-Output ("stopped isolated dsh web on port " + $Port)
  return
}

New-Item -ItemType Directory -Force -Path $spike, $DshHome | Out-Null

# 只读复制凭证：spike 环境的模型调用与真实验收一致，但会话/画板数据完全隔离。
$realHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$credSrc = Join-Path $realHome '.credentials.yaml'
$credDst = Join-Path $DshHome '.credentials.yaml'
if ((Test-Path $credSrc) -and -not (Test-Path $credDst)) { Copy-Item $credSrc $credDst -Force }

Start-Isolated

if ($PluginPath) {
  Stop-Isolated
  $profileDir = Join-Path $DshHome 'profiles\web'
  if (-not (Test-Path (Join-Path $profileDir 'package.json'))) {
    throw ("profile not initialized: " + $profileDir)
  }
  $target = (Get-Item $PluginPath).FullName
  $pkgName = (Get-Content (Join-Path $target 'package.json') -Raw | ConvertFrom-Json).name
  $link = Join-Path $profileDir ("node_modules\" + ($pkgName -replace '/', '\'))
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $link) | Out-Null
  if (Test-Path $link) { [System.IO.Directory]::Delete($link) }
  New-Item -ItemType Junction -Path $link -Target $target | Out-Null

  $pkgFile = Join-Path $profileDir 'package.json'
  $obj = Get-Content $pkgFile -Raw | ConvertFrom-Json
  $linkValue = 'link:' + ($target -replace '\\', '/')
  $obj.dependencies | Add-Member -NotePropertyName $pkgName -NotePropertyValue $linkValue -Force
  if ($obj.dsh.profile.bundles -notcontains $pkgName) { $obj.dsh.profile.bundles += $pkgName }
  $obj | ConvertTo-Json -Depth 20 | Set-Content -Path $pkgFile -Encoding UTF8
  Write-Output ("installed " + $pkgName + " -> " + $target)
  Start-Isolated
}

