<#
.SYNOPSIS
    Adds a website tile to her home screen and its domains to her allowlist. Run as SYSTEM from ET Ducky.

.DESCRIPTION
    Set the tile in the Settings block. Airline entertainment tiles are not added here: travel mode
    (Set-KidTabletTravelMode.ps1) shows them while it is on. The sync that puts the tile on her home screen runs as a
    background task, so ET Ducky's time limit cannot cut it off; the tile appears within a few minutes and
    Get-KidTabletStatus.ps1 shows the sync log.

    The address is given as a host name, and https is added when the script runs.

    Exit code 0 on success, 1 on failure.
#>

# ---- Settings ---------------------------------------------------------------
$Name      = 'PBS Kids Games'
$SiteHost  = 'pbskids.org'                    # opened over https
$Domains   = @('pbskids.org')                 # her allowlist; subdomains are included
$Icon      = 'U+1F3AE'                        # any emoji or U+ code point
$Color     = '#2F9E44'
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
try { Set-ExecutionPolicy Bypass -Scope Process -Force } catch { }

try {
    $moduleFile = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet\KidTablet.psm1'
    if (-not (Test-Path $moduleFile)) { throw 'KidTablet is not installed on this device. Run Deploy-KidTablet.ps1 first.' }
    Import-Module $moduleFile -Force
    if (-not (Get-Command Start-KidBackgroundSync -ErrorAction SilentlyContinue)) { throw 'The tablet has an older KidTablet module. Run Update-KidTabletApps.ps1 first.' }
    $url = 'https' + [char]58 + '//' + $SiteHost + '/'
    Add-KidWebApp -Name $Name -Url $url -AllowDomain $Domains -Icon $Icon -Color $Color -NoSync
    Write-Host "Added '$Name' ($SiteHost); allowed: $($Domains -join ', ')."
    Start-KidBackgroundSync
    exit 0
} catch {
    Write-Error ("Adding the tile failed: {0}" -f $_.Exception.Message)
    exit 1
}
