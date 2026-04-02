#Requires -Version 5.1
# 用法：先在本目录另开终端执行 npm run dev，再运行 npm run tunnel（或双击本脚本前先 cd 到 frontend-demo）
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "  深大记忆 frontend-demo — 内网穿透" -ForegroundColor Cyan
Write-Host "  --------------------------------" -ForegroundColor DarkGray
Write-Host "  1. 另开终端在 frontend-demo 执行: npm run dev"
Write-Host "  2. 本机需已启动 Vite（默认 127.0.0.1:5173）"
Write-Host "  3. 下面会打印公网 URL，发给朋友即可访问你电脑上的页面"
Write-Host "  4. /api 仍由 Vite 代理到你本机 localhost:8000，请同时起后端"
Write-Host ""

$port = 5173
if ($args.Count -ge 1 -and $args[0] -match '^\d+$') {
  $port = [int]$args[0]
}

$local = "http://127.0.0.1:$port"

if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
  Write-Host "[cloudflared] 转发 $local ..." -ForegroundColor Green
  cloudflared tunnel --url $local
  exit $LASTEXITCODE
}

if (Get-Command ngrok -ErrorAction SilentlyContinue) {
  Write-Host "[ngrok] 转发 TCP $port ..." -ForegroundColor Green
  ngrok http $port
  exit $LASTEXITCODE
}

Write-Host "未检测到 cloudflared 或 ngrok（需在 PATH 中）。" -ForegroundColor Yellow
Write-Host ""
Write-Host "安装任选其一（装好后重新打开终端再 npm run tunnel）："
Write-Host "  Cloudflare Tunnel（免注册即可试）："
Write-Host "    winget install --id Cloudflare.cloudflared"
Write-Host "  ngrok："
Write-Host "    winget install ngrok.ngrok"
Write-Host "    首次使用需在 ngrok 网站注册并配置 authtoken"
Write-Host ""
exit 1
