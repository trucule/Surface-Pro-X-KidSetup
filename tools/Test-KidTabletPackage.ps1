<#
.SYNOPSIS
    Checks that the module copies embedded in Deploy-KidTablet.ps1 and Reset-KidTablet.ps1 are identical
    to KidTablet.psm1. Run after changing the module; an out-of-date copy would roll the tablet back.
#>
$root = Split-Path $PSScriptRoot
$module = (Get-Content -LiteralPath (Join-Path $root 'KidTablet.psm1') -Raw).TrimEnd("`r", "`n")
$ok = $true
foreach ($name in 'Deploy-KidTablet.ps1', 'Reset-KidTablet.ps1') {
    $text = Get-Content -LiteralPath (Join-Path $root $name) -Raw
    $m = [regex]::Match($text, "(?ms)^[ \t]*\`$module = @'\r?\n(.*?)\r?\n'@")
    if (-not $m.Success) { Write-Host "FAIL $name : embedded module not found"; $ok = $false; continue }
    $same = $m.Groups[1].Value.TrimEnd("`r", "`n") -eq $module
    Write-Host ("{0} {1} : embedded module {2}" -f ($(if ($same) { 'PASS' } else { 'FAIL' })), $name, ($(if ($same) { 'matches KidTablet.psm1' } else { 'is OUT OF DATE' })))
    if (-not $same) { $ok = $false }
}
exit $(if ($ok) { 0 } else { 1 })
