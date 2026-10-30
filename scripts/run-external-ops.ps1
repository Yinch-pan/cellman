param([string]$StateDir = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'cellman-operations'), [switch]$TestAlert)
$ErrorActionPreference = 'Stop'
$stage = 'read settings'
try {
$settings = Get-Content -LiteralPath (Join-Path $StateDir 'settings.json') -Raw | ConvertFrom-Json
$stage = 'decrypt credentials'
$protected = (Get-Content -LiteralPath (Join-Path $StateDir 'smtp.dpapi') -Raw).Trim() | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($protected)
$process = $null
try {
  $smtp = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json
  $payload = @{ host=$settings.host; user=$settings.user; origin=$settings.origin; backupDir=$settings.backupDir; stateDir=$StateDir; alertTo=$settings.alertTo; smtp=$smtp } | ConvertTo-Json -Depth 5 -Compress
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $settings.nodePath
  $script = Join-Path $PSScriptRoot 'external-ops.mjs'
  $start.Arguments = '"' + $script + '"' + $(if ($TestAlert) { ' --test-alert' } else { '' })
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $start
  $stage = 'start monitor process'
  [void]$process.Start()
  $process.StandardInput.Write($payload)
  $process.StandardInput.Close()
  $out = $process.StandardOutput.ReadToEndAsync()
  $err = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit(300000)) { $process.Kill(); throw 'External monitor timed out' }
  # Only the sanitized status/error output is retained; never log the payload.
  [IO.File]::WriteAllText((Join-Path $StateDir 'last-run.log'), $out.Result + $err.Result)
  Write-Output $out.Result
  exit $process.ExitCode
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $payload = $null
  $smtp = $null
  $protected.Dispose()
  if ($process) { $process.Dispose() }
}
} catch {
  # Never write exception messages, which might contain parsed configuration.
  $failure = 'Monitor startup failed at ' + $stage + ': ' + $_.Exception.GetType().FullName
  [IO.File]::WriteAllText((Join-Path $StateDir 'last-run.log'), $failure)
  Write-Error $failure
  exit 1
}
