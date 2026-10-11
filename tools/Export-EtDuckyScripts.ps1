<#
.SYNOPSIS
    Writes the ET Ducky scripts (Deploy, Update, Sync, Status, Update-Apps, Set-Voices) into a scripts repo folder.

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
Copy-Item (Join-Path $root 'etducky\Update-KidTabletApps.ps1') (Join-Path $Destination 'Update-KidTabletApps.ps1') -Force
Copy-Item (Join-Path $root 'etducky\Set-KidTabletVoices.ps1')  (Join-Path $Destination 'Set-KidTabletVoices.ps1') -Force
# Story Maker carried inside a script (small enough), with the voice pack kept on the tablet.
$smTemplate = Get-Content -LiteralPath (Join-Path $root 'etducky\Update-KidTabletStoryMaker.template.ps1') -Raw
$smIndex  = (Get-Content -LiteralPath (Join-Path $root 'apps\story-maker\index.html') -Raw).TrimEnd("`r", "`n")
$smVoices = (Get-Content -LiteralPath (Join-Path $root 'apps\story-maker\voices.js') -Raw).TrimEnd("`r", "`n")
if ($smIndex -match "(?m)^'@" -or $smVoices -match "(?m)^'@") { throw "A Story Maker file has a line starting with '@, which ends a here-string." }
[IO.File]::WriteAllText((Join-Path $Destination 'Update-KidTabletStoryMaker.ps1'), $smTemplate.Replace('__INDEX__', $smIndex).Replace('__VOICES__', $smVoices), $utf8)
Write-Host "Wrote Deploy, Update, Sync, Get-KidTabletStatus, Update-KidTabletApps, Update-KidTabletStoryMaker and Set-KidTabletVoices scripts to $Destination"
