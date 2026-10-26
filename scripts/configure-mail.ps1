param(
  [string]$Server = '8.210.238.62',
  [string]$SmtpHost = 'smtp.qq.com',
  [ValidateSet('465','587')][string]$SmtpPort = '465'
)
$ErrorActionPreference = 'Stop'
if ($Server -notmatch '^[a-zA-Z0-9.-]+$') { throw 'Invalid server name' }
$mailAccount = Read-Host 'Sending email address (for example your dedicated QQ mailbox)'
$mailSecret = Read-Host 'SMTP authorization code (hidden input, not your account password)' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mailSecret)
$sshProcess = $null
try {
  $secretText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  $payload = @{SMTP_HOST=$SmtpHost;SMTP_PORT=$SmtpPort;SMTP_USER=$mailAccount;SMTP_PASS=$secretText;MAIL_FROM=$mailAccount} | ConvertTo-Json -Compress
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = 'ssh'
  $info.Arguments = "-o BatchMode=yes -o ConnectTimeout=10 root@$Server python3 /srv/cellman/current/deploy/configure-mail.py"
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $sshProcess = New-Object System.Diagnostics.Process
  $sshProcess.StartInfo = $info
  [void]$sshProcess.Start()
  $sshProcess.StandardInput.Write($payload)
  $sshProcess.StandardInput.Close()
  $outputTask = $sshProcess.StandardOutput.ReadToEndAsync()
  $errorTask = $sshProcess.StandardError.ReadToEndAsync()
  $sshProcess.WaitForExit()
  Write-Host $outputTask.Result
  if ($sshProcess.ExitCode -ne 0) { Write-Host $errorTask.Result; throw 'Mail setup failed; review the message above.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
  $secretText = $null
  $payload = $null
  if ($sshProcess) { $sshProcess.Dispose() }
  $mailSecret.Dispose()
}
