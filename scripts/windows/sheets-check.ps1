<#
  Kiem tra ket noi Zalo -> Google Sheets ma khong in ra ma bi mat.
  So "van tay" (8 ky tu dau SHA-256) cua ma trong mcp-config.json voi ma Apps Script dang dung,
  roi gui 1 dong thu.
      powershell -ExecutionPolicy Bypass -File .\scripts\windows\sheets-check.ps1
  Them -CopyToken de chep ma vao clipboard (dan vao Thuoc tinh tap lenh TOKEN cua Apps Script).
#>
param([switch]$CopyToken, [switch]$NoTestRow)
$ErrorActionPreference = "Stop"

$data = if ($env:ZALO_AGENT_HOME) { $env:ZALO_AGENT_HOME } else { Join-Path $HOME ".zalo-agent-cli" }
$f = Join-Path $data "mcp-config.json"
$c = Get-Content $f -Raw | ConvertFrom-Json
$url = [string]$c.forward.url
$tok = ([string]$c.forward.token).Trim()
if (-not $url -or -not $tok) { throw "mcp-config.json chua co forward.url / forward.token" }

$sha = [System.Security.Cryptography.SHA256]::Create()
$bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($tok))
$localFp = -join ($bytes[0..3] | ForEach-Object { $_.ToString("x2") })

if ($CopyToken) { $tok | Set-Clipboard; Write-Host "Da chep ma vao clipboard." -ForegroundColor Yellow }

Write-Host ""
Write-Host "May (mcp-config.json):  van tay ma = $localFp"
try {
    $g = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 20
} catch {
    Write-Host "Khong goi duoc trang kiem tra cua Apps Script: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "-> Apps Script chua co ban 3 (doGet) hoac URL sai. Dan Code.gs moi va trien khai Phien ban moi."
    exit 1
}
if (-not $g.version) {
    Write-Host "Apps Script tra ve trang khong phai JSON -> chua trien khai Code.gs ban 3." -ForegroundColor Red
    exit 1
}
Write-Host "Apps Script dang chay: phien ban code $($g.version), Sheet '$($g.spreadsheet)'"
Write-Host "Apps Script:            van tay ma = $($g.tokenFingerprint)  (da dat TOKEN: $($g.tokenSet))"

if (-not $g.tokenSet) {
    Write-Host "LOI: chua dat TOKEN trong Cai dat du an -> Thuoc tinh tap lenh." -ForegroundColor Red; exit 1
}
if ($g.tokenFingerprint -ne $localFp) {
    Write-Host "LOI: ma KHONG khop. Chay lai voi -CopyToken roi dan vao Thuoc tinh tap lenh TOKEN." -ForegroundColor Red; exit 1
}
Write-Host "Ma KHOP." -ForegroundColor Green

if (-not $NoTestRow) {
    $t = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    $body = @{ token = $tok; messages = @(@{ msgId = "check-$t"; threadId = "test"; threadName = "KIEM TRA"; senderName = "sheets-check"; text = "Dong kiem tra"; timestamp = $t; type = "text" }) } | ConvertTo-Json -Depth 5
    $r = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
    if ($r.ok) { Write-Host "Ghi thu: OK (them $($r.added) dong 'KIEM TRA' vao Sheet '$($g.spreadsheet)')" -ForegroundColor Green }
    else { Write-Host "Ghi thu: LOI ($($r.error))" -ForegroundColor Red; exit 1 }
}
