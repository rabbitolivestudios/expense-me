param(
  [string] $Url = "https://expense-me-tbo.vercel.app/",
  [int] $Port = 9222,
  [string] $ProfileDir = "C:\Users\txoliv\Developer\browser-harness\chrome-profile-expense-me"
)

$ErrorActionPreference = "Stop"
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$harnessScript = Join-Path $PSScriptRoot "browser-harness.ps1"

if (-not (Test-Path -LiteralPath $chromePath)) {
  $chromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
}

if (-not (Test-Path -LiteralPath $chromePath)) {
  throw "Chrome was not found."
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null
New-Item -ItemType Directory -Force -Path "work\screenshots" | Out-Null

$devtoolsUrl = "http://127.0.0.1:$Port"
$isListening = $false

try {
  Invoke-WebRequest -UseBasicParsing "$devtoolsUrl/json/version" -TimeoutSec 2 | Out-Null
  $isListening = $true
} catch {
  $isListening = $false
}

if (-not $isListening) {
  Start-Process -FilePath $chromePath -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$ProfileDir",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  )
  Start-Sleep -Seconds 3
}

$env:BU_CDP_URL = $devtoolsUrl
$escapedUrl = $Url.Replace("\", "\\").Replace('"', '\"')

@"
new_tab("$escapedUrl")
wait_for_load()
text = js("document.body.innerText")
old_terms = ["Avec River", "Taxi Paris", "HOTEL CHICAGO", "Chicago Training", "CASTRO Laurent", "Shell"]
capture_screenshot("work/screenshots/browser-harness-expense-me-inbox.png", max_dim=1000)
print({
  "info": page_info(),
  "has_inbox": "Inbox" in text,
  "has_empty_state": "No expenses yet" in text,
  "demo_hits": [term for term in old_terms if term in text],
})
click_at_xy(466, 829)
wait_for_load()
capture_text = js("document.body.innerText")
capture_screenshot("work/screenshots/browser-harness-expense-me-capture.png", max_dim=1000)
print({
  "capture_visible": "Scan Receipt" in capture_text and "Upload Statement" in capture_text,
})
"@ | & $harnessScript
