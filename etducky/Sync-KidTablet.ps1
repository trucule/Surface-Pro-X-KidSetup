<#
.SYNOPSIS
    Re-applies the installed KidTablet configuration. Run as SYSTEM from ET Ducky.

.DESCRIPTION
    Runs Sync-KidTablet from the installed module: rebuilds the home screen if its source changed,
    Edge policies, shortcuts and the kiosk profile from C:\ProgramData\KidTablet\config.json.
    Use it after changing config.json or when the home screen looks out of date. It does not
    change the module; Update-KidTablet.ps1 does that.

    Exit code 0 on success, 1 on failure.
#>

# ---- Settings ---------------------------------------------------------------
$RestartSession = $true     # sign her out and back in so changes apply now
$RefreshIcons   = $false    # re-render every tile image
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
try { Set-ExecutionPolicy Bypass -Scope Process -Force } catch { }

try {
    $moduleFile = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet\KidTablet.psm1'
    if (-not (Test-Path $moduleFile)) { throw 'KidTablet is not installed on this device. Run Deploy-KidTablet.ps1 first.' }
    Import-Module $moduleFile -Force
    Sync-KidTablet -RestartSession:$RestartSession -RefreshIcons:$RefreshIcons
    exit 0
} catch {
    Write-Error ("KidTablet sync failed: {0}`r`nWhere: {1}" -f $_.Exception.Message, $_.ScriptStackTrace)
    exit 1
}
