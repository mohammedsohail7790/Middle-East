$ErrorActionPreference = "Stop"
$outDir = Join-Path $PSScriptRoot "..\public\voiceover\cinematic"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$lines = @(
  @{ id = "01-problem"; text = "Every day, businesses lose customers simply because nobody answers the phone." },
  @{ id = "02-intro"; text = "Introducing Call IQ Labs. The AI receptionist that never misses a call." },
  @{ id = "03-ai-answers"; text = "Call IQ answers every call, every time, twenty-four hours a day." },
  @{ id = "04-lead-capture"; text = "Automatically capture and qualify leads while your team focuses on serving customers." },
  @{ id = "05-appointments"; text = "Book appointments automatically and send instant confirmations." },
  @{ id = "06-dashboard"; text = "Get complete visibility into every conversation, lead, and opportunity." },
  @{ id = "07-integrations"; text = "Connect seamlessly with HubSpot, Salesforce, Google Calendar, and the tools you already use." },
  @{ id = "08-industries"; text = "Designed for local businesses that depend on every customer interaction." },
  @{ id = "09-results"; text = "Turn every call into an opportunity for growth." },
  @{ id = "10-finale"; text = "Call IQ Labs. Never miss another lead." }
)

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft David Desktop")
$synth.Rate = 0
$synth.Volume = 100

foreach ($line in $lines) {
  $path = Join-Path $outDir "$($line.id).wav"
  if (Test-Path $path) { Remove-Item $path -Force }
  $synth.SetOutputToWaveFile($path)
  $synth.Speak($line.text)
  $synth.SetOutputToNull()
  Write-Host "Created $path"
}

Write-Host "Voiceover generation complete."
