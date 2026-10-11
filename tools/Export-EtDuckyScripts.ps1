<#
.SYNOPSIS
    Writes the ET Ducky scripts (Deploy, Update, Sync, Status) into a scripts repo folder.

.DESCRIPTION
    Update-KidTablet.ps1 is built from etducky\Update-KidTablet.template.ps1 with the current
    KidTablet.psm1 embedded; Deploy-KidTablet.ps1 is copied as is (it already embeds the module).
    Refuses to run if the Deploy/Reset embedded copies are out of date, so a stale module never
    reaches the tablet.

.EXAMPLE
    .\tools\Export-EtDuckyScripts.ps1 -Destination ..\scripts-me
#>
param([Parameter(Mandatory)][string]$Destination)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot

$global:LASTEXITCODE = 0
& (Join-Path $PSScriptRoot 'Test-KidTabletPackage.ps1')
if ($LASTEXITCODE) { throw 'Embedded module copies are out of date. Fix the package before exporting.' }

if (-not (Test-Path $Destination)) { throw "Destination not found: $Destination" }
$module   = (Get-Content -LiteralPath (Join-Path $root 'KidTablet.psm1') -Raw).TrimEnd("`r", "`n")
$template = Get-Content -LiteralPath (Join-Path $root 'etducky\Update-KidTablet.template.ps1') -Raw
if (-not $template.Contains("@'`n__MODULE__`n'@") -and -not $template.Contains("@'`r`n__MODULE__`r`n'@")) {
    throw 'Template is missing its __MODULE__ placeholder.'
}
$update = $template.Replace('__MODULE__', $module)

$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $Destination 'Update-KidTablet.ps1'), $update, $utf8)
Copy-Item (Join-Path $root 'Deploy-KidTablet.ps1')          (Join-Path $Destination 'Deploy-KidTablet.ps1') -Force
Copy-Item (Join-Path $root 'etducky\Sync-KidTablet.ps1')      (Join-Path $Destination 'Sync-KidTablet.ps1') -Force
Copy-Item (Join-Path $root 'etducky\Get-KidTabletStatus.ps1') (Join-Path $Destination 'Get-KidTabletStatus.ps1') -Force
Write-Host "Wrote Deploy-KidTablet.ps1, Update-KidTablet.ps1, Sync-KidTablet.ps1, Get-KidTabletStatus.ps1 to $Destination"
