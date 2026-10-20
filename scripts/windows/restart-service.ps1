<#
  Khoi dong lai dich vu ZaloAgentMCP (sau khi sua mcp-config.json hoac git pull).
  Stop-ScheduledTask chi dung wscript; node chay ben trong van song va giu cong 3847,
  nen script nay dung han node truoc khi chay lai task.
      powershell -ExecutionPolicy Bypass -File .\scripts\windows\restart-service.ps1
#>
param(
    [int]$Port = 3847,
    [string]$TaskName = "ZaloAgentMCP"
)
$ErrorActionPreference = "Stop"

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -like "*mcp start*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $TaskName

$health = "http://127.0.0.1:$Port/health"
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $h = Invoke-RestMethod -Uri $health -TimeoutSec 3
        if ($h.status -eq "ok" -and $h.uptime -lt 120) {
            Write-Host "Da khoi dong lai. uptime=$($h.uptime)s" -ForegroundColor Green
            exit 0
        }
    } catch {}
}
$data = if ($env:ZALO_AGENT_HOME) { $env:ZALO_AGENT_HOME } else { Join-Path $HOME ".zalo-agent-cli" }
Write-Host "Dich vu chua len sau 60 giay. Xem log: $data\service\mcp-http.log" -ForegroundColor Red
exit 1
