[CmdletBinding()]
param(
  [Parameter(ValueFromPipeline = $true)]
  [string] $InputObject,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Arguments
)

begin {
  $inputLines = [System.Collections.Generic.List[string]]::new()
}

process {
  if ($null -ne $InputObject) {
    $inputLines.Add($InputObject)
  }
}

end {
  $harnessRoot = "C:\Users\txoliv\Developer\browser-harness"
  $harnessExe = Join-Path $harnessRoot ".venv\Scripts\browser-harness.exe"

  if (-not (Test-Path -LiteralPath $harnessExe)) {
    throw "Browser Harness is not installed at $harnessExe"
  }

  if ($inputLines.Count -gt 0) {
    $inputLines | & $harnessExe @Arguments
    return
  }

  & $harnessExe @Arguments
}
