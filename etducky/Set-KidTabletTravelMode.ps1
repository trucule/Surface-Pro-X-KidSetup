<#
.SYNOPSIS
    Travel mode: lifts her website allowlist for a few hours, then puts it back by itself. Run as SYSTEM from ET Ducky.

.DESCRIPTION
    For an airplane's entertainment portal, whose video and pages may come from web addresses that are not on her
    allowlist and cannot be checked before the flight (the portal only works on the plane's WiFi). Turn it on
    before boarding, while the tablet can still reach ET Ducky. Every other limit stays: kiosk, apps, SafeSearch.

    When it ends, at the end time (or at her next sign-in if the tablet was asleep), the allowlist comes back and
    the sites her apps opened are listed in C:\ProgramData\KidTablet\jobs\travel-hosts.txt. Get-KidTabletStatus.ps1
    shows that list, so the ones the portal needs can be added for good.

    Exit code 0 on success, 1 on failure.
#>

# ---- Settings ---------------------------------------------------------------
$Hours = 6          # 1 to 24
$Off   = $false     # $true ends travel mode now
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
try { Set-ExecutionPolicy Bypass -Scope Process -Force } catch { }

try {
    $moduleFile = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet\KidTablet.psm1'
    if (-not (Test-Path $moduleFile)) { throw 'KidTablet is not installed on this device. Run Deploy-KidTablet.ps1 first.' }
    Import-Module $moduleFile -Force
    if (-not (Get-Command Set-KidTravelMode -ErrorAction SilentlyContinue)) { throw 'The tablet has an older KidTablet module. Run Update-KidTabletApps.ps1 first.' }
    if ($Off) { Set-KidTravelMode -Off } else { Set-KidTravelMode -Hours $Hours }
    exit 0
} catch {
    Write-Error ("Travel mode failed: {0}" -f $_.Exception.Message)
    exit 1
}
