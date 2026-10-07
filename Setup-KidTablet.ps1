#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs the KidTablet module machine-wide and sets the device up as a kid tablet.
    Keep KidTablet.psm1 in the same folder as this script.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\Setup-KidTablet.ps1 -UserName Ava

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\Setup-KidTablet.ps1 -Remove
#>
[CmdletBinding(DefaultParameterSetName = 'Setup')]
param(
    [Parameter(ParameterSetName = 'Setup')][string]$UserName,
    [Parameter(ParameterSetName = 'Setup')][string]$FullName,
    [Parameter(ParameterSetName = 'Setup')][bool]$AutoLogon = $true,
    [Parameter(ParameterSetName = 'Setup')][ValidateRange(100, 225)][int]$TextScalePercent,
    [Parameter(ParameterSetName = 'Setup')][switch]$AllowAllWebsites,
    [Parameter(ParameterSetName = 'Setup')][switch]$ResetConfig,
    [Parameter(ParameterSetName = 'Setup')][switch]$GeneratePassword,
    [Parameter(ParameterSetName = 'Remove')][switch]$Remove
)
$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'KidTablet.psm1'
if (-not (Test-Path $src)) { throw "KidTablet.psm1 not found next to this script." }

$dst = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet'
New-Item -ItemType Directory -Path $dst -Force | Out-Null
Copy-Item $src (Join-Path $dst 'KidTablet.psm1') -Force
Import-Module (Join-Path $dst 'KidTablet.psm1') -Force

if ($Remove) {
    Uninstall-KidTablet
} else {
    $params = @{}
    foreach ($k in $PSBoundParameters.Keys) { $params[$k] = $PSBoundParameters[$k] }
    Install-KidTablet @params
}
