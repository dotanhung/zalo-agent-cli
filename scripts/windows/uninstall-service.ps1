<#
  Go dich vu ZaloAgentMCP va tra Claude Code ve che do tu bat (stdio).
      powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall-service.ps1
#>
param([string]$TaskName = "ZaloAgentMCP")
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$entry = Join-Path $repo "src\index.js"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -like "*mcp start*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# Lenh ngoai (claude) ghi stderr khi khong co server cu: khong coi la loi
$ErrorActionPreference = "Continue"
if (Get-Command claude -ErrorAction SilentlyContinue) {
    claude mcp remove zalo -s user 2>$null | Out-Null
    claude mcp add zalo -s user -- node "$entry" mcp start | Out-Null
    claude mcp get zalo
}
Write-Host "Da go dich vu. Claude Code quay ve tu bat cong cu Zalo theo phien." -ForegroundColor Green
