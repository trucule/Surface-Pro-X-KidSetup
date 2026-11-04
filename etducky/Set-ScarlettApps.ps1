<#
.SYNOPSIS
    Puts Scarlett's own website tiles on her tablet and takes away the ones she no longer uses. Run as SYSTEM from
    ET Ducky.

.DESCRIPTION
    These sites are hers alone (her family's accounts and choices). They are not defaults of the KidTablet module and
    not part of the app collection that Duckling Tablet ships; the module's defaults and the Duckling catalog leave
    them out on purpose.

    The lists are in the Settings block. Tiles already there are updated, missing ones are added, and tiles named in
    $Remove are taken off with their domains. The sync that changes her home screen runs as a background task, so
    ET Ducky's time limit cannot cut it off; Get-KidTabletStatus.ps1 shows the sync log.

    Exit code 0 on success, 1 on failure.
#>

# ---- Settings ---------------------------------------------------------------
# Name, address (host and path, opened over https), the domains her browser may open for it, tile emoji and colour.
$Sites = @(
    @{ Name = 'Epic';             Address = 'www.getepic.com/';   Domains = @('getepic.com');            Icon = 'U+1F4DA'; Color = '#E8590C' }
    @{ Name = 'PBS KIDS Games';   Address = 'pbskids.org/games';  Domains = @('pbskids.org', 'pbs.org'); Icon = 'U+1F3AE'; Color = '#2F9E44' }
    @{ Name = 'AdaptedMind Math'; Address = 'www.adaptedmind.com'; Domains = @('adaptedmind.com');       Icon = 'U+1F522'; Color = '#1C7ED6' }
)
# Tiles to take off her home screen, with the domains only they used.
$Remove = @(
    @{ Name = 'Sesame Street'; Domains = @('sesamestreet.org') }
)
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
try { Set-ExecutionPolicy Bypass -Scope Process -Force } catch { }

try {
    $moduleFile = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet\KidTablet.psm1'
    if (-not (Test-Path $moduleFile)) { throw 'KidTablet is not installed on this device. Run Deploy-KidTablet.ps1 first.' }
    Import-Module $moduleFile -Force
    if (-not (Get-Command Start-KidBackgroundSync -ErrorAction SilentlyContinue)) { throw 'The tablet has an older KidTablet module. Run Update-KidTabletApps.ps1 first.' }

    $have = @(Get-KidApp | ForEach-Object { $_.Name })
    foreach ($r in $Remove) {
        if ($have -contains $r.Name) { Remove-KidApp -Name $r.Name -NoSync; Write-Host "Removed '$($r.Name)'." }
        if ($r.Domains) { Remove-KidAllowedDomain -Domain $r.Domains -NoSync }
    }
    foreach ($s in $Sites) {
        $url = 'https' + [char]58 + '//' + $s.Address
        Add-KidWebApp -Name $s.Name -Url $url -AllowDomain $s.Domains -Icon $s.Icon -Color $s.Color -NoSync
        Write-Host "Her tile '$($s.Name)' opens $url; allowed: $($s.Domains -join ', ')."
    }
    Start-KidBackgroundSync
    exit 0
} catch {
    Write-Error ("Setting her sites failed: {0}" -f $_.Exception.Message)
    exit 1
}
