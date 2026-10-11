<#
.SYNOPSIS
    Installs or updates the kid apps from a KidTablet-setup package. Run as SYSTEM from ET Ducky.

.DESCRIPTION
    Downloads the package zip (a GitHub zipball or any zip of the KidTablet-setup folder), checks its
    hash if one is given, and installs it with the package's own Install-KidApps.ps1, which also
    updates the module and rewrites each app's config.js from .env.

    Voice packs are kept: an app in the new package that has no pack gets the pack from the copy
    already on the tablet (the <script id="voicepack"> block, or apps\draw-with-me\voices.js), so
    pre-rendered prompts survive an update without rerunning make-voices.py.

    The package is unpacked to $StageDir (default C:\KidTablet-new\KidTablet-setup), replacing the
    previous copy, which is kept in C:\ProgramData\KidTablet\backup\package-<time>.zip.

    Exit code 0 on success, 1 on failure.
#>

# ---- Settings ---------------------------------------------------------------
$PackageUrl     = 'https://api.github.com/repos/trucule/KidTablet-setup/zipball/main'
$PackageToken   = ''        # GitHub fine-grained token with read access to that repo (private repo), else blank
$PackageSha256  = ''        # optional: refuse the download if its SHA256 differs
$StageDir       = 'C:\KidTablet-new\KidTablet-setup'
$RestartSession = $true     # sign her out and back in so the updated apps start now
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
try { Set-ExecutionPolicy Bypass -Scope Process -Force } catch { }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-VoicePack([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    $t = [IO.File]::ReadAllText($path)
    if ($t -notmatch 'window\.VOICE_PACK = \{') { return $null }
    if ($path -like '*.js') { return $t }
    $m = [regex]::Match($t, '<script id="voicepack">.*?</script>', 'Singleline')
    if ($m.Success) { return $m.Value } else { return $null }
}
function Set-VoicePack([string]$path, [string]$pack) {
    $t = [IO.File]::ReadAllText($path)
    if ($path -like '*.js') { [IO.File]::WriteAllText($path, $pack, (New-Object Text.UTF8Encoding $false)); return }
    $m = [regex]::Match($t, '<script id="voicepack">.*?</script>', 'Singleline')
    if (-not $m.Success) { return }
    $t = $t.Substring(0, $m.Index) + $pack + $t.Substring($m.Index + $m.Length)
    [IO.File]::WriteAllText($path, $t, (New-Object Text.UTF8Encoding $false))
}

try {
    $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Not elevated. Run as SYSTEM (leave "Run as logged in user" unchecked) or as an administrator.'
    }
    $moduleFile = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet\KidTablet.psm1'
    if (-not (Test-Path $moduleFile)) { throw 'KidTablet is not installed on this device. Run Deploy-KidTablet.ps1 first.' }

    $work = Join-Path $env:ProgramData 'KidTablet\packages'
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    $zip = Join-Path $work 'package.zip'
    $headers = @{ 'User-Agent' = 'KidTablet' }
    if ($PackageToken) { $headers['Authorization'] = "Bearer $PackageToken" }
    Write-Host "Downloading $PackageUrl"
    Invoke-WebRequest -Uri $PackageUrl -Headers $headers -OutFile $zip -UseBasicParsing
    $hash = (Get-FileHash $zip -Algorithm SHA256).Hash
    Write-Host ("Package SHA256 {0} ({1:N0} bytes)" -f $hash, (Get-Item $zip).Length)
    if ($PackageSha256 -and $hash -ne $PackageSha256.ToUpper()) { throw "Package hash $hash does not match the expected $PackageSha256. Not installing." }

    $extract = Join-Path $work 'extract'
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
    $installer = Get-ChildItem $extract -Recurse -Filter 'Install-KidApps.ps1' | Select-Object -First 1
    if (-not $installer) { throw 'The package has no Install-KidApps.ps1. Is this a KidTablet-setup zip?' }
    $src = $installer.DirectoryName

    # Carry the voice packs over from the copy already on the tablet.
    if (Test-Path $StageDir) {
        $carried = @()
        foreach ($rel in @('apps\draw-with-me\voices.js') + @(Get-ChildItem (Join-Path $src 'apps') -Recurse -Filter *.html | ForEach-Object { $_.FullName.Substring($src.Length + 1) })) {
            $new = Join-Path $src $rel; $old = Join-Path $StageDir $rel
            if (-not (Test-Path -LiteralPath $new)) { continue }
            if (Get-VoicePack $new) { continue }                       # the package already has a pack
            $pack = Get-VoicePack $old
            if ($pack) { Set-VoicePack $new $pack; $carried += (Split-Path $rel -Leaf) }
        }
        Write-Host ('Voice packs carried over: ' + $(if ($carried) { $carried -join ', ' } else { 'none needed' }))
        $backupDir = Join-Path $env:ProgramData 'KidTablet\backup'
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        $backup = Join-Path $backupDir ('package-{0}.zip' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
        Compress-Archive -Path (Join-Path $StageDir '*') -DestinationPath $backup -Force
        Write-Host "Previous package saved to $backup"
        Remove-Item $StageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $StageDir -Force | Out-Null
    Copy-Item (Join-Path $src '*') $StageDir -Recurse -Force
    Remove-Item $extract -Recurse -Force

    Push-Location $StageDir
    try {
        $global:LASTEXITCODE = 0
        if ($RestartSession) { & (Join-Path $StageDir 'Install-KidApps.ps1') }
        else { & (Join-Path $StageDir 'Install-KidApps.ps1') -SkipRestart }
    } finally { Pop-Location }
    Write-Host ('Module now: {0}' -f (Get-FileHash $moduleFile).Hash)
    exit 0
} catch {
    Write-Error ("KidTablet app update failed: {0}`r`nWhere: {1}" -f $_.Exception.Message, $_.ScriptStackTrace)
    exit 1
}
