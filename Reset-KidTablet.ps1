#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Resets the kid tablet to a clean slate and rebuilds it.

.DESCRIPTION
    Run locally on the tablet from an elevated PowerShell signed in as your admin
    account. Not as SYSTEM, not over WinRM: Store installs through winget need an
    interactive admin session.

    0. Reads her current config and discovers Store apps you installed that aren't in it yet.
    1. Signs her out and backs up her saved files to C:\KidTabletBackup\<timestamp>.
    2. Removes the kiosk config, scheduled tasks, home screen, shortcuts, and auto sign-in.
    3. Removes those Store apps from every account and from provisioning.
    4. Deletes her account and profile.
    5. Creates a fresh account, restores her apps, tiles, and settings, fetches icons.
    6. Queues the Store apps for her account and pauses the kiosk. At her next sign-in
       they install into her account (Store licenses are per account), then tiles are
       added and the kiosk is restored automatically.
    7. Prints a status table. Reboot when it finishes.

    Tux Paint: install it for all users before running, or put its installer next to
    this script and the reset will launch it (choose "all users" when asked).
#>

# ---- Settings ---------------------------------------------------------------
# Leave blank to keep what her current config uses.
$UserName = ''             # defaults to the current account name, or 'Kid'
$FullName = ''             # her name on the home screen greeting

# Extra Store apps to include beyond what is found on the tablet. Usually empty.
# Id is optional: when blank, the Store ID is looked up from the package family name.
# Example: @{ Name = 'Some App'; Pfn = 'Publisher.App_abcdefghijklm'; Id = '' }
$ExtraStoreApps = @(
    @{ Name = 'Kids Games Learning Science'; Pfn = 'greysprings.KidsLearningScienceGames_p4xj81aw0mjbg';             Id = '9NBLGGH68DHJ' }
    @{ Name = 'Learn to Write';              Pfn = 'greysprings.KidsLearntoWrite_p4xj81aw0mjbg';                     Id = '9NL4MGG11RB6' }
    @{ Name = 'Kindergarten Kids Learning';  Pfn = 'greysprings.kindergarten8lite_p4xj81aw0mjbg';                    Id = '9WZDNCRFJ1CG' }
    @{ Name = 'Master of Typing';            Pfn = 'ImprovisionLLC.MasterofTypingforKids-Learntotype_6ab774x3x8cty'; Id = '9P34VVTST1JM' }
    @{ Name = 'Scratch 3';                   Pfn = 'ScratchFoundation.ScratchDesktop_wmbdy4q6dbx4t';                 Id = '' }
)
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
try { Set-ExecutionPolicy Bypass -Scope Process -Force } catch { }

function Step([string]$Text) { Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan }

if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq 'S-1-5-18') {
    throw 'Run this from an elevated PowerShell signed in as your admin account, not as SYSTEM.'
}
if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) {
    throw 'Run this in 64-bit PowerShell.'
}

# ---- Module -----------------------------------------------------------------
Step 'Installing the KidTablet module'
$moduleDir  = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet'
$moduleFile = Join-Path $moduleDir 'KidTablet.psm1'
New-Item -ItemType Directory -Path $moduleDir -Force | Out-Null
$module = @'
#Requires -Version 5.1
<#
    KidTablet module

    All state lives in C:\ProgramData\KidTablet\config.json. Every Add/Remove
    command edits the config and then runs Sync-KidTablet, which rebuilds the
    Start shortcuts, the child's Edge policies, and the Assigned Access kiosk
    profile from that file. Works from an elevated admin session or as SYSTEM
    (for example, an RMM agent's remote shell).
#>

$script:ModuleFile  = $PSCommandPath
$script:DataDir     = Join-Path $env:ProgramData 'KidTablet'
$script:ConfigPath  = Join-Path $script:DataDir 'config.json'
$script:XmlPath     = Join-Path $script:DataDir 'AssignedAccess.xml'
$script:LogPath     = Join-Path $script:DataDir 'kiosk-apply.log'
$script:ShortcutDir = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Kid Apps'
$script:WinlogonKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
$script:ProfileId   = '{5D3C1E7A-8B2F-4C6D-9E1A-7F4B2C8D6A10}'
$script:HiveName    = 'KidTabletHive'
$script:InstalledModule = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet\KidTablet.psm1'
$script:LogonTask   = 'KidTablet-UserSettings'
$script:AutoAddTask = 'KidTablet-AutoAdd'
$script:EventSource = 'KidTablet'
$script:StoreInstallTask = 'KidTablet-StoreInstall'
$script:StoreFinishTask  = 'KidTablet-StoreFinish'
$script:HomeDir     = Join-Path $env:ProgramFiles 'KidTablet'
$script:HomeExe     = Join-Path $script:HomeDir 'KidHome.exe'
$script:HomeTsv     = Join-Path $script:HomeDir 'launcher.tsv'
$script:IconDir     = Join-Path $script:HomeDir 'icons'
$script:BackgroundDir = Join-Path $script:HomeDir 'background'
# Offline HTML apps. No spaces in the path keeps the Edge allowlist pattern simple.
$script:LocalAppsDir     = 'C:\KidTabletApps'
$script:LocalAppsPattern = 'file:///C:/KidTabletApps/'
$script:StoreQueueFile = Join-Path $script:HomeDir 'store-queue.json'   # readable by her account

# Tile look for known apps. Icons are code points so this file stays ASCII.
$script:TileDefaults = @{
    'Teach Your Monster to Read' = @{ Icon = 0x1F47E; Color = '#7048E8' }
    'Starfall'                   = @{ Icon = 0x2B50;  Color = '#F08C00' }
    'AdaptedMind Math'           = @{ Icon = 0x1F522; Color = '#1C7ED6' }
    'PBS KIDS Games'             = @{ Icon = 0x1F3AE; Color = '#2F9E44' }
    'PhET Science'               = @{ Icon = 0x1F52C; Color = '#0C8599' }
    'Chrome Music Lab'           = @{ Icon = 0x1F3B5; Color = '#D6336C' }
    'Kid Pix'                    = @{ Icon = 0x1F58D; Color = '#F03E3E' }
    'Kleki Paint'                = @{ Icon = 0x1F58A; Color = '#AE3EC9' }
    'Kids Typing Zoo'            = @{ Icon = 0x2328;  Color = '#2B8A3E' }
    'Kitchen Lab'                = @{ Icon = 0x1F9EA; Color = '#FF7A3D' }
    'Tux Paint'                  = @{ Icon = 0x1F3A8; Color = '#E8590C'; Arguments = '--fullscreen --native' }
    'Paint'                      = @{ Icon = 0x1F58C; Color = '#C2255C' }
    'Camera'                     = @{ Icon = 0x1F4F7; Color = '#495057' }
    'Photos'                     = @{ Icon = 0x1F5BC; Color = '#3B5BDB' }
}
$script:Palette = '#1C7ED6', '#2F9E44', '#E8590C', '#7048E8', '#D6336C', '#0C8599', '#F08C00', '#3B5BDB'

# ---------------------------------------------------------------------------
# Defaults (used only when no config exists, or with -ResetConfig)
# ---------------------------------------------------------------------------

function New-DefaultConfig {
    param([string]$UserName, [int]$TextScalePercent, [bool]$AllowAllWebsites)
    [pscustomobject]@{
        UserName         = $UserName
        TextScalePercent = $TextScalePercent
        AllowAllWebsites = $AllowAllWebsites
        WebApps          = @(
            [pscustomobject]@{ Name = 'Teach Your Monster to Read'; Url = 'https://www.teachyourmonstertoread.com' }
            [pscustomobject]@{ Name = 'Starfall';                   Url = 'https://www.starfall.com' }
            [pscustomobject]@{ Name = 'AdaptedMind Math';           Url = 'https://www.adaptedmind.com' }
            [pscustomobject]@{ Name = 'PBS KIDS Games';             Url = 'https://pbskids.org/games' }
            [pscustomobject]@{ Name = 'PhET Science';               Url = 'https://phet.colorado.edu/en/simulations/browse' }
            [pscustomobject]@{ Name = 'Chrome Music Lab';           Url = 'https://musiclab.chromeexperiments.com' }
            [pscustomobject]@{ Name = 'Kid Pix';                    Url = 'https://kidpix.app' }
            [pscustomobject]@{ Name = 'Kleki Paint';                Url = 'https://kleki.com' }
        )
        AllowedDomains   = @(
            'teachyourmonstertoread.com', 'teachyourmonster.org', 'starfall.com', 'adaptedmind.com',
            'pbskids.org', 'pbs.org', 'phet.colorado.edu', 'musiclab.chromeexperiments.com',
            'kidpix.app', 'kleki.com'
        )
        DesktopApps      = @(
            [pscustomobject]@{ Name = 'Tux Paint'; WingetId = 'NewBreedSoftware.TuxPaint'; ExeName = 'tuxpaint.exe'; Path = $null }
        )
        PackagedApps     = @(
            [pscustomobject]@{ Name = 'Paint';  Aumid = 'Microsoft.Paint_8wekyb3d8bbwe!App' }
        )
    }
}

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

function Test-IsSystem {
    [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq 'S-1-5-18'
}

function Assert-Elevated {
    $p = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this as an administrator or as SYSTEM.'
    }
}

function Assert-KioskSupported {
    $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    if ($cv.EditionID -like 'Core*') {
        throw "Windows $($cv.EditionID) (Home) does not support multi-app kiosk. Pro, Enterprise, or Education is required."
    }
    if ([int]$cv.CurrentBuildNumber -lt 22621) {
        throw "Build $($cv.CurrentBuildNumber) is too old. Windows 11 22H2 (22621) or later is required."
    }
}

function Assert-SafeName {
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name) -or $Name.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0) {
        throw "Invalid app name '$Name'. Names become shortcut file names."
    }
}

function Set-LockedDirAcl {
    # Replaces a folder's DACL with explicit rules (SID, rights) and makes Administrators the owner.
    # Writes only the Access and Owner sections: PowerShell's Set-Acl with a freshly built
    # DirectorySecurity also writes the audit (SACL) section, which needs SeSecurityPrivilege, and
    # the ET Ducky agent's SYSTEM token does not hold it (an interactive admin does, which is why
    # the installer worked at the tablet but not from the dashboard).
    param([string]$Path, [object[]]$Rules)
    $sections = [System.Security.AccessControl.AccessControlSections]'Access, Owner'
    $acl = [System.IO.Directory]::GetAccessControl($Path, $sections)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($r in @($acl.GetAccessRules($true, $false, [System.Security.Principal.SecurityIdentifier]))) { [void]$acl.RemoveAccessRuleAll($r) }
    $inherit = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    $none = [System.Security.AccessControl.PropagationFlags]::None
    foreach ($pair in $Rules) {
        $id = New-Object System.Security.Principal.SecurityIdentifier $pair[0]
        $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($id, $pair[1], $inherit, $none, 'Allow')))
    }
    try {
        $acl.SetOwner((New-Object System.Security.Principal.SecurityIdentifier 'S-1-5-32-544'))
        [System.IO.Directory]::SetAccessControl($Path, $acl)
    } catch {
        # A token that may not take ownership (a restricted service account) still gets the DACL.
        $acl = [System.IO.Directory]::GetAccessControl($Path, [System.Security.AccessControl.AccessControlSections]::Access)
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($r in @($acl.GetAccessRules($true, $false, [System.Security.Principal.SecurityIdentifier]))) { [void]$acl.RemoveAccessRuleAll($r) }
        foreach ($pair in $Rules) {
            $id = New-Object System.Security.Principal.SecurityIdentifier $pair[0]
            $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($id, $pair[1], $inherit, $none, 'Allow')))
        }
        [System.IO.Directory]::SetAccessControl($Path, $acl)
    }
}

function Initialize-DataDir {
    # SYSTEM and Administrators only. SYSTEM reads this folder, so the child
    # account must not be able to write to it.
    New-Item -ItemType Directory -Path $script:DataDir -Force | Out-Null
    Set-LockedDirAcl $script:DataDir @(@('S-1-5-18', 'FullControl'), @('S-1-5-32-544', 'FullControl'))
    # Leftover from the first version of the setup script.
    Remove-Item (Join-Path $script:DataDir 'Apply-AssignedAccess.ps1') -Force -ErrorAction SilentlyContinue
}

function Read-Config {
    if (-not (Test-Path $script:ConfigPath)) {
        throw 'KidTablet is not installed on this device. Run Setup-KidTablet.ps1 first.'
    }
    $c = Get-Content $script:ConfigPath -Raw | ConvertFrom-Json
    Initialize-Prop $c 'IgnoredApps' @()
    Initialize-Prop $c 'ActiveTargets' @()
    Initialize-Prop $c 'NotifiedPending' @()
    Initialize-Prop $c 'AutoAdd' $true
    Initialize-Prop $c 'AutoAddCategories' @('Kids*family', 'Education')
    Initialize-Prop $c 'AutoAddMaxAge' 7
    Initialize-Prop $c 'StoreQueue' @()
    Initialize-Prop $c 'StoreInstallStarted' ''
    Initialize-Prop $c 'Background' ''
    Initialize-Prop $c 'AllowCameraMic' $true
    foreach ($p in 'WebApps', 'AllowedDomains', 'DesktopApps', 'PackagedApps', 'IgnoredApps',
                   'ActiveTargets', 'NotifiedPending', 'AutoAddCategories', 'StoreQueue') {
        $c.$p = @($c.$p | Where-Object { $_ })
    }
    # Fill tile properties missing from older or hand-edited configs.
    Initialize-Prop $c 'DisplayName' $c.UserName -FillEmpty
    Initialize-Prop $c 'ShowTaskbar' $false
    $i = 0
    foreach ($list in 'WebApps', 'DesktopApps', 'PackagedApps') {
        foreach ($app in $c.$list) {
            $d = $script:TileDefaults[$app.Name]
            $icon  = if ($d) { [char]::ConvertFromUtf32($d.Icon) } else { [char]::ConvertFromUtf32(0x2605) }
            $color = if ($d) { $d.Color } else { $script:Palette[$i % $script:Palette.Count] }
            Initialize-Prop $app 'Icon'  $icon  -FillEmpty
            Initialize-Prop $app 'Color' $color -FillEmpty
            if ($list -eq 'DesktopApps') {
                Initialize-Prop $app 'Arguments' $(if ($d -and $d.Arguments) { $d.Arguments } else { '' })
            }
            $i++
        }
    }
    $c
}

function Initialize-Prop {
    param($Obj, [string]$Name, $Value, [switch]$FillEmpty)
    $p = $Obj.PSObject.Properties[$Name]
    if (-not $p) { $Obj | Add-Member -NotePropertyName $Name -NotePropertyValue $Value }
    elseif ($FillEmpty -and [string]::IsNullOrEmpty([string]$p.Value)) { $p.Value = $Value }
}

function ConvertTo-KidIcon {
    # Accepts an emoji, or a code point like U+1F4DA / 0x1F4DA for shells that mangle emoji.
    param([string]$Icon)
    if ($Icon -match '^(U\+|0x)([0-9A-Fa-f]{4,6})$') { return [char]::ConvertFromUtf32([Convert]::ToInt32($Matches[2], 16)) }
    $Icon
}

function Assert-Color {
    param([string]$Color)
    if ($Color -and $Color -notmatch '^#[0-9A-Fa-f]{6}$') { throw "Color must look like #1C7ED6." }
}

function Write-Config {
    param($Config)
    $Config | ConvertTo-Json -Depth 5 | Set-Content -Path $script:ConfigPath -Encoding UTF8
}

function Set-RegValue {
    param([string]$Path, [string]$Name, $Value, [string]$Type = 'DWord')
    if (-not (Test-Path $Path)) { New-Item -Path $Path -Force -ErrorAction Stop | Out-Null }
    New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force -ErrorAction Stop | Out-Null
}

function Set-RegList {
    param([string]$Path, [string[]]$Values)
    if (Test-Path $Path) { Remove-Item -Path $Path -Recurse -Force }
    New-Item -Path $Path -Force | Out-Null
    $i = 1
    foreach ($v in $Values) { Set-RegValue -Path $Path -Name "$i" -Value $v -Type String; $i++ }
}

function Get-EdgePath {
    $p = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
           "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
         Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $p) { throw 'Microsoft Edge was not found.' }
    $p
}

function Find-Exe {
    param([string]$ExeName)
    foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Select-Object -Unique) {
        $hit = Get-ChildItem -Path $root -Filter $ExeName -File -Recurse -Depth 3 -ErrorAction SilentlyContinue |
               Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
}

function Resolve-KidPath {
    # A path as the person typing it means it: relative to PowerShell's current folder.
    # (.NET methods resolve relative paths against the process folder, often C:\Windows\System32.)
    param([string]$Path)
    if (-not $Path) { return $Path }
    $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Test-ProtectedPath {
    # Only allowlist executables the child account cannot overwrite.
    param([string]$Path)
    $full = Resolve-KidPath $Path
    foreach ($root in $env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:SystemRoot) {
        if ($root -and $full.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    $false
}

function Get-WingetPath {
    $cmd = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    # SYSTEM has no winget alias on PATH; use the App Installer package directly.
    Get-ChildItem "$env:ProgramFiles\WindowsApps" -Filter 'Microsoft.DesktopAppInstaller_*' -Directory -ErrorAction SilentlyContinue |
        Sort-Object { [version](($_.Name -split '_')[1]) } -Descending |
        ForEach-Object { Join-Path $_.FullName 'winget.exe' } |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1
}

function Invoke-Winget {
    param([string[]]$Arguments)
    $wg = Get-WingetPath
    if (-not $wg) { throw 'winget was not found on this device.' }
    & $wg @Arguments --accept-source-agreements | Out-Host
    $code = $LASTEXITCODE
    # 0x8A15002B: already installed, no applicable upgrade.
    if ($code -ne 0 -and $code -ne -1978335189) { throw "winget exited with $code." }
}

function Install-DesktopAppIfMissing {
    param($App)
    if ($App.Path -and (Test-Path $App.Path)) { return }
    $found = if ($App.ExeName) { Find-Exe $App.ExeName }
    if (-not $found -and $App.WingetId) {
        Write-Host "Installing $($App.Name) ($($App.WingetId))..."
        Invoke-Winget @('install', '--id', $App.WingetId, '-e', '--silent', '--scope', 'machine',
                        '--source', 'winget', '--accept-package-agreements')
        $found = Find-Exe $App.ExeName
    }
    if (-not $found) {
        throw "$($App.Name): $($App.ExeName) not found under Program Files after install. The package may not support machine scope."
    }
    $App.Path = $found
}

function Get-KidSid {
    param($Config)
    $u = Get-LocalUser -Name $Config.UserName -ErrorAction SilentlyContinue
    if (-not $u) { throw "Local account '$($Config.UserName)' does not exist." }
    $u.SID.Value
}

function Invoke-KidHive {
    # Runs $Script against the child's HKCU. Uses the live hive if she is
    # signed in, otherwise loads NTUSER.DAT temporarily.
    param($Config, [scriptblock]$Script)
    $sid  = Get-KidSid $Config
    $live = "Registry::HKEY_USERS\$sid"
    if (Test-Path $live) { & $Script $live $Config; return }

    $prof = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'"
    if (-not $prof) { Write-Warning "No profile for $($Config.UserName) yet. Per-user settings skipped."; return }

    & reg.exe load "HKU\$script:HiveName" (Join-Path $prof.LocalPath 'NTUSER.DAT') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not load the child registry hive.' }
    try {
        & $Script "Registry::HKEY_USERS\$script:HiveName" $Config
    } finally {
        [GC]::Collect(); [GC]::WaitForPendingFinalizers(); Start-Sleep -Seconds 1
        & reg.exe unload "HKU\$script:HiveName" | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning 'Child hive did not unload cleanly. It will release on reboot.' }
    }
}

function Set-KidKiosk {
    param([ValidateSet('apply', 'remove')][string]$Mode)
    if (Test-IsSystem) { Invoke-KidKioskApply -Mode $Mode; return }

    # The MDM WMI bridge only accepts SYSTEM. From an admin session, hop through a one-shot task.
    Remove-Item $script:LogPath -ErrorAction SilentlyContinue
    $taskName = 'KidTablet-Kiosk'
    # Any failure inside the task, including loading the module, is written to the log.
    $cmd = "try { Import-Module '$script:ModuleFile' -Force -ErrorAction Stop; Invoke-KidKioskApply -Mode $Mode } " +
           "catch { 'FAIL: ' + `$_.Exception.Message | Set-Content '$script:LogPath' }"
    $action    = New-ScheduledTaskAction -Execute 'powershell.exe' `
                   -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$cmd`""
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    # Task defaults refuse to start on battery, which silently blocks this on an unplugged tablet.
    $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                   -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
    $lastResult = $null
    try {
        Start-ScheduledTask -TaskName $taskName
        $deadline = (Get-Date).AddSeconds(180)
        while (-not (Test-Path $script:LogPath) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
        Start-Sleep -Seconds 1
        $lastResult = (Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue).LastTaskResult
    } finally {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    if (-not (Test-Path $script:LogPath)) {
        throw ("Timed out waiting for the kiosk task (last task result: 0x{0:X8})." -f [uint32]$lastResult)
    }
    $result = (Get-Content $script:LogPath -Raw).Trim()
    if ($result -ne 'OK') { throw "Kiosk $Mode failed. $result" }
}

function ConvertTo-XmlAttr { param([string]$s) [Security.SecurityElement]::Escape($s) }

function New-RandomPassword {
    $bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    ConvertTo-SecureString ([Convert]::ToBase64String($bytes) + 'a1!') -AsPlainText -Force
}

$script:KidHomeSource = @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

// Swallows touch gesture messages before they reach any window in the launcher.
class NoGestures : IMessageFilter
{
    const int WM_GESTURE = 0x0119, WM_GESTURENOTIFY = 0x011A;
    public bool PreFilterMessage(ref Message m) { return m.Msg == WM_GESTURE || m.Msg == WM_GESTURENOTIFY; }
}

static class Program
{
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [STAThread]
    static void Main()
    {
        bool created;
        using (var mutex = new Mutex(true, "KidTabletHome", out created))
        {
            if (!created)
            {
                // Already running: bring the existing home screen forward.
                var me = Process.GetCurrentProcess();
                foreach (var p in Process.GetProcessesByName(me.ProcessName))
                {
                    if (p.Id != me.Id && p.MainWindowHandle != IntPtr.Zero)
                    {
                        ShowWindow(p.MainWindowHandle, 9);
                        SetForegroundWindow(p.MainWindowHandle);
                    }
                }
                return;
            }
            SetProcessDPIAware();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            // Touch is handled directly as pointer input (see TileCanvas). Keep Windows' own
            // gesture handling out of every window here: it adds legacy panning that nudges the
            // whole window at the end of a list, flicks, and press-and-hold menus.
            Application.AddMessageFilter(new NoGestures());
            Application.Run(new HomeForm());
        }
    }
}

static class Native
{
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern bool ExitWindowsEx(uint uFlags, uint dwReason);
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr RegisterPowerSettingNotification(IntPtr hRecipient, ref Guid powerSettingGuid, int flags);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
}

[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IApplicationActivationManager
{
    [PreserveSig]
    int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
                            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
                            int options, out uint processId);
}

[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
class ApplicationActivationManager { }

class TileInfo
{
    public string Name;
    public string Icon;
    public Color Color;
    public string Target;
    public Image Image;       // app icon; null falls back to the emoji
    public bool Plate;        // draw the icon on a white plate (web and desktop icons)
    public Rectangle Bounds;  // position on the tile canvas
}

class HomeForm : Form
{
    readonly string configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launcher.tsv");
    readonly Panel viewport = new Panel();
    readonly TileCanvas canvas;
    readonly Label title = new Label();
    readonly Label clock = new Label();
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    readonly System.Windows.Forms.Timer windowTimer = new System.Windows.Forms.Timer();
    readonly HashSet<IntPtr> seenWindows = new HashSet<IntPtr>();
    readonly HomeButton homeButton;
    readonly List<Image> backgrounds = new List<Image>();
    int backgroundIndex;
    DateTime configStamp = DateTime.MinValue;
    float scale = 1f;
    int ticks;
    int pendingCount;
    bool relayingOut;

    public Image CurrentBackground
    {
        get { return backgrounds.Count > 0 ? backgrounds[backgroundIndex] : null; }
    }

    public HomeForm()
    {
        Text = "Home";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(24, 24, 37);
        ForeColor = Color.White;
        using (var g = CreateGraphics()) { scale = g.DpiX / 96f; }

        var header = new Panel();
        header.Dock = DockStyle.Top;
        header.Height = S(120);
        header.Padding = new Padding(S(56), S(28), S(56), 0);
        title.Font = new Font("Segoe UI Light", 34f);
        title.AutoSize = true;
        title.Dock = DockStyle.Left;
        clock.Font = new Font("Segoe UI Light", 30f);
        clock.AutoSize = true;
        clock.Dock = DockStyle.Right;
        header.Controls.Add(clock);
        header.Controls.Add(title);

        // One fixed surface the size of the screen. It holds the wallpaper and every tile,
        // pre-rendered, and scrolls by drawing that picture at an offset: nothing moves.
        canvas = new TileCanvas(this, S(280), S(210), S(48), S(16), S(48));
        homeButton = new HomeButton(this, scale);
        viewport.Dock = DockStyle.Fill;
        viewport.BackColor = BackColor;
        viewport.Controls.Add(canvas);
        viewport.Resize += (s, e) => LayoutViewport();

        Controls.Add(viewport);
        Controls.Add(header);

        timer.Interval = 1000;
        timer.Tick += (s, e) => Tick();
        timer.Start();
        windowTimer.Interval = 400;
        windowTimer.Tick += (s, e) => { MaximizeNewWindows(); UpdateHomeButton(); };
        windowTimer.Start();
        // Only the screen's working area matters here; ignore other settings broadcasts
        // (wallpaper slideshows, theme and color changes).
        SystemEvents.DisplaySettingsChanged += (s, e) => BeginInvoke((Action)FitToScreen);
        SystemEvents.UserPreferenceChanged += (s, e) =>
        {
            if (e.Category == UserPreferenceCategory.Desktop || e.Category == UserPreferenceCategory.Window)
                BeginInvoke((Action)FitToScreen);
        };

        FitToScreen();
        LoadTiles();
        Tick();
    }

    int S(int v) { return (int)(v * scale); }

    public float DpiScale { get { return scale; } }

    void FitToScreen()
    {
        // Working area leaves the taskbar visible when it's shown. No-op when unchanged.
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        if (Bounds != area) Bounds = area;
    }

    // The canvas always fills the viewport. Scrolling is by dragging the tiles.
    void LayoutViewport()
    {
        canvas.SetBounds(0, 0, viewport.ClientSize.Width, viewport.ClientSize.Height);
        Relayout();
    }

    void Relayout()
    {
        if (relayingOut) return;
        relayingOut = true;
        try
        {
            int width = Math.Max(1, viewport.ClientSize.Width);
            canvas.ContentHeight = Math.Max(viewport.ClientSize.Height, canvas.LayoutTiles(width));
        }
        finally { relayingOut = false; }
    }

    // Display on/off (GUID_CONSOLE_DISPLAY_STATE): data 0 = off, 1 = on, 2 = dimmed.
    static Guid DisplayState = new Guid("6fe69556-704a-47a0-8f24-c28d936fda47");
    const int WM_POWERBROADCAST = 0x0218, PBT_POWERSETTINGCHANGE = 0x8013, WM_CLOSE = 0x0010;
    readonly System.Windows.Forms.Timer sweepTimer = new System.Windows.Forms.Timer();
    readonly HashSet<int> closing = new HashSet<int>();

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try { Native.RegisterPowerSettingNotification(Handle, ref DisplayState, 0); } catch (Exception ex) { LogError("RegisterPowerSettingNotification: " + ex.Message); }
        sweepTimer.Interval = 3000;
        sweepTimer.Tick += (s, ev) => { sweepTimer.Stop(); ForceCloseApps(); ComeToFront(); };
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_POWERBROADCAST && (int)m.WParam == PBT_POWERSETTINGCHANGE && m.LParam != IntPtr.Zero)
        {
            // POWERBROADCAST_SETTING: Guid (16 bytes), DataLength (4), Data
            var g = (Guid)Marshal.PtrToStructure(m.LParam, typeof(Guid));
            if (g == DisplayState)
            {
                int state = Marshal.ReadInt32(m.LParam, 20);
                // Screen off: leave every app and go home. Screen on: finish the job (standby can
                // freeze apps before they close) and make sure the home screen is in front.
                if (state == 0 || state == 1) { CloseApps(); sweepTimer.Stop(); sweepTimer.Start(); if (state == 1) ComeToFront(); }
            }
        }
        base.WndProc(ref m);
    }

    // Shell parts that must never be closed.
    static readonly HashSet<string> ShellProcesses = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "explorer", "ShellExperienceHost", "StartMenuExperienceHost", "SearchHost", "SearchApp", "TextInputHost",
        "LockApp", "ShellHost", "TabTip", "SystemSettings", "ctfmon", "dwm", "csrss", "winlogon", "sihost", "taskhostw", "RuntimeBroker" };

    // Asks every app window in her session to close (like pressing its X).
    void CloseApps()
    {
        int me = Process.GetCurrentProcess().Id;
        int session = Process.GetCurrentProcess().SessionId;
        Native.EnumWindows((h, l) =>
        {
            if (h == Handle || !Native.IsWindowVisible(h) || Native.GetWindow(h, 4) != IntPtr.Zero) return true;   // owned = dialog of an app
            uint pid; Native.GetWindowThreadProcessId(h, out pid);
            if (pid == 0 || pid == me) return true;
            var cls = new StringBuilder(256); Native.GetClassName(h, cls, cls.Capacity);
            string c = cls.ToString();
            if (c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "Progman" || c == "WorkerW" || c == "Windows.UI.Core.CoreWindow") return true;
            string name;
            try { var p = Process.GetProcessById((int)pid); if (p.SessionId != session) return true; name = p.ProcessName; } catch (Exception) { return true; }
            bool storeApp = c == "ApplicationFrameWindow";                       // Store apps live in ApplicationFrameHost
            if (!storeApp && ShellProcesses.Contains(name)) return true;
            if (!storeApp && name.Equals("ApplicationFrameHost", StringComparison.OrdinalIgnoreCase)) return true;
            Native.PostMessage(h, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
            if (!storeApp) closing.Add((int)pid);
            return true;
        }, IntPtr.Zero);
    }

    // Anything that didn't close when asked (or was frozen by standby) is ended.
    void ForceCloseApps()
    {
        int session = Process.GetCurrentProcess().SessionId;
        var pids = new HashSet<int>(closing);
        closing.Clear();
        try { foreach (var p in Process.GetProcessesByName("msedge")) if (p.SessionId == session) pids.Add(p.Id); } catch (Exception) { }
        foreach (int pid in pids)
        {
            try { var p = Process.GetProcessById(pid); if (p.SessionId == session && !p.HasExited) p.Kill(); } catch (Exception) { }
        }
        CloseApps();    // Store app windows that are still there
        closing.Clear();
    }

    // The Home pill was tapped: leave every app and come back to the tiles, the same way the
    // screen-off handler does (ask politely, sweep whatever is stuck 3 seconds later).
    public void GoHome()
    {
        homeButton.Hide();
        CloseApps(); sweepTimer.Stop(); sweepTimer.Start(); ComeToFront();
    }

    // The pill shows while something other than the home screen is in front. Edge's own close
    // button is a small target at tablet DPI and often ignores the first taps after standby.
    void UpdateHomeButton()
    {
        IntPtr fg = Native.GetForegroundWindow();
        uint pid = 0;
        if (fg != IntPtr.Zero) Native.GetWindowThreadProcessId(fg, out pid);
        bool appInFront = fg != IntPtr.Zero && pid != 0 && pid != (uint)Process.GetCurrentProcess().Id && Native.IsWindowVisible(fg);
        if (appInFront)
        {
            var cls = new StringBuilder(256); Native.GetClassName(fg, cls, cls.Capacity);
            string c = cls.ToString();
            if (c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "Progman" || c == "WorkerW") appInFront = false;
        }
        if (appInFront) homeButton.ShowPinned(); else if (homeButton.Visible) homeButton.Hide();
    }

    void ComeToFront()
    {
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Show(); Activate(); Native.SetForegroundWindow(Handle);
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        FitToScreen();          // fill the whole screen once the window exists
        LayoutViewport();
        Activate();
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        base.OnMouseWheel(e);
        canvas.ScrollBy(-e.Delta);
    }

    void Tick()
    {
        clock.Text = DateTime.Now.ToString("h:mm");
        if (++ticks % 5 == 0) LoadTiles();
        if (ticks % 30 == 0) { WriteIdleStatus(); MaybeRefreshSession(); }
        if (ticks % 900 == 0 && backgrounds.Count > 1)        // rotate every 15 minutes
        {
            backgroundIndex = (backgroundIndex + 1) % backgrounds.Count;
            canvas.InvalidateCache();
        }
    }

    // Opens every new top-level app window maximized. Dialogs, tool windows, and
    // fixed-size or full-screen windows are left alone. Each window is handled once,
    // so a window she resizes is not forced back.
    void MaximizeNewWindows()
    {
        IntPtr h = Native.GetForegroundWindow();
        if (h == IntPtr.Zero || h == Handle || seenWindows.Contains(h)) return;
        if (!Native.IsWindowVisible(h) || Native.IsIconic(h)) return;   // not ready yet; check again next tick
        if (seenWindows.Count > 500) seenWindows.Clear();
        seenWindows.Add(h);

        if (Native.IsZoomed(h)) return;
        if (Native.GetWindow(h, 4) != IntPtr.Zero) return;               // GW_OWNER: dialog
        int style = Native.GetWindowLong(h, -16);                         // GWL_STYLE
        int exStyle = Native.GetWindowLong(h, -20);                       // GWL_EXSTYLE
        if ((style & 0x10000) == 0 || (style & 0x40000) == 0) return;     // WS_MAXIMIZEBOX, WS_THICKFRAME
        if ((exStyle & 0x80) != 0) return;                                // WS_EX_TOOLWINDOW
        var cls = new StringBuilder(256);
        Native.GetClassName(h, cls, cls.Capacity);
        string c = cls.ToString();
        if (c == "Shell_TrayWnd" || c == "Progman" || c == "WorkerW") return;
        Native.ShowWindow(h, 3);                                          // SW_MAXIMIZE
    }

    static uint IdleMs()
    {
        var lii = new Native.LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(lii);
        if (!Native.GetLastInputInfo(ref lii)) return 0;
        return unchecked((uint)Environment.TickCount - lii.dwTime);
    }

    static string DataDir()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KidTablet");
    }

    // Lets the tablet's SYSTEM tasks see whether she's using it (idle seconds; file time = freshness).
    static void WriteIdleStatus()
    {
        try
        {
            Directory.CreateDirectory(DataDir());
            File.WriteAllText(Path.Combine(DataDir(), "idle.txt"), (IdleMs() / 1000).ToString());
        }
        catch (Exception) { }
    }

    // New apps only work after a fresh sign-in. When tiles are waiting and she has
    // been idle on the home screen for two minutes, sign out; auto sign-in brings
    // her straight back. At most once every four hours, so a problem can't loop.
    void MaybeRefreshSession()
    {
        if (pendingCount == 0 || Native.GetForegroundWindow() != Handle) return;
        if (IdleMs() < 120000) return;

        string dir = DataDir();
        string stamp = Path.Combine(dir, "last-refresh.txt");
        try
        {
            if (File.Exists(stamp) && (DateTime.UtcNow - File.GetLastWriteTimeUtc(stamp)).TotalHours < 4) return;
            Directory.CreateDirectory(dir);
            File.WriteAllText(stamp, DateTime.UtcNow.ToString("o"));
        }
        catch (Exception) { return; }
        Native.ExitWindowsEx(0, 0);                                       // EWX_LOGOFF
    }

    static Color ParseColor(string s)
    {
        try { return ColorTranslator.FromHtml(s); }
        catch { return Color.FromArgb(28, 126, 214); }
    }

    static Image LoadImage(string path)
    {
        try
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return null;
            byte[] bytes = File.ReadAllBytes(path);     // read fully so the file isn't locked
            using (var ms = new MemoryStream(bytes))
            using (var img = Image.FromStream(ms))
                return new Bitmap(img);
        }
        catch (Exception) { return null; }
    }

    // Keeps memory in check for large theme images: scale to cover the screen, no larger.
    static Image Downscale(Image img, Size target)
    {
        float k = Math.Max(target.Width / (float)img.Width, target.Height / (float)img.Height);
        if (k >= 1f) return img;
        var bmp = new Bitmap(Math.Max(1, (int)(img.Width * k)), Math.Max(1, (int)(img.Height * k)));
        using (var g = Graphics.FromImage(bmp))
        {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.DrawImage(img, 0, 0, bmp.Width, bmp.Height);
        }
        img.Dispose();
        return bmp;
    }

    void LoadTiles()
    {
        try
        {
            var stamp = File.GetLastWriteTimeUtc(configPath);
            if (stamp == configStamp) return;
            var lines = File.ReadAllLines(configPath, Encoding.UTF8);
            configStamp = stamp;

            var list = new List<TileInfo>();
            var bgPaths = new List<string>();
            int pending = 0;
            foreach (var line in lines)
            {
                if (line.StartsWith("#title\t")) { title.Text = line.Substring(7); continue; }
                if (line.StartsWith("#background\t")) { bgPaths.Add(line.Substring(12)); continue; }
                if (line.StartsWith("#")) continue;
                var f = line.Split('\t');
                if (f.Length < 4) continue;
                if (f.Length > 4 && f[4] == "pending") { pending++; continue; }
                var t = new TileInfo();
                t.Name = f[0];
                t.Icon = f[1];
                t.Color = ParseColor(f[2]);
                t.Target = f[3];
                if (f.Length > 5) t.Image = LoadImage(f[5]);
                t.Plate = f.Length > 6 && f[6] == "plate";
                list.Add(t);
            }
            pendingCount = pending;

            foreach (var img in backgrounds) img.Dispose();
            backgrounds.Clear();
            Size screen = Screen.PrimaryScreen.Bounds.Size;
            foreach (var p in bgPaths)
            {
                Image img = LoadImage(p);
                if (img != null) backgrounds.Add(Downscale(img, screen));
            }
            if (backgroundIndex >= backgrounds.Count) backgroundIndex = 0;

            canvas.SetTiles(list);
            Relayout();
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    const string AppsFolderPrefix = "shell:AppsFolder\\";

    public void Launch(TileInfo t)
    {
        string error = null;

        // Store apps: activate by AUMID directly, the way Start does.
        if (t.Target.StartsWith(AppsFolderPrefix, StringComparison.OrdinalIgnoreCase))
        {
            string aumid = t.Target.Substring(AppsFolderPrefix.Length);
            try
            {
                var mgr = (IApplicationActivationManager)new ApplicationActivationManager();
                uint pid;
                int hr = mgr.ActivateApplication(aumid, null, 0, out pid);
                if (hr >= 0) return;
                error = "ActivateApplication " + aumid + " failed: 0x" + hr.ToString("X8");
            }
            catch (Exception ex)
            {
                error = "ActivateApplication " + aumid + " threw: " + ex.Message;
            }
        }

        // Shortcuts, and fallback for Store apps.
        try
        {
            var psi = new ProcessStartInfo(t.Target);
            psi.UseShellExecute = true;
            using (Process.Start(psi)) { }
            return;
        }
        catch (Exception ex)
        {
            error = (error == null ? "" : error + " | ") + "ShellExecute " + t.Target + " threw: " + ex.Message;
        }

        LogError(error);
        MessageBox.Show(this, "That app didn't open. Ask a grown-up for help.", "Oops");
    }

    static void LogError(string message)
    {
        try
        {
            Directory.CreateDirectory(DataDir());
            File.AppendAllText(Path.Combine(DataDir(), "launch.log"),
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + message + Environment.NewLine);
        }
        catch (Exception) { }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // Alt+F4 and similar: stay open. Sign-out and shutdown still close it.
        if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; return; }
        base.OnFormClosing(e);
    }
}

// The whole tile area as one control the size of the screen. Wallpaper and tiles are
// rendered once into a bitmap as tall as all the content; painting copies the visible
// slice of it (at the scroll offset) to the screen with one BitBlt. Scrolling changes
// the offset and asks for a repaint, so Windows paints the latest position once per
// frame. No window moves and no timer decides when the picture updates.
// A big Home pill pinned over the top-right corner of the screen, on top of an app window's own
// caption buttons, so one easy tap closes the app and no accidental tap minimizes it. It never
// takes focus (WS_EX_NOACTIVATE), so the app underneath keeps the keyboard until it closes.
class HomeButton : Form
{
    readonly HomeForm owner;
    readonly float scale;
    bool down;

    public HomeButton(HomeForm owner, float scale)
    {
        this.owner = owner;
        this.scale = scale;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(36, 36, 56);
        DoubleBuffered = true;
        Cursor = Cursors.Hand;
        int w = S(176), h = S(56);
        Rectangle screen = Screen.PrimaryScreen.Bounds;
        Bounds = new Rectangle(screen.Right - w - S(8), screen.Top + S(6), w, h);
        using (var path = Rounded(new Rectangle(0, 0, w, h), h / 2)) Region = new Region(path);
    }

    int S(int v) { return (int)(v * scale); }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= 0x08000000 | 0x80;   // WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW
            return cp;
        }
    }

    public void ShowPinned()
    {
        if (Visible) return;
        Show();
        // HWND_TOPMOST, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE
        Native.SetWindowPos(Handle, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
    }

    static GraphicsPath Rounded(Rectangle r, int radius)
    {
        var path = new GraphicsPath();
        int d = radius * 2;
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(down ? Color.FromArgb(92, 92, 140) : Color.FromArgb(36, 36, 56));
        using (var path = Rounded(new Rectangle(S(1), S(1), Width - S(3), Height - S(3)), (Height - S(3)) / 2))
        using (var edge = new Pen(Color.FromArgb(200, 255, 255, 255), S(2)))
            g.DrawPath(edge, path);
        int cx = S(34), cy = Height / 2, r = S(12);
        using (var pen = new Pen(Color.White, S(3)))
        {
            pen.LineJoin = LineJoin.Round;
            pen.StartCap = LineCap.Round;
            pen.EndCap = LineCap.Round;
            g.DrawLines(pen, new[] { new Point(cx - r, cy), new Point(cx, cy - r), new Point(cx + r, cy) });
            g.DrawRectangle(pen, cx - r + S(4), cy, 2 * r - S(8), r);
        }
        using (var f = new Font("Segoe UI", 15f, FontStyle.Bold))
            TextRenderer.DrawText(g, "Home", f, new Rectangle(S(58), 0, Width - S(58), Height), Color.White,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix);
    }

    protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        bool hit = down && ClientRectangle.Contains(e.Location);
        down = false;
        Invalidate();
        if (hit) owner.GoHome();
    }

    protected override void OnMouseLeave(EventArgs e) { down = false; Invalidate(); }
}

class TileCanvas : Control
{
    readonly HomeForm host;
    readonly int tileW, tileH, margin, padSide, padTop, padBottom;
    List<TileInfo> tiles = new List<TileInfo>();
    Bitmap cache;
    int pressed = -1;

    // Scroll position and the height of everything that can be scrolled to.
    int scrollY, contentHeight;

    // Drag to scroll (touch, pen, or mouse), with momentum after a flick.
    bool tracking, dragging;
    int downY, lastY, startPos;
    int heldY;                   // finger position the tiles actually follow (see MovePress)
    double velocity;
    readonly Stopwatch moveClock = new Stopwatch();
    readonly Stopwatch glideClock = new Stopwatch();
    readonly System.Windows.Forms.Timer glide = new System.Windows.Forms.Timer();
    const int WM_POINTERUPDATE = 0x0245, WM_POINTERDOWN = 0x0246, WM_POINTERUP = 0x0247;

    // The pre-rendered picture as a GDI bitmap, for the fastest possible copy to the screen.
    IntPtr memDC = IntPtr.Zero, memBmp = IntPtr.Zero, oldBmp = IntPtr.Zero;
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, int rop);
    const int SRCCOPY = 0x00CC0020;

    public TileCanvas(HomeForm host, int tileW, int tileH, int padSide, int padTop, int padBottom)
    {
        this.host = host;
        this.tileW = tileW;
        this.tileH = tileH;
        this.margin = tileH / 14;
        this.padSide = padSide;
        this.padTop = padTop;
        this.padBottom = padBottom;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.Opaque, true);
        SetStyle(ControlStyles.Selectable, false);
        glide.Interval = 15;
        glide.Tick += (s, e) =>
        {
            // Coast by real elapsed time, so an uneven timer doesn't make the glide stutter.
            double dt = Math.Min(0.05, glideClock.Elapsed.TotalSeconds);
            glideClock.Restart();
            int before = ScrollPos;
            ScrollPos = before - (int)Math.Round(velocity * dt);
            velocity *= Math.Pow(0.94, dt / 0.015);
            if (Math.Abs(velocity) < 30 || ScrollPos == before) glide.Stop();
        };
    }

    public int ContentHeight
    {
        get { return contentHeight; }
        set
        {
            if (value == contentHeight) return;
            contentHeight = value;
            ScrollPos = scrollY;          // keep the position within the new range
            InvalidateCache();
        }
    }

    int MaxScroll { get { return Math.Max(0, contentHeight - ClientSize.Height); } }

    int ScrollPos
    {
        get { return scrollY; }
        set
        {
            int v = Math.Max(0, Math.Min(MaxScroll, value));
            if (v == scrollY) return;
            scrollY = v;
            Invalidate();     // painted once, at the latest position, when the screen is next drawn
        }
    }

    public void ScrollBy(int dy) { glide.Stop(); ScrollPos = ScrollPos + dy; }

    void BeginPress(Point p, int screenY)
    {
        glide.Stop();
        tracking = true; dragging = false;
        downY = lastY = heldY = screenY; startPos = ScrollPos; velocity = 0;
        moveClock.Restart();
        SetPressed(HitTest(p));
    }

    void MovePress(Point p, int screenY)
    {
        if (!tracking) return;
        if (!dragging)
        {
            if (Math.Abs(screenY - downY) <= (int)(12 * host.DpiScale))
            {
                if (pressed >= 0 && !TileOnScreen(pressed).Contains(p)) SetPressed(-1);
                return;
            }
            // Start following the finger from where it is now, so the tiles don't jump.
            dragging = true; SetPressed(-1);
            downY = heldY = lastY = screenY; startPos = ScrollPos;
            moveClock.Restart();
            return;
        }
        // A resting or slow finger wobbles by a pixel or two. The tiles follow the finger
        // with a little slack: wobbling inside it moves nothing, and steady movement either
        // way is followed pixel for pixel once it pushes past the slack's edge.
        int slack = (int)Math.Max(3, Math.Round(2.5 * host.DpiScale));
        if (screenY > heldY + slack) heldY = screenY - slack;
        else if (screenY < heldY - slack) heldY = screenY + slack;
        else return;
        int want = startPos - (heldY - downY);
        ScrollPos = want;
        // Pushed past the top or bottom: the list just stops. Start counting from here,
        // so turning the finger around scrolls back right away.
        if (ScrollPos != want) { startPos = ScrollPos; downY = heldY; }

        double t = moveClock.Elapsed.TotalSeconds;
        if (t > 0.0005) velocity = velocity * 0.5 + ((heldY - lastY) / t) * 0.5;
        lastY = heldY;
        moveClock.Restart();
    }

    void EndPress(Point p)
    {
        if (!tracking) return;
        tracking = false;
        if (!dragging)
        {
            int hit = HitTest(p);
            TileInfo t = pressed >= 0 && hit == pressed ? tiles[hit] : null;
            SetPressed(-1);
            if (t != null) host.Launch(t);
            return;
        }
        if (moveClock.Elapsed.TotalSeconds > 0.1) velocity = 0;   // finger stopped before lifting
        if (Math.Abs(velocity) > 50) { glideClock.Restart(); glide.Start(); }
    }

    // A tile's rectangle where it currently appears on screen.
    Rectangle TileOnScreen(int i) { Rectangle r = tiles[i].Bounds; r.Offset(0, -scrollY); return r; }

    // Touch and pen arrive as pointer messages. Handling them here (instead of letting
    // Windows turn them into gestures) makes the whole tile area draggable.
    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_POINTERDOWN || m.Msg == WM_POINTERUPDATE || m.Msg == WM_POINTERUP)
        {
            long lp = m.LParam.ToInt64();
            var screen = new Point((short)(lp & 0xFFFF), (short)((lp >> 16) & 0xFFFF));
            Point p = PointToClient(screen);
            if (m.Msg == WM_POINTERDOWN) BeginPress(p, screen.Y);
            else if (m.Msg == WM_POINTERUPDATE) MovePress(p, screen.Y);
            else EndPress(p);
            m.Result = IntPtr.Zero;
            return;
        }
        base.WndProc(ref m);
    }

    public void SetTiles(List<TileInfo> list)
    {
        foreach (var t in tiles) if (t.Image != null) t.Image.Dispose();
        tiles = list;
        pressed = -1;
        InvalidateCache();
    }

    // Positions tiles in a left-aligned grid for the given width; returns the content height.
    public int LayoutTiles(int width)
    {
        int cell = tileW + margin * 2;
        int cols = Math.Max(1, (width - padSide * 2) / cell);
        for (int i = 0; i < tiles.Count; i++)
        {
            int col = i % cols, row = i / cols;
            tiles[i].Bounds = new Rectangle(padSide + col * cell + margin,
                                            padTop + row * (tileH + margin * 2) + margin, tileW, tileH);
        }
        int rows = (tiles.Count + cols - 1) / cols;
        InvalidateCache();
        return padTop + rows * (tileH + margin * 2) + padBottom;
    }

    public void InvalidateCache()
    {
        if (cache != null) { cache.Dispose(); cache = null; }
        Invalidate();
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        ScrollPos = scrollY;      // stay within range at the new size
        InvalidateCache();
    }

    void ReleaseGdi()
    {
        if (memDC != IntPtr.Zero) { SelectObject(memDC, oldBmp); DeleteDC(memDC); memDC = IntPtr.Zero; }
        if (memBmp != IntPtr.Zero) { DeleteObject(memBmp); memBmp = IntPtr.Zero; }
    }

    void EnsureCache()
    {
        int w = Math.Max(1, ClientSize.Width), h = Math.Max(1, Math.Max(ClientSize.Height, contentHeight));
        if (cache != null && cache.Width == w && cache.Height == h && memDC != IntPtr.Zero) return;
        if (cache != null) cache.Dispose();
        ReleaseGdi();
        // No alpha channel: opaque copies are the fastest, and GDI text renders cleanly.
        cache = new Bitmap(w, h, PixelFormat.Format32bppRgb);
        using (var g = Graphics.FromImage(cache))
        {
            using (var b = new SolidBrush(host.BackColor)) g.FillRectangle(b, 0, 0, w, h);
            Image img = host.CurrentBackground;
            if (img != null)
            {
                // Cover the whole content area; the picture scrolls with the tiles.
                float k = Math.Max(w / (float)img.Width, h / (float)img.Height);
                int iw = (int)(img.Width * k), ih = (int)(img.Height * k);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
                using (var tint = new SolidBrush(Color.FromArgb(90, 0, 0, 0)))
                    g.FillRectangle(tint, 0, 0, w, h);
            }
            using (var nameFont = new Font("Segoe UI Semibold", 15f * host.DpiScale * 96f / 72f, GraphicsUnit.Pixel))
            using (var iconFont = new Font("Segoe UI Emoji", tileH * 0.28f, GraphicsUnit.Pixel))
            {
                foreach (var t in tiles) DrawTile(g, t, nameFont, iconFont);
            }
        }
        memBmp = cache.GetHbitmap();
        memDC = CreateCompatibleDC(IntPtr.Zero);
        oldBmp = SelectObject(memDC, memBmp);
    }

    void DrawTile(Graphics g, TileInfo t, Font nameFont, Font iconFont)
    {
        Rectangle r = t.Bounds;
        using (var b = new SolidBrush(t.Color)) g.FillRectangle(b, r);

        var iconRect = new Rectangle(r.X, r.Y, r.Width, r.Height * 2 / 3);
        if (t.Image != null)
        {
            int size = (int)(r.Height * 0.40f);
            var box = new Rectangle(r.X + (r.Width - size) / 2, r.Y + iconRect.Height / 2 - size / 2 + r.Height / 28, size, size);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            if (t.Plate)
            {
                int inset = size / 7;
                var plate = new Rectangle(box.X - inset, box.Y - inset, box.Width + inset * 2, box.Height + inset * 2);
                using (var b = new SolidBrush(Color.White))
                using (var path = Rounded(plate, inset * 2))
                    g.FillPath(b, path);
            }
            g.DrawImage(t.Image, Fit(t.Image.Size, box));
            g.SmoothingMode = SmoothingMode.None;
            g.PixelOffsetMode = PixelOffsetMode.Default;
        }
        else
        {
            TextRenderer.DrawText(g, t.Icon, iconFont, iconRect, Color.White, t.Color,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix);
        }

        int pad = r.Height / 14;
        var nameRect = new Rectangle(r.X + pad, r.Y + r.Height * 2 / 3, r.Width - pad * 2, r.Height / 3 - pad);
        TextRenderer.DrawText(g, t.Name, nameFont, nameRect, Color.White, t.Color,
            TextFormatFlags.Left | TextFormatFlags.Bottom | TextFormatFlags.WordBreak |
            TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
    }

    static GraphicsPath Rounded(Rectangle r, int radius)
    {
        var path = new GraphicsPath();
        int d = radius * 2;
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    static Rectangle Fit(Size img, Rectangle box)
    {
        float k = Math.Min(box.Width / (float)img.Width, box.Height / (float)img.Height);
        int w = (int)(img.Width * k), h = (int)(img.Height * k);
        return new Rectangle(box.X + (box.Width - w) / 2, box.Y + (box.Height - h) / 2, w, h);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        EnsureCache();
        Rectangle c = e.ClipRectangle;
        var g = e.Graphics;
        IntPtr hdc = g.GetHdc();
        try { BitBlt(hdc, c.X, c.Y, c.Width, c.Height, memDC, c.X, c.Y + scrollY, SRCCOPY); }
        finally { g.ReleaseHdc(hdc); }
        if (pressed >= 0 && pressed < tiles.Count)
        {
            using (var shade = new SolidBrush(Color.FromArgb(60, 0, 0, 0)))
                g.FillRectangle(shade, TileOnScreen(pressed));
        }
    }

    int HitTest(Point p)
    {
        for (int i = 0; i < tiles.Count; i++) if (TileOnScreen(i).Contains(p)) return i;
        return -1;
    }

    void SetPressed(int index)
    {
        if (index == pressed) return;
        if (pressed >= 0 && pressed < tiles.Count) Invalidate(TileOnScreen(pressed));
        pressed = index;
        if (pressed >= 0) Invalidate(TileOnScreen(pressed));
    }

    protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); Capture = true; BeginPress(e.Location, Cursor.Position.Y); }
    protected override void OnMouseMove(MouseEventArgs e) { base.OnMouseMove(e); MovePress(e.Location, Cursor.Position.Y); }
    protected override void OnMouseUp(MouseEventArgs e) { base.OnMouseUp(e); Capture = false; EndPress(e.Location); }
    protected override void OnMouseWheel(MouseEventArgs e) { base.OnMouseWheel(e); ScrollBy(-e.Delta); }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            glide.Dispose();
            ReleaseGdi();
            if (cache != null) { cache.Dispose(); cache = null; }
            foreach (var t in tiles) if (t.Image != null) t.Image.Dispose();
        }
        base.Dispose(disposing);
    }
}
"@

function Update-KidHome {
    # Builds KidHome.exe with the in-box .NET Framework compiler when missing or out of date.
    New-Item -ItemType Directory -Path $script:HomeDir -Force | Out-Null
    Get-ChildItem $script:HomeDir -Filter '*.old' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

    $sha  = [Security.Cryptography.SHA256]::Create()
    $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($script:KidHomeSource))) -replace '-', ''
    $hashFile = Join-Path $script:DataDir 'KidHome.sha256'
    $leftover = Join-Path $script:HomeDir 'KidHome.new.exe'   # present only if a previous swap didn't finish
    if ((Test-Path $script:HomeExe) -and -not (Test-Path $leftover) -and (Test-Path $hashFile) -and
        ((Get-Content $hashFile -Raw).Trim() -eq $hash)) { return }

    $csc = @("$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
             "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $csc) { throw '.NET Framework compiler not found. Cannot build the home screen.' }

    $srcFile = Join-Path $script:DataDir 'KidHome.cs'
    $tmpExe  = Join-Path $script:HomeDir 'KidHome.new.exe'   # built in place so it inherits Program Files permissions
    Set-Content -Path $srcFile -Value $script:KidHomeSource -Encoding UTF8
    $out = & $csc /nologo /target:winexe /optimize+ "/out:$tmpExe" /r:System.Windows.Forms.dll /r:System.Drawing.dll $srcFile 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Home screen build failed: $($out -join ' ')" }

    if (Test-Path $script:HomeExe) {
        # A running exe can be renamed but not deleted.
        try { Remove-Item $script:HomeExe -Force -ErrorAction Stop }
        catch { Rename-Item $script:HomeExe ('KidHome.{0}.old' -f [guid]::NewGuid().ToString('N')) -Force -ErrorAction Stop }
    }
    Move-Item $tmpExe $script:HomeExe -Force -ErrorAction Stop
    Set-Content -Path $hashFile -Value $hash   # only after the new exe is in place
}

function Register-KidLogonTask {
    # Applies her per-user settings at every sign-in, as SYSTEM. Covers first
    # sign-in when the profile could not be pre-created, and corrects drift.
    param($Config)
    if (-not (Test-Path $script:InstalledModule)) { throw "Module not found at $script:InstalledModule." }
    $cmd = "Import-Module '$script:InstalledModule' -Force; Complete-KidSignIn"
    $action    = New-ScheduledTaskAction -Execute 'powershell.exe' `
                   -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$cmd`""
    $trigger   = New-ScheduledTaskTrigger -AtLogOn -User "$env:COMPUTERNAME\$($Config.UserName)"
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                   -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName $script:LogonTask -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Public: core
# ---------------------------------------------------------------------------

function Invoke-KidKioskApply {
    <# Internal entry point for the SYSTEM task. Use Sync-KidTablet instead. #>
    [CmdletBinding()]
    param([ValidateSet('apply', 'remove')][string]$Mode = 'apply')
    try {
        $obj = Get-CimInstance -Namespace 'root\cimv2\mdm\dmmap' -ClassName 'MDM_AssignedAccess'
        $obj.Configuration = if ($Mode -eq 'apply') {
            [System.Net.WebUtility]::HtmlEncode((Get-Content $script:XmlPath -Raw))
        } else { $null }
        Set-CimInstance -CimInstance $obj
        'OK' | Set-Content $script:LogPath
    } catch {
        "FAIL: $($_.Exception.Message)" | Set-Content $script:LogPath
        throw
    }
}

function Sync-KidTablet {
    <#
    .SYNOPSIS
        Rebuilds shortcuts, Edge policies, and the kiosk profile from config.json.
    .PARAMETER RestartSession
        Signs the child out afterward so changes apply now. With auto sign-in on,
        she is signed straight back in.
    #>
    [CmdletBinding()]
    param([switch]$RestartSession, [switch]$RefreshIcons)
    Assert-Elevated
    Update-KidAppConfig
    $cfg  = Read-Config
    $edge = Get-EdgePath

    # Resolve desktop apps
    $desktop = @(foreach ($app in $cfg.DesktopApps) {
        $p = if ($app.Path -and (Test-Path $app.Path)) { $app.Path } elseif ($app.ExeName) { Find-Exe $app.ExeName }
        if ($p -and (Test-ProtectedPath $p)) { $app.Path = $p; $app }
        elseif ($p) { Write-Warning "$($app.Name): $p is outside Program Files/Windows. Not allowed." }
        else { Write-Warning "$($app.Name): executable not found. Not pinned." }
    })

    # Resolve packaged apps
    $installedPfns = @(Get-AppxPackage -AllUsers | Select-Object -ExpandProperty PackageFamilyName -Unique)
    $packaged = @($cfg.PackagedApps | Where-Object {
        $ok = $installedPfns -contains ($_.Aumid -split '!')[0]
        if (-not $ok) { Write-Warning "$($_.Name): package not installed. Not pinned." }
        $ok
    })

    Write-Config $cfg

    # Shortcuts
    if (Test-Path $script:ShortcutDir) { Remove-Item $script:ShortcutDir -Recurse -Force }
    New-Item -ItemType Directory -Path $script:ShortcutDir -Force | Out-Null
    Update-KidHome
    $shell = New-Object -ComObject WScript.Shell
    $homeLnk = Join-Path $script:ShortcutDir 'Home.lnk'
    $lnk = $shell.CreateShortcut($homeLnk)
    $lnk.TargetPath = $script:HomeExe; $lnk.IconLocation = "$($script:HomeExe),0"
    $lnk.Save()

    $links = @($homeLnk)
    foreach ($app in $cfg.WebApps) {
        $path = Join-Path $script:ShortcutDir "$($app.Name).lnk"
        $lnk = $shell.CreateShortcut($path)
        $lnk.TargetPath = $edge; $lnk.Arguments = "--app=$($app.Url) --start-maximized"
        $lnk.IconLocation = "$edge,0"; $lnk.WindowStyle = 3
        $lnk.Save(); $links += $path
    }
    foreach ($app in $desktop) {
        $path = Join-Path $script:ShortcutDir "$($app.Name).lnk"
        $lnk = $shell.CreateShortcut($path)
        $lnk.TargetPath = $app.Path; $lnk.Arguments = [string]$app.Arguments
        $lnk.WorkingDirectory = Split-Path $app.Path; $lnk.IconLocation = "$($app.Path),0"; $lnk.WindowStyle = 3
        $lnk.Save(); $links += $path
    }
    Update-KidTileImages $cfg -Refresh:$RefreshIcons
    Update-KidBackground $cfg
    Set-KidMediaPolicy $cfg
    Write-KidHomeTiles $cfg

    Sync-KidUserSettings

    # Kiosk profile
    $allowed = @($packaged | ForEach-Object { "          <App AppUserModelId=""$(ConvertTo-XmlAttr $_.Aumid)"" />" })
    $allowed += "          <App DesktopAppPath=""$(ConvertTo-XmlAttr $edge)"" />"
    # Edge's launcher for installable web apps; her Edge site allowlist still applies.
    $edgeProxy = Join-Path (Split-Path $edge) 'msedge_proxy.exe'
    if (Test-Path $edgeProxy) { $allowed += "          <App DesktopAppPath=""$(ConvertTo-XmlAttr $edgeProxy)"" />" }
    $allowed += @($desktop | ForEach-Object { "          <App DesktopAppPath=""$(ConvertTo-XmlAttr $_.Path)"" />" })
    $allowed += "          <App DesktopAppPath=""$(ConvertTo-XmlAttr $script:HomeExe)"" rs5:AutoLaunch=""true"" />"
    Write-KidKioskXml -Config $cfg -Allowed $allowed -Links $links -Packaged $packaged
    Set-KidKiosk -Mode apply

    Write-Host "Synced: $($cfg.WebApps.Count) web, $($desktop.Count) desktop, $($packaged.Count) packaged apps."
    if ($RestartSession) { Restart-KidSession }
    else { Write-Host 'Kiosk changes apply at her next sign-in. Use -RestartSession or Restart-KidSession to apply now.' }
}

function Get-VisualElements {
    # VisualElements is namespaced (uap:) in most manifests; match on local name.
    param($AppNode)
    if ($AppNode) { $AppNode.SelectSingleNode("*[local-name()='VisualElements']") }
}

function Get-KidIconFile { param([string]$Name) Join-Path $script:IconDir ((ConvertTo-SafeName $Name) + '.png') }

function Get-KidTileImage {
    # Path for the tile list, or empty when the tile should use its emoji.
    param([string]$Name)
    $f = Get-KidIconFile $Name
    if (Test-Path $f) { $f } else { '' }
}

function Save-ImageAsPng {
    param([string]$Source, [string]$Out)
    Add-Type -AssemblyName System.Drawing
    $img = [System.Drawing.Image]::FromFile((Resolve-KidPath $Source))
    try {
        if ($img.Width -lt 24) { return $false }   # too small to look right on a tile
        $img.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $true
    } finally { $img.Dispose() }
}

function Save-PackagedAppImage {
    # Copies the largest logo asset the app ships (the art Start uses).
    param($App, $Packages, [string]$Out)
    $pfn, $appId = $App.Aumid -split '!'
    $pkg = $Packages | Where-Object PackageFamilyName -eq $pfn | Select-Object -First 1
    if (-not $pkg) { return $false }
    $xml = [xml](Get-Content (Join-Path $pkg.InstallLocation 'AppxManifest.xml') -Raw)
    $a = @($xml.Package.Applications.Application) | Where-Object { $_.Id -eq $appId } | Select-Object -First 1
    $ve = Get-VisualElements $a
    if (-not $ve) { return $false }
    foreach ($attr in 'Square150x150Logo', 'Square44x44Logo') {
        $rel = $ve.GetAttribute($attr)
        if (-not $rel) { continue }
        $base = Join-Path $pkg.InstallLocation $rel
        $stem = [IO.Path]::GetFileNameWithoutExtension($base)
        $ext  = [IO.Path]::GetExtension($base)
        $best = @(Get-ChildItem (Split-Path $base) -Filter "$stem*$ext" -File -ErrorAction SilentlyContinue |
                  Where-Object { $_.Name -notmatch 'contrast-' }) | Sort-Object Length -Descending | Select-Object -First 1
        if ($best -and (Save-ImageAsPng $best.FullName $Out)) { return $true }
    }
    $false
}

function Save-ExeImage {
    # Extracts the exe's icon at 256px.
    param([string]$Exe, [string]$Out)
    if (-not ('KidTablet.IconExtractor' -as [type])) {
        Add-Type -Namespace KidTablet -Name IconExtractor -MemberDefinition @"
[DllImport("user32.dll", CharSet = CharSet.Unicode)]
public static extern uint PrivateExtractIcons(string szFileName, int nIconIndex, int cxIcon, int cyIcon, IntPtr[] phicon, uint[] piconid, uint nIcons, uint flags);
[DllImport("user32.dll")]
public static extern bool DestroyIcon(IntPtr hIcon);
"@
    }
    Add-Type -AssemblyName System.Drawing
    $h = New-Object IntPtr[] 1
    $ids = New-Object uint[] 1
    [void][KidTablet.IconExtractor]::PrivateExtractIcons($Exe, 0, 256, 256, $h, $ids, 1, 0)
    if ($h[0] -eq [IntPtr]::Zero) { return $false }
    try {
        $bmp = ([System.Drawing.Icon]::FromHandle($h[0])).ToBitmap()
        try { $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $true } finally { $bmp.Dispose() }
    } finally { [void][KidTablet.IconExtractor]::DestroyIcon($h[0]) }
}

function Save-WebAppImage {
    # Downloads the site's largest declared icon, then touch icon, then favicon. SVG is skipped.
    param([string]$Url, [string]$Out)
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $page = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
        $base = if ($page.BaseResponse.ResponseUri) { $page.BaseResponse.ResponseUri } else { [uri]$Url }
        $cands = @()
        foreach ($m in [regex]::Matches($page.Content, '<link\b[^>]*>', 'IgnoreCase')) {
            $tag = $m.Value
            if ($tag -notmatch 'rel\s*=\s*["'']?([^"''>]*icon[^"''>]*)') { continue }
            $relAttr = $Matches[1]
            if ($tag -notmatch 'href\s*=\s*["'']?([^"''\s>]+)') { continue }
            $href = [System.Net.WebUtility]::HtmlDecode($Matches[1])
            if ($href -match '\.svg($|\?)' -or $href -like 'data:*') { continue }
            $size = if ($tag -match 'sizes\s*=\s*["'']?(\d+)x') { [int]$Matches[1] } elseif ($relAttr -match 'apple') { 180 } else { 16 }
            $cands += [pscustomobject]@{ Url = ([uri]::new([uri]$base, $href)).AbsoluteUri; Size = $size }
        }
        $cands += [pscustomobject]@{ Url = ([uri]::new([uri]$base, '/apple-touch-icon.png')).AbsoluteUri; Size = 179 }
        $cands += [pscustomobject]@{ Url = ([uri]::new([uri]$base, '/favicon.ico')).AbsoluteUri; Size = 1 }
        foreach ($c in $cands | Sort-Object Size -Descending) {
            $tmp = "$Out.download"
            try {
                Invoke-WebRequest -Uri $c.Url -UseBasicParsing -TimeoutSec 15 -OutFile $tmp
                if (Save-ImageAsPng $tmp $Out) { return $true }
            } catch { } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
        }
    } catch { }
    $false
}

function Update-KidTileImages {
    # Fetches missing icons (all of them with -Refresh) and removes icons for apps no longer configured.
    param($Config, [switch]$Refresh)
    New-Item -ItemType Directory -Path $script:IconDir -Force | Out-Null
    $packages = @(Get-AppxPackage -AllUsers)
    $keep = @()
    foreach ($list in 'WebApps', 'DesktopApps', 'PackagedApps') {
        foreach ($app in $Config.$list) {
            $out = Get-KidIconFile $app.Name
            $keep += $out
            if ((Test-Path $out) -and -not $Refresh) { continue }
            $ok = try {
                switch ($list) {
                    'WebApps'      { Save-WebAppImage $app.Url $out }
                    'DesktopApps'  { if ($app.Path -and (Test-Path $app.Path)) { Save-ExeImage $app.Path $out } else { $false } }
                    'PackagedApps' { Save-PackagedAppImage $app $packages $out }
                }
            } catch { $false }
            if (-not $ok) { Remove-Item $out -Force -ErrorAction SilentlyContinue }
        }
    }
    Get-ChildItem $script:IconDir -Filter '*.png' | Where-Object { $keep -notcontains $_.FullName } | Remove-Item -Force
}

function Update-KidBackground {
    # Copies the configured background (image file, folder of images, or https URL)
    # to a folder her account can read. Empty Background clears it.
    param($Config)
    if (Test-Path $script:BackgroundDir) { Remove-Item $script:BackgroundDir -Recurse -Force -ErrorAction SilentlyContinue }
    $src = [string]$Config.Background
    if (-not $src) { return }
    New-Item -ItemType Directory -Path $script:BackgroundDir -Force | Out-Null
    $exts = '.jpg', '.jpeg', '.png', '.bmp'
    try {
        if ($src -match '^https://') {
            $out = Join-Path $script:BackgroundDir ('background' + [IO.Path]::GetExtension(([uri]$src).AbsolutePath))
            Invoke-WebRequest -Uri $src -UseBasicParsing -OutFile $out -TimeoutSec 30
            return
        }
        if (-not (Test-Path $src)) { Write-Warning "Background not found: $src"; return }
        $files = if ((Get-Item $src).PSIsContainer) {
            Get-ChildItem $src -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { $exts -contains $_.Extension.ToLowerInvariant() -and $_.Length -gt 50KB } |
                Sort-Object FullName | Select-Object -First 30
        } else { Get-Item $src }
        $i = 0
        foreach ($f in $files) {
            Copy-Item $f.FullName (Join-Path $script:BackgroundDir ('{0:D2}{1}' -f $i, $f.Extension.ToLowerInvariant())) -Force
            $i++
        }
        if (-not $i) { Write-Warning "No images (jpg, png, bmp over 50 KB) found in $src" }
    } catch { Write-Warning "Background: $($_.Exception.Message)" }
}

function Find-KidWallpaper {
    <#
    .SYNOPSIS
        Finds the image folders of installed Windows themes by name.
    .DESCRIPTION
        Matches Store theme packages by package or display name, theme folders in any
        account's profile, and .theme files (which record where a theme's images live).
        Pass a result's Path to Set-KidTabletSetting -Background.
    .EXAMPLE
        Find-KidWallpaper pony
    .EXAMPLE
        Set-KidTabletSetting -Background (Find-KidWallpaper pony | Select-Object -First 1).Path
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory, Position = 0)][string]$Name)
    Assert-Elevated
    $exts = '.jpg', '.jpeg', '.png', '.bmp'
    $roots = @()

    # Store packages: package name or display name
    foreach ($pkg in Get-AppxPackage -AllUsers | Where-Object { $_.InstallLocation } | Sort-Object PackageFamilyName -Unique) {
        $match = $pkg.Name -like "*$Name*"
        if (-not $match) {
            $manifest = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
            if (Test-Path $manifest) {
                $display = Resolve-ManifestString $pkg ([string]([xml](Get-Content $manifest -Raw)).Package.Properties.DisplayName)
                $match = $display -like "*$Name*"
            }
        }
        if ($match) { $roots += [pscustomobject]@{ Source = "Store package $($pkg.Name)"; Path = $pkg.InstallLocation } }
    }

    # Theme folders and .theme files in every profile
    foreach ($themes in Get-ChildItem 'C:\Users\*\AppData\Local\Microsoft\Windows\Themes' -Directory -ErrorAction SilentlyContinue) {
        $profilePath = $themes.FullName.Substring(0, $themes.FullName.IndexOf('\AppData\'))
        $who = Split-Path $profilePath -Leaf
        Get-ChildItem $themes.FullName -Directory -ErrorAction SilentlyContinue | Where-Object Name -like "*$Name*" |
            ForEach-Object { $roots += [pscustomobject]@{ Source = "Theme folder in $who's profile"; Path = $_.FullName } }
        foreach ($tf in Get-ChildItem $themes.FullName -Recurse -Filter '*.theme' -ErrorAction SilentlyContinue) {
            $text = Get-Content $tf.FullName -Raw -ErrorAction SilentlyContinue
            if (-not $text -or ($text -notlike "*$Name*" -and $tf.Name -notlike "*$Name*")) { continue }
            foreach ($m in [regex]::Matches($text, '(?im)^\s*(ImagesRootPath|Wallpaper)\s*=\s*(.+?)\s*$')) {
                $p = $m.Groups[2].Value.Trim('"')
                # Expand per-user variables against the profile that owns this .theme file.
                $p = $p -replace '(?i)%LOCALAPPDATA%', "$profilePath\AppData\Local" -replace '(?i)%APPDATA%', "$profilePath\AppData\Roaming" `
                        -replace '(?i)%USERPROFILE%', $profilePath
                $p = [Environment]::ExpandEnvironmentVariables($p)
                if ($m.Groups[1].Value -ieq 'Wallpaper') { $p = Split-Path $p -Parent }
                if ($p -and (Test-Path $p)) { $roots += [pscustomobject]@{ Source = "$($tf.Name) in $who's profile"; Path = $p } }
            }
        }
    }

    $seen = @{}
    foreach ($r in $roots) {
        # The folder with the most large images is the wallpaper set.
        Get-ChildItem $r.Path -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $exts -contains $_.Extension.ToLowerInvariant() -and $_.Length -gt 50KB } |
            Group-Object DirectoryName | Sort-Object Count -Descending | Select-Object -First 3 |
            Where-Object { -not $seen.ContainsKey($_.Name) } |
            ForEach-Object { $seen[$_.Name] = $true; [pscustomobject]@{ Images = $_.Count; Source = $r.Source; Path = $_.Name } }
    }
}

function Write-KidHomeTiles {
    # Writes the home screen's tile list. Desktop and Store apps added since her
    # last sign-in are marked pending: kiosk permissions only refresh at sign-in,
    # so the home screen hides them until then.
    param($Config)
    $active = @($Config.ActiveTargets)
    $installedPfns = @(Get-AppxPackage -AllUsers | Select-Object -ExpandProperty PackageFamilyName -Unique)
    $lines = @("#title`tHi, $($Config.DisplayName)!")
    if (Test-Path $script:BackgroundDir) {
        $lines += @(Get-ChildItem $script:BackgroundDir -File | Sort-Object Name | ForEach-Object { "#background`t$($_.FullName)" })
    }
    foreach ($app in $Config.WebApps) {
        $lnk = Join-Path $script:ShortcutDir "$($app.Name).lnk"
        if (Test-Path $lnk) { $lines += "$($app.Name)`t$($app.Icon)`t$($app.Color)`t$lnk`t`t$(Get-KidTileImage $app.Name)`tplate" }
    }
    foreach ($app in $Config.DesktopApps) {
        $lnk = Join-Path $script:ShortcutDir "$($app.Name).lnk"
        if (-not (Test-Path $lnk)) { continue }
        $flag = if ($active -contains $app.Path) { '' } else { 'pending' }
        $lines += "$($app.Name)`t$($app.Icon)`t$($app.Color)`t$lnk`t$flag`t$(Get-KidTileImage $app.Name)`tplate"
    }
    foreach ($app in $Config.PackagedApps) {
        if ($installedPfns -notcontains ($app.Aumid -split '!')[0]) { continue }
        $flag = if ($active -contains $app.Aumid) { '' } else { 'pending' }
        $lines += "$($app.Name)`t$($app.Icon)`t$($app.Color)`tshell:AppsFolder\$($app.Aumid)`t$flag`t$(Get-KidTileImage $app.Name)`t"
    }
    $lines | Set-Content -Path $script:HomeTsv -Encoding UTF8
}

function Complete-KidSignIn {
    <# Runs at each of her sign-ins (logon task): applies her settings and releases pending tiles. #>
    [CmdletBinding()]
    param()
    Assert-Elevated
    Sync-KidUserSettings
    $cfg = Read-Config
    $cfg.ActiveTargets = @(@($cfg.DesktopApps | ForEach-Object { $_.Path } | Where-Object { $_ }) +
                           @($cfg.PackagedApps | ForEach-Object { $_.Aumid }))
    Write-Config $cfg
    Write-KidHomeTiles $cfg
}

function Set-KidMediaPolicy {
    # Device-level camera and microphone access. With it on, apps are pre-approved,
    # so Store apps don't stop to ask her on first use. Best-effort: some Windows
    # builds protect these keys.
    param($Config)
    $policy  = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy'
    $consent = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore'
    try {
        if ($Config.AllowCameraMic) {
            Set-RegValue $policy 'LetAppsAccessCamera' 1        # 1 = force allow
            Set-RegValue $policy 'LetAppsAccessMicrophone' 1
            foreach ($cap in 'microphone', 'webcam') { Set-RegValue "$consent\$cap" 'Value' 'Allow' String }
        } else {
            Remove-ItemProperty $policy -Name 'LetAppsAccessCamera', 'LetAppsAccessMicrophone' -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Warning "Couldn't set device camera and microphone access ($($_.Exception.Message)). Apps may ask her for permission on first use."
    }
}

function Sync-KidUserSettings {
    <# Writes her Edge policies, lock screen, and text size settings. #>
    [CmdletBinding()]
    param()
    Assert-Elevated
    $cfg = Read-Config
    Invoke-KidHive -Config $cfg -Script {
        param($root, $c)
        $edgePol = "$root\Software\Policies\Microsoft\Edge"
        Set-RegValue $edgePol 'InPrivateModeAvailability'  1
        Set-RegValue $edgePol 'ForceBingSafeSearch'        2
        Set-RegValue $edgePol 'ForceGoogleSafeSearch'      1
        Set-RegValue $edgePol 'ForceYouTubeRestrict'       2
        Set-RegValue $edgePol 'BrowserSignin'              0
        Set-RegValue $edgePol 'HideFirstRunExperience'     1
        Set-RegValue $edgePol 'DeveloperToolsAvailability' 2
        Set-RegValue $edgePol 'BrowserAddProfileEnabled'   0

        # Camera and microphone: Windows privacy switches for her account, and Edge
        # pre-approval for the sites on her allowlist (nothing else can load anyway).
        $consent = "$root\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore"
        $value = if ($c.AllowCameraMic) { 'Allow' } else { 'Deny' }
        foreach ($cap in 'microphone', 'webcam') {
            Set-RegValue "$consent\$cap" 'Value' $value String
            Set-RegValue "$consent\$cap\NonPackaged" 'Value' $value String     # desktop apps
        }
        $mediaSites = @(@($c.AllowedDomains) + @($c.WebApps | ForEach-Object { ([uri]$_.Url).Host -replace '^www\.', '' }) |
                        Where-Object { $_ -match '^[a-z0-9.-]+\.[a-z]{2,}$' } | Select-Object -Unique | ForEach-Object { "https://[*.]$_" })
        # Her offline apps (Draw With Me listens for what she wants to draw) get the microphone too.
        # Edge only honors the all-local-files form here ('file:///*'); a folder path is ignored.
        # It stays scoped to her apps: the site blocklist lets only C:\KidTabletApps pages load.
        $mediaSites = @($mediaSites) + @('file:///*')
        if ($c.AllowCameraMic) {
            Set-RegValue $edgePol 'AudioCaptureAllowed' 1
            Set-RegValue $edgePol 'VideoCaptureAllowed' 1
            Set-RegList "$edgePol\AudioCaptureAllowedUrls" $mediaSites
            Set-RegList "$edgePol\VideoCaptureAllowedUrls" $mediaSites
        } else {
            Set-RegValue $edgePol 'AudioCaptureAllowed' 0
            Set-RegValue $edgePol 'VideoCaptureAllowed' 0
            Remove-Item "$edgePol\AudioCaptureAllowedUrls", "$edgePol\VideoCaptureAllowedUrls" -Recurse -Force -ErrorAction SilentlyContinue
        }
        if ($c.AllowAllWebsites) {
            Remove-Item "$edgePol\URLBlocklist", "$edgePol\URLAllowlist" -Recurse -Force -ErrorAction SilentlyContinue
        } else {
            Set-RegList "$edgePol\URLBlocklist" @('*')
            Set-RegList "$edgePol\URLAllowlist" @($c.AllowedDomains)
        }
        $cdm = "$root\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager"
        foreach ($n in 'RotatingLockScreenOverlayEnabled', 'SubscribedContent-338387Enabled',
                       'SubscribedContent-338388Enabled', 'SubscribedContent-338389Enabled',
                       'SystemPaneSuggestionsEnabled', 'SoftLandingEnabled', 'SilentInstalledAppsEnabled') {
            Set-RegValue $cdm $n 0
        }
        Set-RegValue "$root\Software\Microsoft\Accessibility" 'TextScaleFactor' ([int]$c.TextScalePercent)
        Set-RegValue "$root\Control Panel\Desktop" 'ScreenSaverIsSecure' '0' String
        # The home screen covers the desktop and draws its own wallpaper. Keep the Windows
        # desktop a plain color with no slideshow or transparency, which otherwise cost
        # background work (slideshow switches broadcast a settings change each time).
        Set-RegValue "$root\Control Panel\Desktop" 'WallPaper' '' String
        Set-RegValue "$root\Control Panel\Colors" 'Background' '0 0 0' String
        Set-RegValue "$root\Software\Microsoft\Windows\CurrentVersion\Explorer\Wallpapers" 'BackgroundType' 1
        Set-RegValue "$root\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" 'EnableTransparency' 0
        # Edge swipes open Task View and notifications, which bypass the home screen.
        Set-RegValue "$root\Software\Policies\Microsoft\Windows\EdgeUI" 'AllowEdgeSwipe' 0
        # Fallback start for the home screen alongside kiosk AutoLaunch. KidHome is single-instance.
        Set-RegValue "$root\Software\Microsoft\Windows\CurrentVersion\Run" 'KidHome' "`"$script:HomeExe`"" String
    }
}

function Write-KidKioskXml {
    param($Config, [string[]]$Allowed, [string[]]$Links, $Packaged)
    $cfg = $Config
    $allowed = $Allowed
    $links = @($Links)
    $packaged = @($Packaged)

    $pins  = @($links    | ForEach-Object { @{ desktopAppLink = $_ } })
    $pins += @($packaged | ForEach-Object { @{ packagedAppId  = $_.Aumid } })
    $pinsJson = @{ pinnedList = $pins } | ConvertTo-Json -Depth 4 -Compress

    # Hidden by default: the home screen is the only launcher. When shown, the
    # pin list is replaced so Windows' default pins (Edge, Outlook, Store) are gone.
    $taskbar = if ($cfg.ShowTaskbar) {
        $homeAttr = ConvertTo-XmlAttr $links[0]
        @"
      <Taskbar ShowTaskbar="true" />
      <win11:TaskbarLayout><![CDATA[<?xml version="1.0" encoding="utf-8"?>
<LayoutModificationTemplate xmlns="http://schemas.microsoft.com/Start/2014/LayoutModification" xmlns:defaultlayout="http://schemas.microsoft.com/Start/2014/FullDefaultLayout" xmlns:start="http://schemas.microsoft.com/Start/2014/StartLayout" xmlns:taskbar="http://schemas.microsoft.com/Start/2014/TaskbarLayout" Version="1">
  <CustomTaskbarLayoutCollection PinListPlacement="Replace">
    <defaultlayout:TaskbarLayout>
      <taskbar:TaskbarPinList>
        <taskbar:DesktopApp DesktopApplicationLinkPath="$homeAttr" />
      </taskbar:TaskbarPinList>
    </defaultlayout:TaskbarLayout>
  </CustomTaskbarLayoutCollection>
</LayoutModificationTemplate>]]></win11:TaskbarLayout>
"@
    } else {
        '      <Taskbar ShowTaskbar="false" />'
    }

    $account = ConvertTo-XmlAttr "$env:COMPUTERNAME\$($cfg.UserName)"
    $xml = @"
<?xml version="1.0" encoding="utf-8"?>
<AssignedAccessConfiguration
  xmlns="http://schemas.microsoft.com/AssignedAccess/2017/config"
  xmlns:rs5="http://schemas.microsoft.com/AssignedAccess/201810/config"
  xmlns:v3="http://schemas.microsoft.com/AssignedAccess/2020/config"
  xmlns:win11="http://schemas.microsoft.com/AssignedAccess/2022/config">
  <Profiles>
    <Profile Id="$script:ProfileId">
      <AllAppsList>
        <AllowedApps>
$($allowed -join "`r`n")
        </AllowedApps>
      </AllAppsList>
      <win11:StartPins><![CDATA[$pinsJson]]></win11:StartPins>
$taskbar
    </Profile>
  </Profiles>
  <Configs>
    <Config>
      <Account>$account</Account>
      <DefaultProfile Id="$script:ProfileId" />
    </Config>
  </Configs>
</AssignedAccessConfiguration>
"@
    $xml | Set-Content -Path $script:XmlPath -Encoding UTF8
}

function Restart-KidSession {
    <# Signs the child out. With auto sign-in on, she is signed straight back in. #>
    [CmdletBinding()]
    param()
    $cfg  = Read-Config
    $line = @(quser.exe 2>$null) | Where-Object { $_ -match "^\s*>?$([regex]::Escape($cfg.UserName))\s" } | Select-Object -First 1
    if (-not $line) { Write-Host "$($cfg.UserName) is not signed in."; return }
    $id = ($line.Trim() -split '\s+') | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1
    & logoff.exe $id
    Write-Host "Signed out $($cfg.UserName) (session $id)."
}

# ---------------------------------------------------------------------------
# Public: app management
# ---------------------------------------------------------------------------

function Get-KidTabletConfig { Read-Config }

function Get-KidApp {
    $cfg = Read-Config
    $cfg.WebApps      | ForEach-Object { [pscustomobject]@{ Type = 'Web';      Name = $_.Name; Target = $_.Url } }
    $cfg.DesktopApps  | ForEach-Object { [pscustomobject]@{ Type = 'Desktop';  Name = $_.Name; Target = if ($_.Path) { $_.Path } else { $_.WingetId } } }
    $cfg.PackagedApps | ForEach-Object { [pscustomobject]@{ Type = 'Packaged'; Name = $_.Name; Target = $_.Aumid } }
}

function Add-KidWebApp {
    <#
    .EXAMPLE
        Add-KidWebApp -Name 'Epic Books' -Url 'https://www.getepic.com'
    .PARAMETER AllowDomain
        Domains to add to her Edge allowlist. Defaults to the URL's host without "www.".
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][uri]$Url,
        [string[]]$AllowDomain,
        [string]$Icon, [string]$Color,
        [switch]$NoSync, [switch]$RestartSession
    )
    Assert-Elevated; Assert-SafeName $Name; Assert-Color $Color
    $isLocal = $Url.IsFile -and $Url.LocalPath.StartsWith($script:LocalAppsDir + '\', [StringComparison]::OrdinalIgnoreCase)
    if ($Url.Scheme -ne 'https' -and -not $isLocal) { throw 'Use an https URL (or Add-KidLocalApp for an offline app).' }
    $cfg = Read-Config
    $existing = $cfg.WebApps | Where-Object Name -eq $Name
    if ($existing) {
        $existing.Url = $Url.AbsoluteUri
        if ($Icon)  { $existing.Icon  = ConvertTo-KidIcon $Icon }
        if ($Color) { $existing.Color = $Color }
    } else {
        $cfg.WebApps = @($cfg.WebApps) + [pscustomobject]@{
            Name = $Name; Url = $Url.AbsoluteUri; Icon = (ConvertTo-KidIcon $Icon); Color = $Color }
    }
    if (-not $AllowDomain) { $AllowDomain = if ($isLocal) { @($script:LocalAppsPattern) } else { @($Url.Host -replace '^www\.', '') } }
    $cfg.AllowedDomains = @(@($cfg.AllowedDomains) + ($AllowDomain | ForEach-Object { if ($_ -like 'file:*') { $_ } else { $_.ToLowerInvariant() } }) | Select-Object -Unique)
    Write-Config $cfg
    if (-not $NoSync) { Sync-KidTablet -RestartSession:$RestartSession }
}

function Read-KidEnvFile {
    <#
    .SYNOPSIS
        Reads KEY=VALUE lines from a .env file (comments, blank lines, quotes and "export" are handled).
    #>
    param([Parameter(Mandatory)][string]$Path)
    $vars = @{}
    if (-not (Test-Path $Path)) { return $vars }
    foreach ($line in Get-Content -LiteralPath $Path) {
        $t = $line.Trim()
        if (-not $t -or $t.StartsWith('#')) { continue }
        if ($t -match '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            # Take both parts now: every later -match replaces $Matches.
            $name = $Matches[1]; $v = $Matches[2].Trim()
            if ($v -match '^"(.*)"$' -or $v -match "^'(.*)'$") { $v = $Matches[1] }
            elseif ($v -match '^(.*?)\s+#') { $v = $Matches[1].Trim() }     # trailing comment on an unquoted value
            $vars[$name] = $v
        }
    }
    return $vars
}

function Update-KidAppConfig {
    <#
    .SYNOPSIS
        Writes config.js for offline apps that use one (Draw With Me learns new drawings with it),
        from the .env file in the KidTablet data folder. With no key, removes config.js (learning off).
    .DESCRIPTION
        .env settings (C:\ProgramData\KidTablet\.env):
            ANTHROPIC_API_KEY=sk-ant-...
            DRAW_MODEL=claude-sonnet-5-5              (optional; claude-haiku-4-5-20251001 costs less)
            DRAW_DAILY_LIMIT=25                       (optional: new drawings per day; Story Maker: stories per day)
            STORY_MODEL=claude-haiku-4-5-20251001     (optional: Story Maker's writer)
            TTS_PROVIDER=voicestudio | azure | openai (optional: live voices for Story Maker)
            TTS_URL=http://10.0.0.169:3901  TTS_PIN=  (voicestudio: VoiceStudio's LAN share on your PC)
            TTS_KEY=...   TTS_REGION=eastus           (azure/openai; with voicestudio they are the fallback)
        The .env stays outside the app folders; only config.js sits next to the app that reads it.
    #>
    [CmdletBinding()]
    param([string]$EnvFile = (Join-Path $script:DataDir '.env'))
    $vars = Read-KidEnvFile -Path $EnvFile
    $key = $vars['ANTHROPIC_API_KEY']
    $limit = 25
    if ($vars['DRAW_DAILY_LIMIT'] -and [int]::TryParse($vars['DRAW_DAILY_LIMIT'], [ref]$null)) { $limit = [Math]::Max(1, [int]$vars['DRAW_DAILY_LIMIT']) }
    $model = if ($vars['DRAW_MODEL']) { $vars['DRAW_MODEL'] } else { 'claude-sonnet-5-5' }
    if (-not (Test-Path $script:LocalAppsDir)) { return }
    foreach ($dir in Get-ChildItem -LiteralPath $script:LocalAppsDir -Directory) {
        $index = Join-Path $dir.FullName 'index.html'
        if (-not (Test-Path $index) -or -not (Select-String -LiteralPath $index -SimpleMatch 'src="config.js"' -Quiet)) { continue }
        $cfgFile = Join-Path $dir.FullName 'config.js'
        if ($key) {
            $cfg = [ordered]@{ apiKey = $key; model = $model; dailyLimit = $limit }
            if ($vars['STORY_MODEL']) { $cfg['storyModel'] = $vars['STORY_MODEL'] }
            if ($vars['TTS_KEY'] -or $vars['TTS_URL']) {
                $provider = if ($vars['TTS_PROVIDER']) { $vars['TTS_PROVIDER'] } elseif ($vars['TTS_URL']) { 'voicestudio' } else { 'azure' }
                $tts = [ordered]@{ provider = $provider }
                if ($vars['TTS_URL']) { $tts['url'] = $vars['TTS_URL'].TrimEnd('/') }
                if ($vars['TTS_PIN']) { $tts['pin'] = $vars['TTS_PIN'] }
                if ($vars['TTS_KEY']) { $tts['key'] = $vars['TTS_KEY'] }
                if ($vars['TTS_REGION']) { $tts['region'] = $vars['TTS_REGION'] }
                # With voicestudio, the key (if any) is the fallback; say which kind it is.
                if ($provider -eq 'voicestudio' -and $vars['TTS_KEY']) { $tts['fallback'] = if ($vars['TTS_FALLBACK']) { $vars['TTS_FALLBACK'] } else { 'azure' } }
                $cfg['tts'] = $tts
            }
            $json = $cfg | ConvertTo-Json -Compress -Depth 4
            Set-Content -LiteralPath $cfgFile -Value "window.DWM_CONFIG = $json;" -Encoding UTF8
            $voices = if ($cfg.Contains('tts')) { ", voices: $($cfg['tts']['provider'])" } else { '' }
            Write-Verbose "$($dir.Name): learning on ($model, $limit new drawings a day$voices)"
        } elseif (Test-Path $cfgFile) {
            Remove-Item -LiteralPath $cfgFile -Force
            Write-Verbose "$($dir.Name): learning off (no ANTHROPIC_API_KEY in $EnvFile)"
        }
    }
}

function Initialize-LocalAppsDir {
    # Admins and SYSTEM write; her account can only read. A folder made directly under
    # C:\ would otherwise inherit rights that let any signed-in user modify files.
    New-Item -ItemType Directory -Path $script:LocalAppsDir -Force | Out-Null
    Set-LockedDirAcl $script:LocalAppsDir @(@('S-1-5-18', 'FullControl'), @('S-1-5-32-544', 'FullControl'), @('S-1-5-32-545', 'ReadAndExecute'))
}

function Add-KidLocalApp {
    <#
    .SYNOPSIS
        Installs an offline HTML app (a single .html file, or a folder with index.html) as a tile.
    .DESCRIPTION
        Copies it to C:\KidTabletApps\<name>, where her account can read but not change it,
        allows that folder in her Edge allowlist, and adds a tile that opens it full screen.
        Runs without internet access.
    .EXAMPLE
        Add-KidLocalApp -Name 'Kitchen Lab' -Path .\kitchen-lab.html
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Path,
        [string]$Icon, [string]$Color,
        [switch]$NoSync
    )
    Assert-Elevated; Assert-SafeName $Name; Assert-Color $Color
    if (-not (Test-Path $Path)) { throw "$Path does not exist." }
    Initialize-LocalAppsDir
    $slug = (($Name -replace '[^A-Za-z0-9]+', '-').Trim('-')).ToLowerInvariant()
    $dest = Join-Path $script:LocalAppsDir $slug
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    if ((Get-Item $Path).PSIsContainer) {
        if (-not (Test-Path (Join-Path $Path 'index.html'))) { throw "$Path has no index.html." }
        Copy-Item (Join-Path $Path '*') $dest -Recurse -Force
    } else {
        Copy-Item $Path (Join-Path $dest 'index.html') -Force
    }
    Update-KidAppConfig
    $url = 'file:///' + ((Join-Path $dest 'index.html') -replace '\\', '/')
    $cfg = Read-Config
    $cfg.AllowedDomains = @(@($cfg.AllowedDomains) + $script:LocalAppsPattern | Select-Object -Unique)
    Write-Config $cfg
    $extra = @{}
    if ($Icon)  { $extra.Icon  = $Icon }
    if ($Color) { $extra.Color = $Color }
    Add-KidWebApp -Name $Name -Url $url -AllowDomain $script:LocalAppsPattern -NoSync:$NoSync @extra
}

function Add-KidDesktopApp {
    <#
    .EXAMPLE
        Add-KidDesktopApp -Name 'GCompris' -WingetId 'KDE.GCompris' -ExeName 'gcompris-qt.exe'
    .EXAMPLE
        Add-KidDesktopApp -Name 'Some App' -Path 'C:\Program Files\Some App\app.exe'
    #>
    [CmdletBinding(DefaultParameterSetName = 'Winget')]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory, ParameterSetName = 'Winget')][string]$WingetId,
        [Parameter(Mandatory, ParameterSetName = 'Winget')][string]$ExeName,
        [Parameter(Mandatory, ParameterSetName = 'Path')][string]$Path,
        [string]$Arguments, [string]$Icon, [string]$Color,
        [switch]$NoSync, [switch]$RestartSession
    )
    Assert-Elevated; Assert-SafeName $Name; Assert-Color $Color
    $app = if ($PSCmdlet.ParameterSetName -eq 'Path') {
        if (-not (Test-Path -LiteralPath $Path)) { throw "$Path does not exist." }
        $Path = Resolve-KidPath $Path
        [pscustomobject]@{ Name = $Name; WingetId = $null; ExeName = (Split-Path $Path -Leaf); Path = $Path }
    } else {
        [pscustomobject]@{ Name = $Name; WingetId = $WingetId; ExeName = $ExeName; Path = $null }
    }
    $app | Add-Member Arguments ([string]$Arguments)
    $app | Add-Member Icon (ConvertTo-KidIcon $Icon)
    $app | Add-Member Color $Color
    Install-DesktopAppIfMissing $app
    if (-not (Test-ProtectedPath $app.Path)) {
        throw "$($app.Path) is outside Program Files/Windows. The child account could replace it, so it won't be allowed."
    }
    $cfg = Read-Config
    $cfg.DesktopApps = @($cfg.DesktopApps | Where-Object Name -ne $Name) + $app
    Write-Config $cfg
    if (-not $NoSync) { Sync-KidTablet -RestartSession:$RestartSession }
}

function Find-KidPackagedApp {
    <#
    .SYNOPSIS
        Lists AUMIDs for installed packages whose package name matches.
    .EXAMPLE
        Find-KidPackagedApp -Name Paint
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Name)
    # Matches the package name or the manifest display name (Store package names are often cryptic).
    foreach ($pkg in Get-AppxPackage -AllUsers | Where-Object { -not $_.IsFramework } | Sort-Object PackageFamilyName -Unique) {
        $manifest = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
        if (-not (Test-Path $manifest)) { continue }
        $xml = [xml](Get-Content $manifest -Raw)
        $display = [string]$xml.Package.Properties.DisplayName
        if ($display -like 'ms-resource:*') { $display = '' }
        if ($pkg.Name -notlike "*$Name*" -and $display -notlike "*$Name*") { continue }
        foreach ($a in $xml.Package.Applications.Application) {
            [pscustomobject]@{ DisplayName = $display; Package = $pkg.Name; Aumid = "$($pkg.PackageFamilyName)!$($a.Id)" }
        }
    }
}

function Add-KidPackagedApp {
    <#
    .EXAMPLE
        Add-KidPackagedApp -Name 'Paint' -Aumid 'Microsoft.Paint_8wekyb3d8bbwe!App'
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidatePattern('^[^!\s]+_[a-z0-9]{13}![^!\s]+$')][string]$Aumid,
        [string]$Icon, [string]$Color,
        [switch]$NoSync, [switch]$RestartSession
    )
    Assert-Elevated; Assert-SafeName $Name; Assert-Color $Color
    $cfg = Read-Config
    $pfn = ($Aumid -split '!')[0]
    $pkg = Get-AppxPackage -AllUsers | Where-Object PackageFamilyName -eq $pfn | Select-Object -First 1
    if (-not $pkg) { throw "No installed package with family name $pfn." }
    $forKid = Get-AppxPackage -User (Get-KidSid $cfg) -ErrorAction SilentlyContinue | Where-Object PackageFamilyName -eq $pfn
    $prov   = Get-AppxProvisionedPackage -Online | Where-Object DisplayName -eq $pkg.Name
    if (-not $forKid -and -not $prov) {
        # Store apps are licensed per account; a copy from another account won't run for her.
        throw "$($pkg.Name) isn't installed in $($cfg.UserName)'s account. Use: Add-KidStoreApp -Pfn '$pfn'"
    }
    $cfg.PackagedApps = @($cfg.PackagedApps | Where-Object Name -ne $Name) +
        [pscustomobject]@{ Name = $Name; Aumid = $Aumid; Icon = (ConvertTo-KidIcon $Icon); Color = $Color }
    Write-Config $cfg
    if (-not $NoSync) { Sync-KidTablet -RestartSession:$RestartSession }
}

function Set-KidApp {
    <#
    .SYNOPSIS
        Changes an existing app's tile or launch arguments.
    .EXAMPLE
        Set-KidApp -Name 'Tux Paint' -Arguments '--fullscreen --native'
    .EXAMPLE
        Set-KidApp -Name 'Starfall' -Icon 'U+1F4DA' -Color '#2F9E44'
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$NewName, [string]$Icon, [string]$Color, [string]$Arguments,
        # A PNG, JPG, or ICO file (path or https URL) to use as the tile image.
        [string]$Image,
        [switch]$NoSync, [switch]$RestartSession
    )
    Assert-Elevated; Assert-Color $Color
    $cfg = Read-Config
    $app = @($cfg.WebApps) + @($cfg.DesktopApps) + @($cfg.PackagedApps) | Where-Object Name -eq $Name | Select-Object -First 1
    if (-not $app) { throw "No app named '$Name'. Run Get-KidApp to list them." }
    if ($Image -and $Image -notmatch '^https://') {
        if (-not (Test-Path -LiteralPath $Image -PathType Leaf)) { throw "Image not found: $Image" }
        $Image = Resolve-KidPath $Image
    }
    if ($PSBoundParameters.ContainsKey('Arguments')) {
        if ($cfg.DesktopApps -notcontains $app) { throw 'Arguments only apply to desktop apps.' }
        $app.Arguments = $Arguments
    }
    if ($Icon)    { $app.Icon  = ConvertTo-KidIcon $Icon }
    if ($Color)   { $app.Color = $Color }
    if ($NewName) {
        Assert-SafeName $NewName
        $old = Get-KidIconFile $app.Name
        $app.Name = $NewName
        if (Test-Path $old) { Move-Item $old (Get-KidIconFile $NewName) -Force }
    }
    if ($Image) {
        New-Item -ItemType Directory -Path $script:IconDir -Force | Out-Null
        $src = $Image
        if ($Image -match '^https://') {
            $src = Join-Path $script:IconDir 'custom.download'
            Invoke-WebRequest -Uri $Image -UseBasicParsing -OutFile $src
        }
        try {
            if (-not (Save-ImageAsPng $src (Get-KidIconFile $app.Name))) { throw 'Image is too small (under 24px).' }
        } finally { if ($src -ne $Image) { Remove-Item $src -Force -ErrorAction SilentlyContinue } }
    }
    Write-Config $cfg
    if (-not $NoSync) { Sync-KidTablet -RestartSession:$RestartSession }
}

function Set-KidTabletSetting {
    <#
    .EXAMPLE
        Set-KidTabletSetting -ShowTaskbar $true -RestartSession
    .EXAMPLE
        Set-KidTabletSetting -DisplayName 'Ava' -TextScalePercent 150
    .EXAMPLE
        Set-KidTabletSetting -Background (Find-KidWallpaper pony | Select-Object -First 1).Path
    #>
    [CmdletBinding()]
    param(
        [string]$DisplayName,
        [ValidateRange(100, 225)][int]$TextScalePercent,
        [bool]$ShowTaskbar,
        [bool]$AllowAllWebsites,
        [bool]$AutoAdd,
        [string[]]$AutoAddCategories,
        [ValidateRange(0, 18)][int]$AutoAddMaxAge,
        # Image file, folder of images, or https URL for the home screen background. '' removes it.
        [string]$Background,
        # Camera and microphone for her apps and allowlisted sites (default on).
        [bool]$AllowCameraMic,
        [switch]$NoSync, [switch]$RestartSession
    )
    Assert-Elevated
    $cfg = Read-Config
    foreach ($k in 'DisplayName', 'TextScalePercent', 'ShowTaskbar', 'AllowAllWebsites', 'AutoAdd', 'AutoAddCategories', 'AutoAddMaxAge', 'Background', 'AllowCameraMic') {
        if ($PSBoundParameters.ContainsKey($k)) { $cfg.$k = $PSBoundParameters[$k] }
    }
    Write-Config $cfg
    if (-not $NoSync) { Sync-KidTablet -RestartSession:$RestartSession }
}

function ConvertTo-SafeName {
    param([string]$Name)
    $bad = [IO.Path]::GetInvalidFileNameChars()
    (-join ($Name.ToCharArray() | Where-Object { $bad -notcontains $_ })).Trim()
}

function Resolve-ManifestString {
    # Turns ms-resource: references in an app manifest into the display text shown in Start.
    param($Package, [string]$Value)
    if (-not $Value) { return $null }
    if ($Value -notlike 'ms-resource:*') { return $Value }
    if (-not ('KidTablet.IndirectString' -as [type])) {
        Add-Type -Namespace KidTablet -Name IndirectString -MemberDefinition @"
[DllImport("shlwapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
public static extern int SHLoadIndirectString(string pszSource, System.Text.StringBuilder pszOutBuf, int cchOutBuf, IntPtr ppvReserved);
"@
    }
    $key = $Value.Substring(12)
    $uri = if ($key.StartsWith('//')) { "ms-resource:$key" }
           elseif ($key.Contains('/')) { "ms-resource://$($Package.Name)/$($key.TrimStart('/'))" }
           else { "ms-resource://$($Package.Name)/Resources/$key" }
    $sb = New-Object System.Text.StringBuilder 1024
    $hr = [KidTablet.IndirectString]::SHLoadIndirectString("@{$($Package.PackageFullName)? $uri}", $sb, $sb.Capacity, [IntPtr]::Zero)
    if ($hr -eq 0 -and $sb.Length -gt 0) { $sb.ToString() } else { $null }
}

function Get-KidAvailableApp {
    <#
    .SYNOPSIS
        Lists apps installed on this device that are not in her config yet.
    .DESCRIPTION
        Store apps: Store-signed packages installed for any user, excluding frameworks
        and apps that shipped with Windows. Desktop apps: all-users Start menu
        shortcuts that point into Program Files, excluding Windows components.
    .EXAMPLE
        Get-KidAvailableApp
    .EXAMPLE
        Get-KidAvailableApp | Add-KidAvailableApp -RestartSession
    .EXAMPLE
        Get-KidAvailableApp | Where-Object Name -in 'Duolingo ABC', 'Lego Builder' | Add-KidAvailableApp
    #>
    [CmdletBinding()]
    param(
        # Include apps published by Microsoft (Office, OneDrive, and so on). Skipped by default.
        [switch]$IncludeMicrosoft,
        # Include apps previously removed with Remove-KidApp.
        [switch]$IncludeIgnored
    )
    Assert-Elevated
    $cfg = Read-Config
    $ignored    = if ($IncludeIgnored) { @() } else { @($cfg.IgnoredApps) }
    $haveAumids = @($cfg.PackagedApps | ForEach-Object { $_.Aumid }) + $ignored
    $havePaths  = @($cfg.DesktopApps  | ForEach-Object { $_.Path } | Where-Object { $_ }) + $ignored

    # Store apps
    $inbox = @(Get-AppxProvisionedPackage -Online | ForEach-Object { $_.DisplayName })
    $pkgs = Get-AppxPackage -AllUsers -PackageTypeFilter Main |
        Where-Object { $_.SignatureKind -eq 'Store' -and -not $_.IsFramework -and -not $_.NonRemovable -and
                       $_.InstallLocation -and $inbox -notcontains $_.Name -and
                       ($IncludeMicrosoft -or $_.Publisher -notlike 'CN=Microsoft Corporation*') } |
        Sort-Object PackageFamilyName -Unique
    foreach ($pkg in $pkgs) {
        $manifest = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
        if (-not (Test-Path $manifest)) { continue }
        $xml = [xml](Get-Content $manifest -Raw)
        $pkgName = Resolve-ManifestString $pkg ([string]$xml.Package.Properties.DisplayName)
        foreach ($a in $xml.Package.Applications.Application) {
            $ve = Get-VisualElements $a
            if ($ve -and $ve.GetAttribute('AppListEntry') -eq 'none') { continue }
            $aumid = "$($pkg.PackageFamilyName)!$($a.Id)"
            if ($haveAumids -contains $aumid) { continue }
            $name = if ($ve) { Resolve-ManifestString $pkg $ve.GetAttribute('DisplayName') }
            if (-not $name) { $name = if ($pkgName) { $pkgName } else { $pkg.Name } }
            [pscustomobject]@{ Type = 'Packaged'; Name = (ConvertTo-SafeName $name); Target = $aumid; Arguments = $null }
        }
    }

    # Desktop apps
    $skip = @("$env:SystemRoot\*", "$env:ProgramFiles\Windows *", "${env:ProgramFiles(x86)}\Windows *",
              '*\Common Files\*', '*\Microsoft\Edge*', '*\Internet Explorer\*', "$script:HomeDir\*")
    $startRoot = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'
    $shell = New-Object -ComObject WScript.Shell
    $seen = @{}
    foreach ($f in Get-ChildItem $startRoot -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue) {
        if ($f.DirectoryName -eq $script:ShortcutDir -or $f.BaseName -match 'uninstall|readme|help|website') { continue }
        $lnk = $shell.CreateShortcut($f.FullName)
        $target = $lnk.TargetPath
        if (-not $target -or $target -notlike '*.exe' -or -not (Test-Path $target)) { continue }
        if (-not (Test-ProtectedPath $target)) { continue }
        if (@($skip | Where-Object { $target -like $_ }).Count) { continue }
        if ($havePaths -contains $target -or $seen.ContainsKey($target)) { continue }
        $seen[$target] = $true
        if (-not $IncludeMicrosoft -and (Get-Item $target).VersionInfo.CompanyName -like 'Microsoft*') { continue }
        [pscustomobject]@{ Type = 'Desktop'; Name = (ConvertTo-SafeName $f.BaseName); Target = $target; Arguments = $lnk.Arguments }
    }
}

function Add-KidAvailableApp {
    <#
    .SYNOPSIS
        Adds apps from Get-KidAvailableApp, then syncs once.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]$App,
        [switch]$RestartSession,
        # Queue Store apps without starting the install (used by auto-add).
        [switch]$DeferStoreInstall
    )
    begin { $added = 0; $queued = 0; $cfg = Read-Config }
    process {
        try {
            switch ($App.Type) {
                'Packaged' {
                    $pfn = ($App.Target -split '!')[0]
                    if (Test-RegisteredForKid $cfg $pfn) { Add-KidPackagedApp -Name $App.Name -Aumid $App.Target -NoSync }
                    else {
                        Add-KidStoreApp -Pfn $pfn -Name $App.Name -QueueOnly
                        $queued++
                        return
                    }
                }
                'Desktop'  { Add-KidDesktopApp -Name $App.Name -Path $App.Target -Arguments ([string]$App.Arguments) -NoSync }
                default    { throw "Unknown app type '$($App.Type)'." }
            }
            Write-Host "Added $($App.Name)"
            $added++
        } catch {
            Write-Warning "$($App.Name): $($_.Exception.Message)"
        }
    }
    end {
        if ($queued -and -not $DeferStoreInstall) { Start-KidStoreInstall }       # its finish step syncs everything
        elseif ($added) { Sync-KidTablet -RestartSession:$RestartSession }
        elseif (-not $queued) { Write-Host 'Nothing added.' }
    }
}

function Write-KidEvent {
    # Application event log, source KidTablet: 1001 = apps added, 1002 = apps waiting for approval.
    param([int]$Id, [ValidateSet('Information', 'Warning', 'Error')][string]$Type, [string]$Message)
    try {
        if (-not [Diagnostics.EventLog]::SourceExists($script:EventSource)) {
            New-EventLog -LogName Application -Source $script:EventSource
        }
        Write-EventLog -LogName Application -Source $script:EventSource -EventId $Id -EntryType $Type -Message $Message
    } catch { Write-Warning "Could not write event log entry: $($_.Exception.Message)" }
}

function Get-StoreProduct {
    # Microsoft Store catalog lookup by Store ID or package family name. The service is
    # not officially documented, so any failure returns $null.
    param([string]$Id, [string]$Pfn)
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $q = 'market=US&languages=en-US&fieldsTemplate=Details'
        $uri = if ($Id) { "https://displaycatalog.mp.microsoft.com/v7.0/products/$([uri]::EscapeDataString($Id))?$q" }
               else { "https://displaycatalog.mp.microsoft.com/v7.0/products/lookup?alternateId=PackageFamilyName&value=$([uri]::EscapeDataString($Pfn))&$q" }
        $r = Invoke-RestMethod -Uri $uri -UseBasicParsing -TimeoutSec 20
        $p = if ($r.Product) { $r.Product } else { @($r.Products)[0] }
        if (-not $p) { return $null }
        $cats = @()
        if ($p.Properties.Category)   { $cats += [string]$p.Properties.Category }
        if ($p.Properties.Categories) { $cats += @($p.Properties.Categories | ForEach-Object { [string]$_ }) }
        $esrb = @{ 'EC' = 3; 'E' = 6; 'E10' = 10; 'T' = 13; 'M' = 17; 'AO' = 18 }
        $ages = @()
        foreach ($cr in @($p.MarketProperties | ForEach-Object { $_.ContentRatings } | Where-Object { $_ })) {
            $rid = [string]$cr.RatingId
            if ($rid -match ':(\d{1,2})\+?$') { $ages += [int]$Matches[1] }
            elseif ($rid -match '^ESRB:(\w+)$' -and $esrb.ContainsKey($Matches[1])) { $ages += $esrb[$Matches[1]] }
        }
        $outPfn = [string]$p.Properties.PackageFamilyName
        if (-not $outPfn) { $outPfn = $Pfn }
        [pscustomobject]@{
            ProductId  = [string]$p.ProductId
            Pfn        = $outPfn
            Title      = [string](@($p.LocalizedProperties)[0].ProductTitle)
            Categories = @($cats | Where-Object { $_ } | Select-Object -Unique)
            MinAge     = if ($ages) { ($ages | Measure-Object -Maximum).Maximum } else { $null }   # strictest rating
        }
    } catch { $null }
}

function Get-StoreAppInfo {
    param([string]$PackageFamilyName)
    Get-StoreProduct -Pfn $PackageFamilyName
}

function Invoke-KidAutoAdd {
    <#
    .SYNOPSIS
        Adds newly installed kid apps automatically; logs everything else for approval.
    .DESCRIPTION
        Runs every 15 minutes and at startup (task KidTablet-AutoAdd). Store apps in an
        allowed category and at or under the max age rating are added. Desktop apps,
        other Store apps, and failed catalog lookups are logged to the Application event
        log (source KidTablet, event 1002) and left for you to add or hide.
    .PARAMETER Preview
        Show how each available app would be handled, without changing anything.
    #>
    [CmdletBinding()]
    param([switch]$Preview)
    Assert-Elevated
    $cfg = Read-Config
    if (-not $cfg.AutoAdd -and -not $Preview) { return }

    $toAdd = @(); $waiting = @()
    foreach ($app in @(Get-KidAvailableApp)) {
        $reason = $null
        if ($app.Type -eq 'Packaged') {
            $info = Get-StoreAppInfo -PackageFamilyName ($app.Target -split '!')[0]
            if (-not $info) { $reason = 'not found in the Store catalog' }
            else {
                $catOk = @($info.Categories | Where-Object { $c = $_; @($cfg.AutoAddCategories | Where-Object { $c -like $_ }).Count }).Count -gt 0
                $ageOk = $null -ne $info.MinAge -and $info.MinAge -le $cfg.AutoAddMaxAge
                if (-not $catOk) { $reason = "category: $($info.Categories -join ', ')" }
                elseif (-not $ageOk) { $reason = if ($null -eq $info.MinAge) { 'no age rating' } else { "rated $($info.MinAge)+" } }
            }
        } else {
            $reason = 'desktop app'
        }
        if ($reason) { $waiting += [pscustomobject]@{ Type = $app.Type; Name = $app.Name; Target = $app.Target; Reason = $reason } }
        else { $toAdd += $app }
    }

    if ($Preview) {
        $toAdd   | ForEach-Object { [pscustomobject]@{ Action = 'Add';  Type = $_.Type; Name = $_.Name; Reason = '' } }
        $waiting | ForEach-Object { [pscustomobject]@{ Action = 'Wait'; Type = $_.Type; Name = $_.Name; Reason = $_.Reason } }
        return
    }

    if ($toAdd) {
        $toAdd | Add-KidAvailableApp -DeferStoreInstall
        Write-KidEvent -Id 1001 -Type Information -Message ("Added to the kid tablet:`r`n" + (($toAdd | ForEach-Object { $_.Name }) -join "`r`n"))
    }

    $cfg = Read-Config
    $new = @($waiting | Where-Object { $cfg.NotifiedPending -notcontains $_.Target })
    if ($new) {
        Write-KidEvent -Id 1002 -Type Warning -Message ("Waiting for approval on the kid tablet:`r`n" +
            (($new | ForEach-Object { "$($_.Name) ($($_.Reason))" }) -join "`r`n") +
            "`r`n`r`nAdd: Get-KidAvailableApp | Where-Object Name -eq '<name>' | Add-KidAvailableApp" +
            "`r`nHide: Get-KidAvailableApp | Where-Object Name -eq '<name>' | Hide-KidAvailableApp")
        $cfg.NotifiedPending = @(@($cfg.NotifiedPending) + @($new | ForEach-Object { $_.Target }) | Select-Object -Unique)
        Write-Config $cfg
    }

    # Store installs pause the kiosk, so only start one when she isn't using the tablet.
    $cfg = Read-Config
    if ($cfg.StoreQueue.Count -and -not $cfg.StoreInstallStarted -and (Test-KidIdle $cfg)) { Start-KidStoreInstall }
}

function Hide-KidAvailableApp {
    <# Stops an available app from being suggested or logged again. #>
    [CmdletBinding()]
    param([Parameter(Mandatory, ValueFromPipeline)]$App)
    begin { $cfg = Read-Config; $hidden = @() }
    process { $hidden += $App.Target; Write-Host "Hidden: $($App.Name)" }
    end {
        $cfg.IgnoredApps = @(@($cfg.IgnoredApps) + $hidden | Select-Object -Unique)
        Write-Config $cfg
    }
}

function Register-KidAutoAddTask {
    if (-not (Test-Path $script:InstalledModule)) { throw "Module not found at $script:InstalledModule." }
    $cmd = "Import-Module '$script:InstalledModule' -Force; Invoke-KidAutoAdd"
    $action    = New-ScheduledTaskAction -Execute 'powershell.exe' `
                   -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$cmd`""
    $triggers  = @(
        (New-ScheduledTaskTrigger -AtStartup),
        (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15))
    )
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
                   -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskName $script:AutoAddTask -Action $action -Trigger $triggers `
        -Principal $principal -Settings $settings -Force | Out-Null
}

function Read-JsonArray {
    # Windows PowerShell 5.1's ConvertFrom-Json emits a JSON array as one object;
    # piping it through ForEach-Object yields the items.
    param([string]$Path)
    if (-not (Test-Path $Path)) { return @() }
    $json = Get-Content $Path -Raw | ConvertFrom-Json
    @($json | ForEach-Object { $_ })
}

function Test-RegisteredForKid {
    param($Config, [string]$Pfn)
    [bool](Get-AppxPackage -User (Get-KidSid $Config) -ErrorAction SilentlyContinue | Where-Object PackageFamilyName -eq $Pfn)
}

function Test-KidIdle {
    # True when she's signed out, or the home screen reports no input for $Minutes.
    param($Config, [int]$Minutes = 10)
    $signedIn = @(quser.exe 2>$null) | Where-Object { $_ -match "^\s*>?$([regex]::Escape($Config.UserName))\s" }
    if (-not $signedIn) { return $true }
    $prof = Get-CimInstance Win32_UserProfile -Filter "SID='$(Get-KidSid $Config)'"
    if (-not $prof) { return $false }
    $f = Join-Path $prof.LocalPath 'AppData\Local\KidTablet\idle.txt'
    if (-not (Test-Path $f)) { return $false }
    $item = Get-Item $f
    if (((Get-Date) - $item.LastWriteTime).TotalMinutes -gt 3) { return $false }   # home screen not reporting
    [int](Get-Content $f -Raw) -ge ($Minutes * 60)
}

function Add-KidStoreApp {
    <#
    .SYNOPSIS
        Installs Microsoft Store apps into her account and adds their tiles.
    .DESCRIPTION
        Store apps are licensed per account, so they must be installed while signed in
        as her. This queues the apps, then (unless -QueueOnly) runs Start-KidStoreInstall:
        the kiosk is paused for a few minutes while her account installs them, then
        tiles are added and the kiosk is restored automatically.
    .EXAMPLE
        Add-KidStoreApp -StoreId 9NBLGGH68DHJ, 9NL4MGG11RB6
    .EXAMPLE
        Add-KidStoreApp -Pfn 'ScratchFoundation.ScratchDesktop_wmbdy4q6dbx4t' -Name 'Scratch 3'
    .EXAMPLE
        Find-KidStoreApp 'toca boca' | Where-Object Age -eq '3+' | Add-KidStoreApp
    #>
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipelineByPropertyName)][string[]]$StoreId,
        [string[]]$Pfn,
        [string]$Name, [string]$Icon, [string]$Color,
        [switch]$QueueOnly
    )
    begin { $ids = @() }
    process { $ids += @($StoreId) }
    end {
    Assert-Elevated; Assert-Color $Color
    $items = @(@($ids | Where-Object { $_ } | ForEach-Object { @{ Id = $_ } }) +
               @($Pfn | Where-Object { $_ } | ForEach-Object { @{ Pfn = $_ } }))
    if (-not $items) { throw 'Give -StoreId or -Pfn.' }
    if ($Name -and $items.Count -gt 1) { throw '-Name applies to a single app.' }
    $cfg = Read-Config
    $queued = 0
    foreach ($it in $items) {
        $p = if ($it.Id) { Get-StoreProduct -Id $it.Id } else { Get-StoreProduct -Pfn $it.Pfn }
        if (-not $p -or -not $p.ProductId -or -not $p.Pfn) {
            Write-Warning "$($it.Id)$($it.Pfn): not found in the Store catalog."
            continue
        }
        $n = ConvertTo-SafeName $(if ($Name) { $Name } elseif ($p.Title) { $p.Title } else { $p.Pfn.Split('_')[0] })
        $cfg.StoreQueue = @(@($cfg.StoreQueue | Where-Object { $_.Id -ne $p.ProductId }) +
            [pscustomobject]@{ Id = $p.ProductId; Pfn = $p.Pfn; Name = $n; Icon = (ConvertTo-KidIcon $Icon); Color = $Color })
        Write-Host "Queued $n ($($p.ProductId))"
        $queued++
    }
    Write-Config $cfg
    if ($queued -and -not $QueueOnly) { Start-KidStoreInstall }
    }
}

function Find-KidStoreApp {
    <#
    .SYNOPSIS
        Searches the Microsoft Store by name, with each result's category and age rating.
    .EXAMPLE
        Find-KidStoreApp 'toca boca'
    .EXAMPLE
        Find-KidStoreApp 'scratch' | Select-Object -First 1 | Add-KidStoreApp
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory, Position = 0)][string]$Query, [int]$First = 10)
    $wg = Get-WingetPath
    if (-not $wg) { throw 'winget was not found on this device.' }
    $lines = @(& $wg search $Query --source msstore --accept-source-agreements 2>$null |
               ForEach-Object { ($_ -split "`r")[-1] })   # drop progress-spinner text
    $hdr = $lines | Where-Object { $_ -match '^\s*Name\s+Id\s' } | Select-Object -First 1
    if (-not $hdr) { Write-Host 'No results.'; return }
    $idCol  = $hdr.IndexOf('Id')
    $verCol = $hdr.IndexOf('Version')
    $rows = $lines[([array]::IndexOf($lines, $hdr) + 2)..($lines.Count - 1)]
    $found = foreach ($l in $rows) {
        if ($l.Length -le $idCol) { continue }
        $id = $l.Substring($idCol).Trim().Split(' ')[0]
        if ($verCol -gt $idCol -and $l.Length -gt $idCol) {
            $id = $l.Substring($idCol, [Math]::Min($verCol, $l.Length) - $idCol).Trim()
        }
        if ($id -match '^[0-9A-Z]{12}$') { [pscustomobject]@{ Name = $l.Substring(0, $idCol).Trim(); Id = $id } }
    }
    foreach ($r in @($found | Select-Object -First $First)) {
        $p = Get-StoreProduct -Id $r.Id
        [pscustomobject]@{
            Name     = if ($p -and $p.Title) { $p.Title } else { $r.Name }
            StoreId  = $r.Id
            Category = if ($p) { $p.Categories -join ', ' } else { '' }
            Age      = if ($p -and $null -ne $p.MinAge) { "$($p.MinAge)+" } else { '' }
        }
    }
}

function Start-KidStoreInstall {
    <#
    .SYNOPSIS
        Installs queued Store apps into her account.
    .DESCRIPTION
        Pauses the kiosk, registers a one-time task that runs as her at sign-in, and
        signs her out; auto sign-in brings her back without the kiosk and the task
        installs the apps. Task KidTablet-StoreFinish (SYSTEM, every minute) then adds
        tiles for what installed, restores the kiosk, and signs her back in. If nothing
        is reported within 30 minutes the kiosk is restored anyway.
        She is not restricted while this runs, so start it when she isn't using the tablet.
    #>
    [CmdletBinding()]
    param()
    Assert-Elevated
    $cfg = Read-Config
    if (-not $cfg.StoreQueue.Count) { Write-Host 'No Store apps queued.'; return }
    if ($cfg.StoreInstallStarted -and ((Get-Date) - [datetime]$cfg.StoreInstallStarted).TotalMinutes -lt 30) {
        Write-Host 'A Store install is already in progress.'; return
    }
    $user = "$env:COMPUTERNAME\$($cfg.UserName)"

    New-Item -ItemType Directory -Path $script:HomeDir -Force | Out-Null
    ConvertTo-Json -InputObject @($cfg.StoreQueue | ForEach-Object { [pscustomobject]@{ Id = $_.Id } }) |
        Set-Content -Path $script:StoreQueueFile -Encoding UTF8
    $prof = Get-CimInstance Win32_UserProfile -Filter "SID='$(Get-KidSid $cfg)'"
    if ($prof) { Remove-Item (Join-Path $prof.LocalPath 'AppData\Local\KidTablet\store-result.json') -Force -ErrorAction SilentlyContinue }

    $cfg.StoreInstallStarted = (Get-Date).ToString('o')
    Write-Config $cfg

    Write-Host 'Pausing the kiosk...'
    try { Set-KidKiosk -Mode remove }
    catch {
        $cfg.StoreInstallStarted = ''
        Write-Config $cfg
        throw "Couldn't pause the kiosk, so nothing was started. $($_.Exception.Message)"
    }

    # Runs as her, in her session, at her next sign-in.
    $cmd = "Import-Module '$script:InstalledModule' -Force; Invoke-KidStoreQueue"
    Register-ScheduledTask -TaskName $script:StoreInstallTask -Force `
        -Action (New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$cmd`"") `
        -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) `
        -Principal (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited) `
        -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 45)) |
        Out-Null

    # Finishes the job as SYSTEM once her session reports back.
    $cmd2 = "Import-Module '$script:InstalledModule' -Force; Complete-KidStoreInstall"
    Register-ScheduledTask -TaskName $script:StoreFinishTask -Force `
        -Action (New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$cmd2`"") `
        -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)) `
        -Principal (New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest) `
        -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
                   -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)) |
        Out-Null

    Write-KidEvent -Id 1004 -Type Information -Message ("Installing Store apps into her account:`r`n" +
        (($cfg.StoreQueue | ForEach-Object { "$($_.Name) ($($_.Id))" }) -join "`r`n"))
    Restart-KidSession
    Write-Host 'Her account installs the apps at sign-in (a few minutes). Tiles are added and the kiosk restored automatically.'
    Write-Host "If she isn't signed in, sign out of your account or reboot to start it."
}

function Invoke-KidStoreQueue {
    <# Runs as her (task KidTablet-StoreInstall) while the kiosk is paused. Not for interactive use. #>
    [CmdletBinding()]
    param()
    $out = Join-Path $env:LOCALAPPDATA 'KidTablet'
    New-Item -ItemType Directory -Path $out -Force | Out-Null
    $resultFile = Join-Path $out 'store-result.json'
    $queue = Read-JsonArray $script:StoreQueueFile

    # winget arrives with App Installer, which registers during a new account's first sign-in.
    $wg = $null
    $deadline = (Get-Date).AddMinutes(10)
    while ((Get-Date) -lt $deadline) {
        $c = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'
        if (Test-Path $c) { $wg = $c; break }
        Start-Sleep -Seconds 10
    }

    $results = foreach ($q in $queue) {
        if (-not $wg) { [pscustomobject]@{ Id = $q.Id; ExitCode = -1; Note = 'winget not available in her account' }; continue }
        & $wg install --id $q.Id --source msstore --accept-package-agreements --accept-source-agreements --disable-interactivity *> (Join-Path $out "store-$($q.Id).log")
        [pscustomobject]@{ Id = $q.Id; ExitCode = $LASTEXITCODE; Note = '' }
    }
    ConvertTo-Json -InputObject @($results) | Set-Content -Path $resultFile -Encoding UTF8
}

function Complete-KidStoreInstall {
    <# Runs as SYSTEM every minute during a Store install (task KidTablet-StoreFinish). #>
    [CmdletBinding()]
    param()
    Assert-Elevated
    $cfg = Read-Config
    $cleanup = {
        foreach ($t in $script:StoreInstallTask, $script:StoreFinishTask) {
            Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
        }
        Remove-Item $script:StoreQueueFile -Force -ErrorAction SilentlyContinue
    }
    if (-not $cfg.StoreQueue.Count -or -not $cfg.StoreInstallStarted) { & $cleanup; return }

    $sid  = Get-KidSid $cfg
    $prof = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'"
    $resultFile = if ($prof) { Join-Path $prof.LocalPath 'AppData\Local\KidTablet\store-result.json' }
    $results = @()
    if ($resultFile -and (Test-Path $resultFile)) {
        $results = Read-JsonArray $resultFile
        Remove-Item $resultFile -Force
    } elseif (((Get-Date) - [datetime]$cfg.StoreInstallStarted).TotalMinutes -lt 30) {
        return   # still working
    }

    # Add a tile for every queued app that is now installed in her account.
    $hers = @(Get-AppxPackage -User $sid -ErrorAction SilentlyContinue)
    $added = @(); $failed = @()
    foreach ($q in $cfg.StoreQueue) {
        $pkg = $hers | Where-Object PackageFamilyName -eq $q.Pfn | Select-Object -First 1
        $aumid = $null
        if ($pkg) {
            $xml = [xml](Get-Content (Join-Path $pkg.InstallLocation 'AppxManifest.xml') -Raw)
            foreach ($a in @($xml.Package.Applications.Application)) {
                $ve = Get-VisualElements $a
                if ($ve -and $ve.GetAttribute('AppListEntry') -eq 'none') { continue }
                $aumid = "$($q.Pfn)!$($a.Id)"; break
            }
        }
        if (-not $aumid) {
            $r = $results | Where-Object Id -eq $q.Id | Select-Object -First 1
            $why = if (-not $results) { 'no report from her session within 30 minutes' } elseif ($r) { "winget exit $($r.ExitCode) $($r.Note)".Trim() } else { 'no result' }
            $failed += "$($q.Name) ($($q.Id)): $why"
            continue
        }
        $cfg.PackagedApps = @(@($cfg.PackagedApps | Where-Object { $_.Aumid -ne $aumid -and $_.Name -ne $q.Name }) +
            [pscustomobject]@{ Name = $q.Name; Aumid = $aumid; Icon = $q.Icon; Color = $q.Color })
        $cfg.IgnoredApps = @($cfg.IgnoredApps | Where-Object { $_ -ne $aumid })
        $added += $q.Name
    }
    $cfg.StoreQueue = @()
    $cfg.StoreInstallStarted = ''
    Write-Config $cfg
    & $cleanup

    if ($added)  { Write-KidEvent -Id 1003 -Type Information -Message ("Installed in her account:`r`n" + ($added -join "`r`n")) }
    if ($failed) {
        Write-KidEvent -Id 1005 -Type Warning -Message ("Store install failed:`r`n" + ($failed -join "`r`n") +
            "`r`n`r`nPer-app winget logs: C:\Users\$($cfg.UserName)\AppData\Local\KidTablet\store-<id>.log")
    }
    Sync-KidTablet -RestartSession   # restores the kiosk with the new tiles
}

function Repair-KidStoreApp {
    <#
    .SYNOPSIS
        Reinstalls Store apps into her own account (for apps that were copied from another account).
    .EXAMPLE
        Repair-KidStoreApp
    .EXAMPLE
        Repair-KidStoreApp -Name 'Scratch 3'
    #>
    [CmdletBinding()]
    param([string[]]$Name, [switch]$QueueOnly)
    Assert-Elevated
    $cfg = Read-Config
    $targets = @($cfg.PackagedApps | Where-Object {
        ($_.Aumid -split '!')[0] -notlike 'Microsoft.*' -and (-not $Name -or $Name -contains $_.Name) })
    if (-not $targets) { Write-Host 'No Store apps to repair.'; return }
    foreach ($app in $targets) {
        $pfn  = ($app.Aumid -split '!')[0]
        $base = $pfn.Substring(0, $pfn.LastIndexOf('_'))
        Write-Host "Removing $($app.Name) from all accounts and provisioning..."
        Get-AppxProvisionedPackage -Online | Where-Object DisplayName -eq $base |
            ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -AllUsers -ErrorAction SilentlyContinue | Out-Null }
        Get-AppxPackage -AllUsers | Where-Object PackageFamilyName -eq $pfn | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue
        $cfg = Read-Config
        $cfg.PackagedApps = @($cfg.PackagedApps | Where-Object Aumid -ne $app.Aumid)
        Write-Config $cfg
        $extra = @{}
        if ($app.Icon)  { $extra.Icon  = $app.Icon }
        if ($app.Color) { $extra.Color = $app.Color }
        Add-KidStoreApp -Pfn $pfn -Name $app.Name -QueueOnly @extra
    }
    if (-not $QueueOnly) { Start-KidStoreInstall }
}

function Remove-KidApp {
    <#
    .PARAMETER Uninstall
        Also uninstall the app: a winget-installed desktop app, or a Store app (removed
        from every account and from provisioning). Apps that ship with Windows are left installed.
    .EXAMPLE
        Remove-KidApp -Name 'Master of Typing' -Uninstall
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Name, [switch]$Uninstall, [switch]$NoSync, [switch]$RestartSession)
    Assert-Elevated
    $cfg = Read-Config
    $desktop = $cfg.DesktopApps | Where-Object Name -eq $Name
    $store   = $cfg.PackagedApps | Where-Object { $_.Name -eq $Name -and ($_.Aumid -split '!')[0] -notlike 'Microsoft.*' }
    # Removed apps are not suggested again by Get-KidAvailableApp.
    $targets = @($desktop | ForEach-Object { $_.Path } | Where-Object { $_ }) +
               @($cfg.PackagedApps | Where-Object Name -eq $Name | ForEach-Object { $_.Aumid })
    $cfg.IgnoredApps = @(@($cfg.IgnoredApps) + $targets | Select-Object -Unique)
    $before = $cfg.WebApps.Count + $cfg.DesktopApps.Count + $cfg.PackagedApps.Count
    $cfg.WebApps      = @($cfg.WebApps      | Where-Object Name -ne $Name)
    $cfg.DesktopApps  = @($cfg.DesktopApps  | Where-Object Name -ne $Name)
    $cfg.PackagedApps = @($cfg.PackagedApps | Where-Object Name -ne $Name)
    if ($before -eq ($cfg.WebApps.Count + $cfg.DesktopApps.Count + $cfg.PackagedApps.Count)) {
        throw "No app named '$Name'. Run Get-KidApp to list them."
    }
    Write-Config $cfg
    if ($Uninstall -and $desktop.WingetId) {
        Invoke-Winget @('uninstall', '--id', $desktop.WingetId, '-e', '--silent', '--scope', 'machine')
    }
    if ($Uninstall -and $store) {
        $pfn  = ($store.Aumid -split '!')[0]
        $base = $pfn.Substring(0, $pfn.LastIndexOf('_'))
        Get-AppxProvisionedPackage -Online | Where-Object DisplayName -eq $base |
            ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -AllUsers -ErrorAction SilentlyContinue | Out-Null }
        Get-AppxPackage -AllUsers | Where-Object PackageFamilyName -eq $pfn | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue
        Write-Host "Uninstalled $Name from every account."
    }
    if (-not $NoSync) { Sync-KidTablet -RestartSession:$RestartSession }
}

function Add-KidAllowedDomain {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string[]]$Domain, [switch]$NoSync)
    Assert-Elevated
    foreach ($d in $Domain) { if ($d -notmatch '^[a-z0-9.-]+\.[a-z]{2,}$') { throw "'$d' is not a bare domain (example: getepic.com)." } }
    $cfg = Read-Config
    $cfg.AllowedDomains = @(@($cfg.AllowedDomains) + ($Domain | ForEach-Object { $_.ToLowerInvariant() }) | Select-Object -Unique)
    Write-Config $cfg
    if (-not $NoSync) { Sync-KidTablet }
}

function Remove-KidAllowedDomain {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string[]]$Domain, [switch]$NoSync)
    Assert-Elevated
    $cfg = Read-Config
    $cfg.AllowedDomains = @($cfg.AllowedDomains | Where-Object { $Domain -notcontains $_ })
    Write-Config $cfg
    if (-not $NoSync) { Sync-KidTablet }
}

# ---------------------------------------------------------------------------
# Public: install / uninstall (interactive, run once by an admin)
# ---------------------------------------------------------------------------

function Install-KidTablet {
    [CmdletBinding()]
    param(
        [string]$UserName = 'Kid',
        [string]$FullName,
        [bool]$AutoLogon = $true,
        [ValidateRange(100, 225)][int]$TextScalePercent = 125,
        [switch]$AllowAllWebsites,
        [switch]$ResetConfig,
        [securestring]$Password,
        [switch]$GeneratePassword
    )
    Assert-Elevated
    Assert-KioskSupported
    Initialize-DataDir

    if ($ResetConfig -or -not (Test-Path $script:ConfigPath)) {
        Write-Config (New-DefaultConfig -UserName $UserName -TextScalePercent $TextScalePercent -AllowAllWebsites $AllowAllWebsites.IsPresent)
    } else {
        # Keep existing app lists. Only override settings passed explicitly.
        $cfg = Read-Config
        if ($PSBoundParameters.ContainsKey('UserName'))         { $cfg.UserName = $UserName }
        if ($PSBoundParameters.ContainsKey('TextScalePercent')) { $cfg.TextScalePercent = $TextScalePercent }
        if ($PSBoundParameters.ContainsKey('AllowAllWebsites')) { $cfg.AllowAllWebsites = $AllowAllWebsites.IsPresent }
        Write-Config $cfg
    }
    $cfg = Read-Config
    if ($FullName) { $cfg.DisplayName = $FullName } else { $FullName = $cfg.DisplayName }
    Write-Config $cfg

    # Account
    # With auto sign-in nobody types her password, so a random one is fine and
    # keeps it out of RMM script parameters and logs.
    $password = if ($Password) { $Password }
                elseif ($GeneratePassword -or (Test-IsSystem)) { New-RandomPassword }
                else { Read-Host "Password for '$($cfg.UserName)' (stored for auto sign-in)" -AsSecureString }
    if (Get-LocalUser -Name $cfg.UserName -ErrorAction SilentlyContinue) {
        Set-LocalUser -Name $cfg.UserName -Password $password -PasswordNeverExpires $true
    } else {
        New-LocalUser -Name $cfg.UserName -FullName $FullName -Password $password `
            -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
    }
    try { Add-LocalGroupMember    -SID 'S-1-5-32-545' -Member $cfg.UserName -ErrorAction Stop } catch { }   # already a member
    try { Remove-LocalGroupMember -SID 'S-1-5-32-544' -Member $cfg.UserName -ErrorAction Stop } catch { }   # not an admin

    # Profile, so per-user settings can be written before first sign-in
    $sid = Get-KidSid $cfg
    if (Test-IsSystem) {
        # Windows does not allow -Credential process launches from SYSTEM.
        # The logon task applies her settings at first sign-in instead.
        Write-Host 'Running as SYSTEM: her profile is created at first sign-in.'
    } elseif (-not (Get-CimInstance Win32_UserProfile -Filter "SID='$sid'")) {
        Write-Host 'Creating the child profile...'
        $cred = [pscredential]::new("$env:COMPUTERNAME\$($cfg.UserName)", $password)
        Start-Process -FilePath "$env:SystemRoot\System32\cmd.exe" -ArgumentList '/c', 'exit' `
            -Credential $cred -LoadUserProfile -WorkingDirectory "$env:SystemRoot\System32" -Wait
    }

    # Auto sign-in
    if ($AutoLogon) {
        $plain = [System.Net.NetworkCredential]::new('', $password).Password
        Set-RegValue $script:WinlogonKey 'AutoAdminLogon'    '1'               String
        Set-RegValue $script:WinlogonKey 'DefaultUserName'   $cfg.UserName     String
        Set-RegValue $script:WinlogonKey 'DefaultDomainName' $env:COMPUTERNAME String
        Set-RegValue $script:WinlogonKey 'DefaultPassword'   $plain            String
        Remove-Variable plain
    }

    # Widgets: the kiosk blocks the widget board at her sign-in, which shows a
    # "blocked by your administrator" popup. Turn the feature off for the device.
    # Some Windows 11 builds protect this setting, so it is best-effort.
    try { Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Dsh' 'AllowNewsAndInterests' 0 }
    catch { Write-Warning "Couldn't turn off Widgets ($($_.Exception.Message)). The 'blocked by your administrator' popup at her sign-in may continue." }

    # Waking from sleep goes straight back to her session. She has a random
    # password, so a sign-in prompt at wake would lock her out.
    & powercfg.exe /SETACVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK 0
    & powercfg.exe /SETDCVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK 0
    & powercfg.exe /SETACTIVE SCHEME_CURRENT

    # Desktop apps
    foreach ($app in $cfg.DesktopApps) {
        try { Install-DesktopAppIfMissing $app } catch { Write-Warning $_.Exception.Message }
    }
    Write-Config $cfg

    Register-KidLogonTask -Config $cfg
    Register-KidAutoAddTask
    Sync-KidTablet
    Write-Host ''
    Write-Host "Done. Reboot to sign in as '$($cfg.UserName)'. Hold Shift while signing out to reach an admin account." -ForegroundColor Green
}

function Uninstall-KidTablet {
    [CmdletBinding()]
    param()
    Assert-Elevated
    Set-KidKiosk -Mode remove
    Unregister-ScheduledTask -TaskName $script:LogonTask -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $script:AutoAddTask -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $script:StoreInstallTask -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $script:StoreFinishTask -Confirm:$false -ErrorAction SilentlyContinue
    Set-RegValue $script:WinlogonKey 'AutoAdminLogon' '0' String
    Remove-ItemProperty -Path $script:WinlogonKey -Name 'DefaultPassword' -ErrorAction SilentlyContinue
    Remove-Item $script:ShortcutDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $script:HomeDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Kiosk, logon task, and auto sign-in removed. The child account, its Edge policies, and config.json remain.'
}

Export-ModuleMember -Function `
    Install-KidTablet, Uninstall-KidTablet, Sync-KidTablet, Sync-KidUserSettings, Complete-KidSignIn, Restart-KidSession, Invoke-KidKioskApply,
    Invoke-KidAutoAdd, Hide-KidAvailableApp, Repair-KidStoreApp,
    Add-KidStoreApp, Find-KidStoreApp, Find-KidWallpaper, Add-KidLocalApp, Start-KidStoreInstall, Invoke-KidStoreQueue, Complete-KidStoreInstall,
    Get-KidTabletConfig, Get-KidApp, Add-KidWebApp, Add-KidDesktopApp, Find-KidPackagedApp,
    Add-KidPackagedApp, Get-KidAvailableApp, Add-KidAvailableApp, Set-KidApp, Set-KidTabletSetting, Remove-KidApp, Add-KidAllowedDomain, Remove-KidAllowedDomain, Update-KidAppConfig
'@
Set-Content -Path $moduleFile -Value $module -Encoding UTF8
Import-Module $moduleFile -Force
$kt = Get-Module KidTablet
function Invoke-Private([scriptblock]$Script, [object[]]$Arguments) { & $kt $Script @Arguments }

# ---- Current setup ---------------------------------------------------------
Step 'Reading her current setup'
$cfgPath = Join-Path $env:ProgramData 'KidTablet\config.json'
$old = $null
$discovered = @()
if (Test-Path $cfgPath) {
    $old = Get-KidTabletConfig
    try { $discovered = @(Get-KidAvailableApp) } catch { Write-Warning "Discovery: $($_.Exception.Message)" }
} else {
    Write-Host 'No existing config. Starting from the defaults.'
}
if (-not $UserName) { $UserName = if ($old) { $old.UserName } else { 'Kid' } }

$StoreApps = @()
function Add-StoreApp($Name, $Pfn, $Id, $Icon, $Color) {
    if ($script:StoreApps | Where-Object { $_.Pfn -eq $Pfn }) { return }
    $script:StoreApps += @{ Name = $Name; Pfn = $Pfn; Id = $Id; Icon = $Icon; Color = $Color }
}
if ($old) {
    foreach ($a in $old.PackagedApps) {
        $pfn = ($a.Aumid -split '!')[0]
        if ($pfn -notlike 'Microsoft.*') { Add-StoreApp $a.Name $pfn '' $a.Icon $a.Color }
    }
}
foreach ($d in $discovered | Where-Object Type -eq 'Packaged') {
    Add-StoreApp $d.Name (($d.Target -split '!')[0]) '' $null $null
}
foreach ($x in $ExtraStoreApps) { Add-StoreApp $x.Name $x.Pfn $x.Id $null $null }
$desktopNotIncluded = @($discovered | Where-Object Type -eq 'Desktop')

Write-Host 'Store apps to reinstall into her account:'
$StoreApps | ForEach-Object { Write-Host "  $($_.Name)" }
if ($old) {
    Write-Host 'Carried over from her config:'
    $old.WebApps     | ForEach-Object { Write-Host "  $($_.Name) (web)" }
    $old.DesktopApps | ForEach-Object { Write-Host "  $($_.Name) (desktop)" }
    $old.PackagedApps | Where-Object { $_.Aumid -like 'Microsoft.*' } | ForEach-Object { Write-Host "  $($_.Name) (Windows)" }
}

# ---- Teardown ----------------------------------------------------------------
Step "Signing out $UserName"
$line = @(quser.exe 2>$null) | Where-Object { $_ -match "^\s*>?$([regex]::Escape($UserName))\s" } | Select-Object -First 1
if ($line) {
    $id = ($line.Trim() -split '\s+') | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1
    & logoff.exe $id
    Start-Sleep -Seconds 5
} else { Write-Host 'Not signed in.' }

$user = Get-LocalUser -Name $UserName -ErrorAction SilentlyContinue
$kidProfile = if ($user) { Get-CimInstance Win32_UserProfile -Filter "SID='$($user.SID.Value)'" }

if ($kidProfile) {
    Step 'Backing up her saved files'
    $backup = Join-Path 'C:\KidTabletBackup' (Get-Date -Format 'yyyyMMdd-HHmmss')
    foreach ($rel in 'Desktop', 'Documents', 'Pictures', 'Downloads', 'AppData\Roaming\TuxPaint', 'AppData\Local\KidTablet') {
        $src = Join-Path $kidProfile.LocalPath $rel
        if (Test-Path $src) {
            $dst = Join-Path $backup $rel
            New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
            Copy-Item $src $dst -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Saved to $backup"
}

Step 'Removing kiosk config, tasks, home screen, and auto sign-in'
try { Uninstall-KidTablet } catch { Write-Warning "Uninstall: $($_.Exception.Message)" }
Get-ScheduledTask -TaskName 'KidTablet-*' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false

Step 'Removing Store apps from every account and from provisioning'
$pfns = @($StoreApps | ForEach-Object { $_.Pfn })
$provisioned = @(Get-AppxProvisionedPackage -Online)
foreach ($pfn in $pfns) {
    $name = $pfn.Substring(0, $pfn.LastIndexOf('_'))
    $provisioned | Where-Object DisplayName -eq $name | ForEach-Object {
        Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -AllUsers -ErrorAction SilentlyContinue | Out-Null
    }
    Get-AppxPackage -AllUsers | Where-Object PackageFamilyName -eq $pfn |
        Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue
    Write-Host "Removed $name"
}

if ($user) {
    Step "Deleting the $UserName account and profile"
    if ($kidProfile) {
        $deadline = (Get-Date).AddSeconds(60)
        do {
            $p = Get-CimInstance Win32_UserProfile -Filter "SID='$($user.SID.Value)'"
            if (-not $p) { break }
            if (-not $p.Loaded) { $p | Remove-CimInstance; break }
            Start-Sleep -Seconds 3
        } while ((Get-Date) -lt $deadline)
        if (Get-CimInstance Win32_UserProfile -Filter "SID='$($user.SID.Value)'") {
            throw 'Her profile is still in use. Reboot, sign in as your admin account, and run this again.'
        }
    }
    Remove-LocalUser -Name $UserName
}
Remove-Item (Join-Path $env:ProgramData 'KidTablet') -Recurse -Force -ErrorAction SilentlyContinue

# ---- Tux Paint -----------------------------------------------------------------
Step 'Checking Tux Paint'
$tux = Invoke-Private { Find-Exe 'tuxpaint.exe' }
if (-not $tux) {
    $setup = Get-ChildItem $PSScriptRoot -Filter 'tuxpaint*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($setup) {
        Write-Host "Running $($setup.Name). Choose to install for all users."
        Start-Process $setup.FullName -Wait
        $tux = Invoke-Private { Find-Exe 'tuxpaint.exe' }
    }
}
if ($tux) { Write-Host "Found $tux" } else { Write-Warning 'Tux Paint is not installed under Program Files. Its tile appears once it is.' }

# ---- Rebuild -----------------------------------------------------------------
Step 'Creating her account and base setup'
Install-KidTablet -UserName $UserName -ResetConfig -GeneratePassword

if ($old) {
    Step 'Restoring her apps, tiles, and settings'
    $cfg = Invoke-Private { Read-Config }
    foreach ($k in 'DisplayName', 'TextScalePercent', 'ShowTaskbar', 'AllowAllWebsites',
                   'AutoAdd', 'AutoAddCategories', 'AutoAddMaxAge', 'Background', 'AllowCameraMic') { if ($null -ne $old.$k) { $cfg.$k = $old.$k } }
    $cfg.WebApps        = @($old.WebApps)
    $cfg.DesktopApps    = @($old.DesktopApps)
    $cfg.AllowedDomains = @(@($cfg.AllowedDomains) + @($old.AllowedDomains) | Select-Object -Unique)
    $cfg.IgnoredApps    = @($old.IgnoredApps)
    $cfg.PackagedApps   = @($old.PackagedApps | Where-Object { $_.Aumid -like 'Microsoft.*' })
    Invoke-Private { param($c) Write-Config $c } @($cfg)
}
if ($FullName) { Set-KidTabletSetting -DisplayName $FullName -NoSync }

Step 'Syncing tiles and icons'
Sync-KidTablet -RefreshIcons

if ($StoreApps) {
    Step 'Queuing Store apps for her account'
    foreach ($app in $StoreApps) {
        $extra = @{}
        if ($app.Icon)  { $extra.Icon  = $app.Icon }
        if ($app.Color) { $extra.Color = $app.Color }
        if ($app.Id) { Add-KidStoreApp -StoreId $app.Id -Name $app.Name -QueueOnly @extra }
        else         { Add-KidStoreApp -Pfn $app.Pfn  -Name $app.Name -QueueOnly @extra }
    }
    Start-KidStoreInstall
}

# ---- Status ------------------------------------------------------------------
Step 'Status'
$cfg = Get-KidTabletConfig
$prov = @(Get-AppxProvisionedPackage -Online | ForEach-Object { $_.DisplayName })
$rows = foreach ($list in 'WebApps', 'DesktopApps', 'PackagedApps') {
    foreach ($a in $cfg.$list) {
        $ready = switch ($list) {
            'WebApps'      { 'yes' }
            'DesktopApps'  { if ($a.Path -and (Test-Path $a.Path)) { 'yes' } else { 'NOT INSTALLED' } }
            'PackagedApps' {
                $pfn = ($a.Aumid -split '!')[0]
                $n = $pfn.Substring(0, $pfn.LastIndexOf('_'))
                if ($a.Aumid -like 'Microsoft.*' -or $prov -contains $n) { 'yes' } else { 'NOT PROVISIONED' }
            }
        }
        $icon = Join-Path $env:ProgramFiles ("KidTablet\icons\" + (Invoke-Private { param($n) ConvertTo-SafeName $n } @($a.Name)) + '.png')
        [pscustomobject]@{ Type = $list -replace 'Apps$'; Name = $a.Name; Ready = $ready; Icon = if (Test-Path $icon) { 'app icon' } else { 'emoji' } }
    }
}
$rows | Format-Table -AutoSize

if ($desktopNotIncluded) {
    Write-Host 'Desktop apps installed on the tablet but not included (no way to tell kid apps from grown-up ones):'
    $desktopNotIncluded | ForEach-Object { Write-Host "  $($_.Name)  $($_.Target)" }
    Write-Host "To add one: Get-KidAvailableApp | Where-Object Name -eq '<name>' | Add-KidAvailableApp"
    Write-Host ''
}

$queue = (Get-KidTabletConfig).StoreQueue
if ($queue) {
    Write-Host 'Store apps queued for her account:'
    $queue | ForEach-Object { Write-Host "  $($_.Name) ($($_.Id))" }
    Write-Host ''
}
Write-Host 'Reboot now. She signs in automatically without the kiosk, her account installs the Store apps (a few minutes),' -ForegroundColor Green
Write-Host 'then the tiles are added, the kiosk comes back, and she is signed in again. Keep her off it until that happens.' -ForegroundColor Green
Write-Host 'Results land in the Application event log, source KidTablet: 1003 installed, 1005 failed.'
Write-Host "If a tile says 'Ask a grown-up', send the contents of C:\Users\$UserName\AppData\Local\KidTablet\launch.log"
