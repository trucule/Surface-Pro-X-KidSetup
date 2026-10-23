#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Adds all the kid apps (see the $apps table below) to the kid tablet, or updates them,
    sets the tile images, and restarts her session. Run from this folder after Setup/Deploy.
.DESCRIPTION
    Before touching the tablet it checks the package itself:
      - the module copies embedded in Deploy/Reset match KidTablet.psm1 (tools\Test-KidTabletPackage.ps1),
      - apps\draw-with-me\library.js exists and parses to a non-empty lesson list.
    Either failure stops the install, so a bad package never replaces a working one.
.PARAMETER SkipRestart
    Install everything but leave her session alone (handy while she is using the tablet).
#>
param([switch]$SkipRestart)
$ErrorActionPreference = 'Stop'
Set-ExecutionPolicy Bypass -Scope Process -Force
$here = $PSScriptRoot

# --- Pre-flight: refuse to install a package that is inconsistent with itself ---------------------
$global:LASTEXITCODE = 0
& (Join-Path $here 'tools\Test-KidTabletPackage.ps1')
if ($LASTEXITCODE) { throw 'Embedded module copies are out of date. Fix the package before installing.' }

$libraryPath = Join-Path $here 'apps\draw-with-me\library.js'
if (-not (Test-Path $libraryPath)) { throw "Draw With Me library missing: $libraryPath" }
$libraryText = Get-Content -LiteralPath $libraryPath -Raw
$start = $libraryText.IndexOf('['); $end = $libraryText.LastIndexOf(']')
$lessons = $libraryText.Substring($start, $end - $start + 1) | ConvertFrom-Json
if (-not $lessons -or $lessons.Count -lt 1) { throw 'Draw With Me library.js parsed to no lessons. Not installing.' }
$simple = @($lessons | Where-Object { $_.style -eq 'simple' }).Count
Write-Host ("Draw With Me library: {0} lessons ({1} simple, {2} detailed)" -f $lessons.Count, $simple, ($lessons.Count - $simple))

# Voice packs are optional; say which apps have one so a missing pack is noticed, not discovered on the tablet.
$packed = @(Get-ChildItem (Join-Path $here 'apps') -Recurse -Include *.html, voices.js | Where-Object { (Get-Content -LiteralPath $_.FullName -Raw) -match 'window\.VOICE_PACK = \{' } | ForEach-Object { $_.Name })
Write-Host ("Voice packs: " + $(if ($packed) { $packed -join ', ' } else { 'none (Windows voice will be used; see voices\README.md)' }))

# --- Module -----------------------------------------------------------------------------------------
$installed = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet\KidTablet.psm1'
Copy-Item (Join-Path $here 'KidTablet.psm1') $installed -Force
Import-Module (Split-Path $installed) -Force

# --- Apps -------------------------------------------------------------------------------------------
# Name, source (file or folder with index.html), tile image, tile colour. Folder apps keep their files next to index.html.
$apps = @(
    @{ Name = 'Kitchen Lab';   Path = 'apps\kitchen-lab.html';   Tile = $null;                          Color = $null }
    @{ Name = 'Chemistry Lab'; Path = 'apps\chemistry-lab.html'; Tile = $null;                          Color = $null }
    @{ Name = 'Draw With Me';  Path = 'apps\draw-with-me';       Tile = 'apps\draw-with-me-tile.png';   Color = '#FF4F8B' }
    @{ Name = 'Trace With Me'; Path = 'apps\trace-with-me.html'; Tile = 'apps\trace-with-me-tile.png';  Color = '#9B6BFF' }
    @{ Name = 'Count With Me'; Path = 'apps\count-with-me.html'; Tile = 'apps\count-with-me-tile.png';  Color = '#58C7F0' }
    @{ Name = 'Music Box';     Path = 'apps\music-box.html';     Tile = 'apps\music-box-tile.png';      Color = '#2B2140' }
    @{ Name = 'Story Maker';   Path = 'apps\story-maker';        Tile = 'apps\story-maker-tile.png';    Color = '#5CD38B' }
    @{ Name = 'Playground Lab'; Path = 'apps\playground-lab.html'; Tile = 'apps\playground-lab-tile.png'; Color = '#58C7F0' }
    @{ Name = 'Level Up';      Path = 'apps\level-up.html';      Tile = 'apps\level-up-tile.png';       Color = '#FF8A5B' }
    @{ Name = 'Voice Band';    Path = 'apps\voice-band.html';    Tile = 'apps\voice-band-tile.png';     Color = '#9B6BFF' }
    @{ Name = 'Camera Fun';    Path = 'apps\camera-fun';        Tile = 'apps\camera-fun-tile.png';     Color = '#3BA8FF' }
)
foreach ($app in $apps) {
    $src = Join-Path $here $app.Path
    if (-not (Test-Path $src)) { throw "App source missing: $src" }
    Add-KidLocalApp -Name $app.Name -Path $src -NoSync
    if ($app.Tile) { Set-KidApp -Name $app.Name -Image (Join-Path $here $app.Tile) -Color $app.Color -NoSync }   # one sync at the end
    Write-Host ("  installed {0}" -f $app.Name)
}

if ($SkipRestart) { Sync-KidTablet; Write-Host 'Done. Apps updated; her session was left running (they load on next launch).' }
else { Sync-KidTablet -RestartSession; Write-Host ('Done: ' + (($apps | ForEach-Object { $_.Name }) -join ', ') + ' are on her home screen.') }
