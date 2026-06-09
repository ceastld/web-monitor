# Launch Chrome with remote debugging for Web Monitor login import.
# Chrome 136+ blocks CDP on the default User Data path; we sync to a separate profile dir.
$ErrorActionPreference = "Stop"

$DebugPort = if ($env:CHROME_CDP_PORT) { $env:CHROME_CDP_PORT } else { 19222 }

$chromePaths = @(
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  Write-Error "未找到 Chrome，请先安装 Google Chrome"
  exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$cdpUserData = Join-Path $projectRoot "data\chrome-cdp-profile"
$sourceUserData = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"

Write-Host "正在关闭 Chrome（含后台进程）..."
taskkill /F /IM chrome.exe /T 2>$null | Out-Null
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Process chrome -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
}
if (Get-Process chrome -ErrorAction SilentlyContinue) {
  Write-Error "无法关闭所有 Chrome 进程。请在任务管理器中结束 chrome.exe，并关闭 Chrome「关闭后继续运行后台应用」。"
  exit 1
}

Write-Host "同步 Chrome 登录配置到独立调试目录..."
Write-Host "  来源: $sourceUserData"
Write-Host "  目标: $cdpUserData"
New-Item -ItemType Directory -Force -Path $cdpUserData | Out-Null
robocopy $sourceUserData $cdpUserData /E /XD "Cache" "Code Cache" "GPUCache" "Service Worker" "ShaderCache" /XO /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

Write-Host "启动 Chrome（调试端口 $DebugPort）..."
Start-Process -FilePath $chrome -ArgumentList @(
  "--remote-debugging-port=$DebugPort",
  "--remote-debugging-address=127.0.0.1",
  "--remote-allow-origins=*",
  "--user-data-dir=`"$cdpUserData`"",
  "--no-first-run"
)

$probeUrl = "http://127.0.0.1:$DebugPort/json/version"
for ($attempt = 1; $attempt -le 15; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $version = Invoke-RestMethod -Uri $probeUrl -TimeoutSec 2 -Proxy $null
    Write-Host "调试端口已就绪：$($version.Browser)"
    Write-Host "Web Monitor 将连接 $probeUrl"
    exit 0
  } catch {
    if ($attempt -eq 15) {
      Write-Warning "Chrome 已启动，但 $probeUrl 暂未响应。请稍后刷新 Web Monitor 再试。"
      exit 1
    }
  }
}
