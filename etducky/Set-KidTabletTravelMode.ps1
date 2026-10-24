<#
.SYNOPSIS
    Travel mode: shows the airline entertainment tiles and lifts her website allowlist for a few hours, then hides
    the tiles and turns the allowlist back on by itself. Run as SYSTEM from ET Ducky.

.DESCRIPTION
    Tiles for Southwest, United, Delta, American, Alaska and JetBlue appear on her home screen within a few
    minutes. Each opens that airline's entertainment portal, which only answers on the plane's WiFi. Her website
    allowlist is lifted at once, because a portal may load pages from addresses that cannot be checked ahead of
    time. Every other limit stays: kiosk, her apps, SafeSearch.

    When ET Ducky asks for Hours, give the number of hours (1 to 48). Leave it empty for 6. Give 0 to end travel
    mode now. It also ends by itself at the end time, or at her next sign-in if the tablet was asleep then; the
    sites her apps opened are listed by Get-KidTabletStatus.ps1.

    Turn it on before boarding, while the tablet can still reach ET Ducky.

    Exit code 0 on success, 1 on failure.
#>

# ---- Settings ---------------------------------------------------------------
$HoursInput   = '<Hours>'    # ET Ducky asks for this when the script runs
$DefaultHours = 6
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
try { Set-ExecutionPolicy Bypass -Scope Process -Force } catch { }

try {
    $hours = $DefaultHours
    $n = 0
    if ([int]::TryParse(([string]$HoursInput).Trim(), [ref]$n)) { $hours = $n }   # empty or not filled in: the default
    if ($hours -lt 0 -or $hours -gt 48) { throw "Hours must be 0 (end travel mode) or 1 to 48; got '$HoursInput'." }

    $moduleFile = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet\KidTablet.psm1'
    if (-not (Test-Path $moduleFile)) { throw 'KidTablet is not installed on this device. Run Deploy-KidTablet.ps1 first.' }
    Import-Module $moduleFile -Force
    if ((Get-Content $moduleFile -Raw) -notmatch 'TravelApps') { throw 'The tablet has an older KidTablet module. Run Update-KidTabletApps.ps1 first.' }
    if ($hours -eq 0) { Set-KidTravelMode -Off } else { Set-KidTravelMode -Hours $hours }
    exit 0
} catch {
    Write-Error ("Travel mode failed: {0}" -f $_.Exception.Message)
    exit 1
}
