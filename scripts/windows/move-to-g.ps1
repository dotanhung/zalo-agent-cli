<#
  Chuyen TOAN BO cong cu Zalo sang o G (khong con phu thuoc o C), hoac khoi phuc sau khi cai lai Windows.

  Bo cuc tren o G:
    G:\07_TQM_ZALO_AGENT_DESKTOP   repo phat trien (da co, nhanh feat/...)          - khong dung toi
    G:\07_TQM_ZALO_AGENT_RUNTIME   ban chay dich vu: worktree cua repo tren, ghim vao origin/main
    G:\07_TQM_ZALO_AGENT_DATA      du lieu: dang nhap Zalo, mcp-config.json, log, ma dich vu (chi tai khoan nay doc)

  Chuyen lan dau (PowerShell Run as administrator):
      powershell -ExecutionPolicy Bypass -File G:\07_TQM_ZALO_AGENT_DESKTOP\scripts\windows\move-to-g.ps1
  Khoi phuc sau khi cai lai Windows (da cai Node, Git, Claude Code):
      powershell -ExecutionPolicy Bypass -File G:\07_TQM_ZALO_AGENT_RUNTIME\scripts\windows\move-to-g.ps1 -Restore

  Khong xoa gi o o C. Ban cu o C giu nguyen lam ban du phong.
#>
param(
    [string]$DevRepo = "G:\07_TQM_ZALO_AGENT_DESKTOP",
    [string]$RuntimeDir = "G:\07_TQM_ZALO_AGENT_RUNTIME",
    [string]$DataDir = "G:\07_TQM_ZALO_AGENT_DATA",
    [switch]$Restore
)
$ErrorActionPreference = "Stop"
function Step($msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Cyan }
function Native($exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { throw "$exe $($argv -join ' ') -> exit $LASTEXITCODE" }
}

# 0. Kiem tra o G la o cung trong may
Step "Kiem tra o G"
$drive = [System.IO.DriveInfo]::new((Split-Path -Qualifier $DataDir))
if (-not $drive.IsReady -or $drive.DriveType -ne "Fixed") { throw "$($drive.Name) khong phai o cung trong may (DriveType=$($drive.DriveType))." }
Write-Host "$($drive.Name) $($drive.VolumeLabel) - $($drive.DriveFormat), con trong $([math]::Round($drive.AvailableFreeSpace/1GB,1)) GB"
foreach ($cmd in "node", "git", "npm") { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Chua cai $cmd." } }

# 1. Ban chay dich vu (runtime) tren o G, ghim vao origin/main
Step "Ban chay dich vu: $RuntimeDir"
if (-not (Test-Path (Join-Path $RuntimeDir "src\index.js"))) {
    if (-not (Test-Path (Join-Path $DevRepo ".git"))) {
        Native git @("clone", "https://github.com/dotanhung/zalo-agent-cli", $DevRepo)
    }
    Native git @("-C", $DevRepo, "fetch", "origin", "main")
    Native git @("-C", $DevRepo, "worktree", "add", "--detach", $RuntimeDir, "origin/main")
} else {
    Native git @("-C", $RuntimeDir, "fetch", "origin", "main")
    Native git @("-C", $RuntimeDir, "checkout", "--detach", "origin/main")
}
Push-Location $RuntimeDir
try { Native npm @("ci", "--omit=dev", "--no-audit", "--no-fund") } finally { Pop-Location }
Write-Host "Runtime o commit: $(git -C $RuntimeDir log -1 --format='%h %s')"

# 2. Dung dich vu dang chay (tu o C) truoc khi chep du lieu
Step "Dung dich vu cu"
if (Get-ScheduledTask -TaskName "ZaloAgentMCP" -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName "ZaloAgentMCP" }
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -like "*mcp start*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# 3. Du lieu sang o G (chep, khong xoa ban o C)
Step "Du lieu: $DataDir"
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
if ($Restore) {
    # Cai lai Windows -> tai khoan moi khac SID: lay lai quyen so huu thu muc du lieu
    takeown /f $DataDir /r /d y | Out-Null
    icacls $DataDir /reset /t /q | Out-Null
} elseif (Test-Path (Join-Path $DataDir "mcp-config.json")) {
    Write-Host "Du lieu da o $DataDir - khong chep lai tu o C (chay cap nhat)."
} else {
    $oldData = Join-Path $HOME ".zalo-agent-cli"
    if (Test-Path $oldData) {
        robocopy $oldData $DataDir /E /XO /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy loi ($LASTEXITCODE) khi chep $oldData" }
        Write-Host "Da chep $oldData -> $DataDir"
    }
    $oldOa = Join-Path $HOME ".zalo-agent"
    if (Test-Path $oldOa) {
        robocopy $oldOa (Join-Path $DataDir "oa") /E /XO /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy loi ($LASTEXITCODE) khi chep $oldOa" }
        Write-Host "Da chep $oldOa -> $DataDir\oa"
    }
}
# Chi tai khoan nay (va SYSTEM) doc duoc thu muc du lieu
icacls $DataDir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" "SYSTEM:(OI)(CI)F" /t /q | Out-Null
if (-not (Test-Path (Join-Path $DataDir "mcp-config.json"))) { Write-Host "Chua co mcp-config.json trong $DataDir" -ForegroundColor Yellow }

# 4. Bien moi truong cho moi lenh zalo-agent (ke ca Claude Code) dung du lieu o G
Step "Dat ZALO_AGENT_HOME"
[Environment]::SetEnvironmentVariable("ZALO_AGENT_HOME", $DataDir, "User")
$env:ZALO_AGENT_HOME = $DataDir
Write-Host "ZALO_AGENT_HOME = $DataDir"

# 5. Lenh zalo-agent tro vao ban o G
Step "Lenh zalo-agent"
Native npm @("install", "-g", $RuntimeDir, "--no-audit", "--no-fund")

# 6. Cai lai dich vu tu ban o G
Step "Cai dich vu tu $RuntimeDir"
& powershell -ExecutionPolicy Bypass -File (Join-Path $RuntimeDir "scripts\windows\install-service.ps1") -DataDir $DataDir
if ($LASTEXITCODE -ne 0) { throw "install-service.ps1 loi ($LASTEXITCODE)" }

# 7. Kiem tra Google Sheet
Step "Kiem tra Google Sheet"
& powershell -ExecutionPolicy Bypass -File (Join-Path $RuntimeDir "scripts\windows\sheets-check.ps1") -NoTestRow

Write-Host ""
Write-Host "XONG. Dich vu chay tu $RuntimeDir, du lieu o $DataDir." -ForegroundColor Green
Write-Host "Ban cu o C (C:\Users\Admin\zalo-agent-cli va $HOME\.zalo-agent-cli) giu nguyen lam du phong."
Write-Host "Cap nhat ban moi sau nay: chay lai script nay (khong co -Restore)."
