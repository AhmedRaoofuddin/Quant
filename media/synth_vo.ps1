# Synthesize the narration with the Windows female voice (Zira), one WAV per scene.
# Per-scene files let the renderer time each scene to its real audio length rather than guessing.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path $here 'vo'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$script = Get-Content (Join-Path $here 'script.json') -Raw | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$female = $synth.GetInstalledVoices() |
    Where-Object { $_.VoiceInfo.Gender -eq 'Female' -and $_.Enabled } |
    Select-Object -First 1
if ($null -eq $female) { throw 'No female voice installed. Install a female SAPI voice and retry.' }
$synth.SelectVoice($female.VoiceInfo.Name)
$synth.Rate = $script.rate
$synth.Volume = 100
"voice: $($female.VoiceInfo.Name)  rate: $($script.rate)"

$manifest = @()
foreach ($scene in $script.scenes) {
    $path = Join-Path $outDir "$($scene.id).wav"
    $synth.SetOutputToWaveFile($path)
    $synth.Speak($scene.vo)
    $synth.SetOutputToNull()

    # Read the actual duration from the RIFF header rather than estimating from word count.
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $rate = [BitConverter]::ToInt32($bytes, 28)          # byte rate, offset 28 in a PCM WAV
    $dataLen = $bytes.Length - 44
    $seconds = [math]::Round($dataLen / $rate, 3)

    $manifest += [pscustomobject]@{ id = $scene.id; beat = $scene.beat; seconds = $seconds; wav = "vo/$($scene.id).wav" }
    "{0,-10} {1,7:N2}s  {2}" -f $scene.id, $seconds, $path
}
$synth.Dispose()

$total = ($manifest | Measure-Object -Property seconds -Sum).Sum
$manifest | ConvertTo-Json -Depth 4 | Out-File (Join-Path $here 'vo\manifest.json') -Encoding utf8
"`ntotal narration: {0:N1}s across {1} scenes" -f $total, $manifest.Count
