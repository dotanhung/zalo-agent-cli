<#
  Doi ma bi mat giua bot Zalo va Google Sheet (forward.token <-> Thuoc tinh tap lenh TOKEN) ma khong in ma ra man hinh.
      powershell -ExecutionPolicy Bypass -File G:\07_TQM_ZALO_AGENT_RUNTIME\scripts\windows\rotate-sheet-token.ps1

  Thu tu (de khong mat tin):
    1. Tao ma moi, chep vao clipboard, in "van tay" (8 ky tu dau SHA-256).
    2. Anh dan vao Apps Script: Cai dat du an -> Thuoc tinh tap lenh -> TOKEN -> Luu (khong can trien khai lai).
    3. Script doi den khi trang kiem tra cua Apps Script bao dung van tay moi.
    4. Moi ghi ma moi vao mcp-config.json (co ban sao), khoi dong lai bot, gui 1 dong thu.
  Tin den trong vai giay giua buoc 2 va 4 bi Sheet tu choi, nhung bot gui bu khi khoi dong lai nen khong mat.
  Dung giua chung (Ctrl+C) truoc buoc 4: may khong doi gi; dat lai TOKEN cu bang sheets-check.ps1 -CopyToken.
#>
$ErrorActionPreference = "Stop"

$data = if ($env:ZALO_AGENT_HOME) { $env:ZALO_AGENT_HOME } else { Join-Path $HOME ".zalo-agent-cli" }
$f = Join-Path $data "mcp-config.json"
$c = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
$url = [string]$c.forward.url
if (-not $url -or -not $c.forward.token) { throw "mcp-config.json chua co forward.url / forward.token - cai Sheet truoc (integrations/google-sheets/README.md)." }

function Fingerprint([string]$s) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    -join ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($s))[0..3] | ForEach-Object { $_.ToString("x2") })
}

# 1. Ma moi: 32 byte ngau nhien an toan -> 64 ky tu hex
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$buf = New-Object byte[] 32
$rng.GetBytes($buf)
$newTok = -join ($buf | ForEach-Object { $_.ToString("x2") })
$newFp = Fingerprint $newTok
$newTok | Set-Clipboard
Write-Host ""
Write-Host "Da tao ma moi va chep vao clipboard (van tay $newFp). Ma khong hien ra man hinh." -ForegroundColor Yellow
Write-Host "Buoc tiep: Apps Script cua Sheet -> Cai dat du an (banh rang) -> Thuoc tinh tap lenh"
Write-Host "           -> sua TOKEN -> xoa gia tri cu, dan (Ctrl+V) -> Luu thuoc tinh tap lenh."

# 2-3. Doi Apps Script nhan ma moi
while ($true) {
    Read-Host "Nhan Enter khi da luu TOKEN moi trong Apps Script (Ctrl+C de huy, may chua doi gi)" | Out-Null
    try {
        $g = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 20
    } catch {
        Write-Host "Khong goi duoc trang kiem tra Apps Script: $($_.Exception.Message)" -ForegroundColor Red
        continue
    }
    if ($g.tokenFingerprint -eq $newFp) { Write-Host "Apps Script da nhan ma moi." -ForegroundColor Green; break }
    Write-Host "Apps Script van dung van tay $($g.tokenFingerprint), chua phai $newFp. Kiem tra lai TOKEN (dan lai bang Ctrl+V) roi Enter." -ForegroundColor Red
    $newTok | Set-Clipboard
}

# 4. Ghi ma moi vao cau hinh bot (co ban sao), khoi dong lai, gui dong thu
$bak = "$f.bak-$(Get-Date -Format yyyyMMdd-HHmmss)-truoc-doi-ma"
Copy-Item $f $bak
$c.forward.token = $newTok
[IO.File]::WriteAllText($f, ($c | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))
Write-Host "Da ghi ma moi vao mcp-config.json (ban cu: $(Split-Path $bak -Leaf))."

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "restart-service.ps1")
if ($LASTEXITCODE -ne 0) { Write-Host "Bot chua khoi dong lai duoc - xem log. Cau hinh da co ma moi." -ForegroundColor Red; exit 1 }
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "sheets-check.ps1")
$ok = $LASTEXITCODE -eq 0
Set-Clipboard -Value " "
Write-Host "Da xoa clipboard."
if (-not $ok) { exit 1 }
Write-Host ""
Write-Host "XONG. Ma cu het hieu luc: xoa moi noi con luu ma cu (vi du trang 'mabimat' trong Sheet)." -ForegroundColor Green
