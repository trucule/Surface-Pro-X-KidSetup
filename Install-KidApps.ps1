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
    @{ Name = 'Kitchen Lab';   Path = 'apps\kitchen-lab.html';   Tile = 'apps\tiles\Kitchen Lab.png';   Color = '#FF7A3D' }
    @{ Name = 'Chemistry Lab'; Path = 'apps\chemistry-lab.html'; Tile = 'apps\tiles\Chemistry Lab.png'; Color = '#0C8599' }
    @{ Name = 'Draw With Me';  Path = 'apps\draw-with-me';       Tile = 'apps\draw-with-me-tile.png';   Color = '#FF4F8B' }
    @{ Name = 'Trace With Me'; Path = 'apps\trace-with-me.html'; Tile = 'apps\trace-with-me-tile.png';  Color = '#9B6BFF' }
    @{ Name = 'Count With Me'; Path = 'apps\count-with-me.html'; Tile = 'apps\count-with-me-tile.png';  Color = '#58C7F0' }
    @{ Name = 'Music Box';     Path = 'apps\music-box.html';     Tile = 'apps\music-box-tile.png';      Color = '#2B2140' }
    @{ Name = 'Story Maker';   Path = 'apps\story-maker';        Tile = 'apps\story-maker-tile.png';    Color = '#5CD38B' }
    @{ Name = 'Playground Lab'; Path = 'apps\playground-lab.html'; Tile = 'apps\playground-lab-tile.png'; Color = '#58C7F0' }
    @{ Name = 'Level Up';      Path = 'apps\level-up.html';      Tile = 'apps\level-up-tile.png';       Color = '#FF8A5B' }
    @{ Name = 'Voice Band';    Path = 'apps\voice-band.html';    Tile = 'apps\voice-band-tile.png';     Color = '#9B6BFF' }
    @{ Name = 'Camera Fun';    Path = 'apps\camera-fun';        Tile = 'apps\camera-fun-tile.png';     Color = '#3BA8FF' }
    @{ Name = 'Robot Path'; Path = 'apps\robot-path.html'; Tile = 'apps\robot-path-tile.png'; Color = '#5CD38B' }
    @{ Name = 'Light Bridge'; Path = 'apps\light-bridge.html'; Tile = 'apps\light-bridge-tile.png'; Color = '#9B6BFF' }
    @{ Name = 'Pattern Machine'; Path = 'apps\pattern-machine.html'; Tile = 'apps\pattern-machine-tile.png'; Color = '#FF4F8B' }
    @{ Name = 'Fraction Pizza'; Path = 'apps\fraction-pizza.html'; Tile = 'apps\fraction-pizza-tile.png'; Color = '#FF7A1A' }
    @{ Name = 'Tangram City'; Path = 'apps\tangram-city.html'; Tile = 'apps\tangram-city-tile.png'; Color = '#4660FF' }
    @{ Name = 'Number Line Rocket'; Path = 'apps\number-line-rocket.html'; Tile = 'apps\number-line-rocket-tile.png'; Color = '#6A1BFF' }
    @{ Name = 'Circuit Lab'; Path = 'apps\circuit-lab.html'; Tile = 'apps\circuit-lab-tile.png'; Color = '#FF9F1C' }
    @{ Name = 'Ecosystem Aquarium'; Path = 'apps\ecosystem-aquarium.html'; Tile = 'apps\ecosystem-aquarium-tile.png'; Color = '#2EC4D6' }
    @{ Name = 'Planet Explorer'; Path = 'apps\planet-explorer.html'; Tile = 'apps\planet-explorer-tile.png'; Color = '#7A4DFF' }
    @{ Name = 'Word Wizard'; Path = 'apps\word-wizard.html'; Tile = 'apps\word-wizard-tile.png'; Color = '#8A3FFC' }
    @{ Name = 'Read It Say It Make It'; Path = 'apps\read-it-say-it'; Tile = 'apps\read-it-say-it-tile.png'; Color = '#13C95A' }
    @{ Name = 'Simon Orchestra'; Path = 'apps\simon-orchestra.html'; Tile = 'apps\simon-orchestra-tile.png'; Color = '#FF7A00' }
)
# Retired tiles: removed from a tablet that still has them, with the sites only they used.
$retired = @(@{ Name = 'Kid Pix'; Domains = @('kidpix.app') })
foreach ($r in $retired) {
    try { Remove-KidApp -Name $r.Name -NoSync; Write-Host ("  removed {0}" -f $r.Name) } catch { }   # already gone
    Remove-KidAllowedDomain -Domain $r.Domains -NoSync
}
foreach ($app in $apps) {
    $src = Join-Path $here $app.Path
    if (-not (Test-Path $src)) { throw "App source missing: $src" }
    Add-KidLocalApp -Name $app.Name -Path $src -NoSync
    if ($app.Tile) { Set-KidApp -Name $app.Name -Image (Join-Path $here $app.Tile) -Color $app.Color -NoSync }   # one sync at the end
    Write-Host ("  installed {0}" -f $app.Name)
}

# Tile art for apps added on the tablet itself (a website tile, say): apps\tiles\<app name>.png is used when an app
# with that name is on her home screen.
$names = @(Get-KidApp | ForEach-Object { $_.Name })
foreach ($png in Get-ChildItem (Join-Path $here 'apps\tiles') -Filter *.png -ErrorAction SilentlyContinue) {
    $n = $png.BaseName
    if ($names -contains $n -and -not ($apps | Where-Object { $_.Name -eq $n })) {
        try { Set-KidApp -Name $n -Image $png.FullName -NoSync; Write-Host ("  tile art for {0}" -f $n) } catch { Write-Warning ("Tile art for {0}: {1}" -f $n, $_.Exception.Message) }
    }
}

if ($SkipRestart) { Sync-KidTablet; Write-Host 'Done. Apps updated; her session was left running (they load on next launch).' }
else { Sync-KidTablet -RestartSession; Write-Host ('Done: ' + (($apps | ForEach-Object { $_.Name }) -join ', ') + ' are on her home screen.') }
# The narrator voice the games use (Azure kid voice from the .env, or the Windows voice).
$nv = Get-KidNarratorVoice
Write-Host $(if ($nv) { "Narrator voice: Azure $($nv.Voice) ($($nv.Region))" } else { 'Narrator voice: Windows voice (add TTS_KEY and TTS_REGION for Azure to the .env)' })
