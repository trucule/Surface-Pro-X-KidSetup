<#
.SYNOPSIS
    Points Story Maker at the VoiceStudio voices on the PC (or Azure/OpenAI). Run as SYSTEM from ET Ducky.

.DESCRIPTION
    Writes the TTS_* settings below into C:\ProgramData\KidTablet\.env (other lines are kept), checks
    that the voice server answers from the tablet, rewrites each app's config.js from .env, and syncs.
    With TTS_PROVIDER=voicestudio the Azure or OpenAI key already in .env becomes the fallback used
    when the PC cannot be reached. Leave a setting blank to leave that .env line as it is; set it to
    the word none to remove the line.

    No secret is needed when the PC trusts the tablet's subnet (OMNIVOICE_TRUSTED_NETWORKS=10.0.0.0/24 in
    the PC's ~/.config/omnivoice/env): the default 'none' removes any TTS_PIN from .env so the app sends no
    credential. Set a secret only for a PC that is not trusting the subnet (the share PIN or OMNIVOICE_API_KEY).

    Exit code 0 on success, 1 on failure. A voice server that does not answer is reported, not fatal:
    the app falls back on its own.
#>

# ---- Settings ---------------------------------------------------------------
$TtsProvider    = 'voicestudio'            # voicestudio | azure | openai | none
$TtsUrl         = 'http://10.0.0.169:3900' # voicestudio: the PC's address (3900 with OMNIVOICE_BIND_HOST, 3901 for the share)
$TtsSecret      = 'none'                   # none = no credential (PC trusts the subnet); else OMNIVOICE_API_KEY or share PIN
$TtsFallback    = 'azure'                  # azure | openai | none: which key to use when the PC is off
$RestartSession = $false                   # config.js is read when an app starts; restart only if she is in Story Maker now
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

try {
    $moduleFile = Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules\KidTablet\KidTablet.psm1'
    if (-not (Test-Path $moduleFile)) { throw 'KidTablet is not installed on this device. Run Deploy-KidTablet.ps1 first.' }
    $envPath = Join-Path $env:ProgramData 'KidTablet\.env'
    if (-not (Test-Path $envPath)) { throw "$envPath is missing. Create it from env.example (it holds ANTHROPIC_API_KEY) before setting voices." }

    $set = [ordered]@{ TTS_PROVIDER = $TtsProvider; TTS_URL = $TtsUrl; TTS_PIN = $TtsSecret; TTS_FALLBACK = $TtsFallback }
    $lines = @(Get-Content -LiteralPath $envPath)
    foreach ($k in $set.Keys) {
        $v = [string]$set[$k]
        if ($v -eq '') { continue }
        $lines = @($lines | Where-Object { $_ -notmatch "^\s*$k\s*=" })
        if ($v -ne 'none') { $lines += "$k=$v" }
    }
    Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8
    $shown = $lines | Where-Object { $_ -match '^\s*TTS_' } | ForEach-Object { if ($_ -match '^(TTS_PIN|TTS_KEY)=') { ($_ -split '=', 2)[0] + '=(set)' } else { $_ } }
    Write-Host ('.env voice settings: ' + ($shown -join '; '))

    if ($TtsProvider -eq 'voicestudio' -and $TtsUrl) {
        $headers = @{}
        if ($TtsSecret -and $TtsSecret -ne 'none') { $headers['x-omnivoice-pin'] = $TtsSecret; $headers['Authorization'] = "Bearer $TtsSecret" }
        try {
            $r = Invoke-WebRequest -Uri ($TtsUrl.TrimEnd('/') + '/v1/audio/voices') -Headers $headers -UseBasicParsing -TimeoutSec 8
            $names = @(($r.Content | ConvertFrom-Json).voices | Where-Object { $_.type -eq 'profile' } | ForEach-Object { $_.name })
            $cast = @('Narrator', 'Scarlett', 'Spark', 'Bun', 'Beep', 'Twinkle', 'Pip', 'Hop', 'Rusty', 'Luna', 'Mo', 'Zip', 'Captain Clam')
            $missing = @($cast | Where-Object { $names -notcontains $_ })
            Write-Host ("VoiceStudio reachable at {0}: {1} voice profiles{2}" -f $TtsUrl, $names.Count, $(if ($missing) { '; MISSING: ' + ($missing -join ', ') } else { '; the whole cast is there' }))
        } catch {
            Write-Warning ("VoiceStudio did not answer at {0} ({1}). Stories will use the fallback voices until it does. Check: VoiceStudio running on the PC and bound to the LAN, the firewall, and OMNIVOICE_TRUSTED_NETWORKS (or the secret)." -f $TtsUrl, $_.Exception.Message)
        }
    }

    Import-Module $moduleFile -Force
    Update-KidAppConfig -Verbose
    Sync-KidTablet -RestartSession:$RestartSession
    exit 0
} catch {
    Write-Error ("KidTablet voice setup failed: {0}`r`nWhere: {1}" -f $_.Exception.Message, $_.ScriptStackTrace)
    exit 1
}
