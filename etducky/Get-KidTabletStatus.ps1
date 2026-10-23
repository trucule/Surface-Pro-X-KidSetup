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

Section 'Background update (Update-KidTabletApps)'
$task = Get-ScheduledTask -TaskName 'KidTablet-UpdateApps' -ErrorAction SilentlyContinue
if ($task) { $info = $task | Get-ScheduledTaskInfo; Write-Output ('Task {0}; last run {1:yyyy-MM-dd HH:mm}, result {2}' -f $task.State, $info.LastRunTime, $info.LastTaskResult) } else { Write-Output 'Never run.' }
$jobLog = Join-Path $dataDir 'jobs\update-apps.log'
if (Test-Path $jobLog) { Get-Content $jobLog -Tail $LogLines | Where-Object { $_ -notmatch '^\*{10}' } | ForEach-Object { Write-Output $_ } }

Section 'Travel mode'
$cfgNow = Get-Content (Join-Path $dataDir 'config.json') -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
$tu = if ($cfgNow) { [string]$cfgNow.TravelUntil } else { '' }
if ($tu -and ([datetime]$tu) -gt (Get-Date)) { Write-Output ('On until {0:ddd h:mm tt}. Her website allowlist is lifted until then.' -f [datetime]$tu) } else { Write-Output 'Off.' }
$th = Join-Path $dataDir 'jobs\travel-hosts.txt'
if (Test-Path $th) { Get-Content $th | ForEach-Object { Write-Output $_ } }
$sl = Join-Path $dataDir 'jobs\sync.log'
if (Test-Path $sl) { Section 'Background sync'; Get-Content $sl -Tail 6 | Where-Object { $_ -notmatch '^\*{10}' } | ForEach-Object { Write-Output $_ } }

# The launcher writes launch.log (errors) and home.log (the app in front and the Home pill) into her own profile;
# the kiosk log is machine-wide.
$logs = @(Get-ChildItem 'C:\Users\*\AppData\Local\KidTablet\launch.log', 'C:\Users\*\AppData\Local\KidTablet\home.log' -ErrorAction SilentlyContinue) + @(Get-Item (Join-Path $dataDir 'kiosk-apply.log') -ErrorAction SilentlyContinue)
foreach ($f in 'launch.log', 'home.log', 'kiosk-apply.log') {
    Section $f
    $hit = $logs | Where-Object Name -eq $f
    if ($hit) { foreach ($h in $hit) { Get-Content $h.FullName -Tail $LogLines | ForEach-Object { Write-Output $_ } } } else { Write-Output 'No log.' }
}
exit 0
