<#
.SYNOPSIS
    Read-only status report for the kid tablet. Run as SYSTEM from ET Ducky.

.DESCRIPTION
    Shows the installed module, whether the home screen was built from it, whether she is signed
    in, the installed apps (with voice pack sizes), and the end of the launcher and kiosk logs.
    Changes nothing.
#>

# ---- Settings ---------------------------------------------------------------
$LogLines = 20
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Continue'
$dataDir    = Join-Path $env:ProgramData 'KidTablet'
$moduleFile = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet\KidTablet.psm1'
$homeExe    = Join-Path $env:ProgramFiles 'KidTablet\KidHome.exe'
$appsDir    = 'C:\KidTabletApps'

function Section([string]$title) { Write-Output ''; Write-Output "== $title ==" }

Section 'Module'
if (Test-Path $moduleFile) {
    $m = Get-Item $moduleFile
    Write-Output ('{0}  {1:yyyy-MM-dd HH:mm}  SHA256 {2}' -f $m.FullName, $m.LastWriteTime, (Get-FileHash $m.FullName).Hash)
} else {
    Write-Output 'Not installed.'
}

Section 'Home screen'
if (Test-Path $homeExe) {
    $e = Get-Item $homeExe
    Write-Output ('{0}  {1:yyyy-MM-dd HH:mm}' -f $e.FullName, $e.LastWriteTime)
} else {
    Write-Output 'KidHome.exe not built.'
}
$hashFile = Join-Path $dataDir 'KidHome.sha256'
if ((Test-Path $moduleFile) -and (Test-Path $hashFile)) {
    try {
        $mod = Import-Module $moduleFile -Force -PassThru
        $src = & $mod { $script:KidHomeSource }
        $sha = [Security.Cryptography.SHA256]::Create()
        $want = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($src))) -replace '-', ''
        $have = (Get-Content $hashFile -Raw).Trim()
        Write-Output $(if ($want -eq $have) { 'Built from the installed module.' } else { 'OUT OF DATE: run Sync-KidTablet.ps1 to rebuild it.' })
    } catch { Write-Output "Could not compare: $($_.Exception.Message)" }
}

Section 'Sessions'
$q = @(quser.exe 2>$null)
if ($q) { $q | ForEach-Object { Write-Output $_ } } else { Write-Output 'Nobody signed in.' }

Section 'Apps'
if (Test-Path $appsDir) {
    Get-ChildItem $appsDir -Recurse -File |
        Sort-Object FullName |
        ForEach-Object { '{0,-52} {1,10:N0} KB  {2:yyyy-MM-dd HH:mm}' -f $_.FullName.Substring($appsDir.Length + 1), ($_.Length / 1KB), $_.LastWriteTime } |
        ForEach-Object { Write-Output $_ }
} else {
    Write-Output "$appsDir not found."
}

foreach ($log in 'launch.log', 'kiosk-apply.log') {
    Section $log
    $p = Join-Path $dataDir $log
    if (Test-Path $p) { Get-Content $p -Tail $LogLines | ForEach-Object { Write-Output $_ } } else { Write-Output 'No log.' }
}
exit 0
