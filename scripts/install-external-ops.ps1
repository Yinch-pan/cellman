param(
  [string]$StateDir = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'cellman-operations'),
  [string]$NodePath = (Get-Command node -ErrorAction Stop).Source,
  [string]$AlertTo = 'yinchpan@gmail.com'
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($identity.User, (New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'))) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $StateDir -AclObject $acl
# Read only the necessary SMTP fields; keep plaintext out of files and output.
$reader = @'
import pathlib,shlex,json
allowed={'SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','MAIL_FROM'}
result={}
for line in pathlib.Path('/etc/cellman/mail.env').read_text().splitlines():
    if not line.strip() or line.lstrip().startswith('#') or '=' not in line: continue
    key,value=line.split('=',1)
    if key.strip() in allowed:
        parts=shlex.split(value,comments=False)
        result[key.strip()]=' '.join(parts)
assert all(result.get(k) for k in ['SMTP_HOST','SMTP_USER','SMTP_PASS','MAIL_FROM'])
print(json.dumps(result))
'@
$smtpJson = $reader | & ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes root@8.210.238.62 python3 -
if ($LASTEXITCODE -ne 0) { throw 'Cannot read SMTP configuration over authenticated SSH' }
$secret = ($smtpJson -join "`n") | ConvertTo-SecureString -AsPlainText -Force
try { $secret | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $StateDir 'smtp.dpapi') -Encoding ascii }
finally { $secret.Dispose(); $smtpJson = $null }
$settings = @{ host='8.210.238.62'; user='root'; origin='https://8.210.238.62:8443'; backupDir=(Join-Path $StateDir 'backups'); nodePath=$NodePath; alertTo=$AlertTo }
$settings | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $StateDir 'settings.json') -Encoding utf8
$runner = Join-Path $PSScriptRoot 'run-external-ops.ps1'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runner + '" -StateDir "' + $StateDir + '"'
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(15) -RepetitionInterval (New-TimeSpan -Minutes 15)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
$options = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 6)
Register-ScheduledTask -TaskName 'Cellman-External-Monitor' -Action $action -Trigger @($trigger,$logon) -Principal $principal -Settings $options -Force | Out-Null
Write-Output ('Installed Cellman-External-Monitor; private state: ' + $StateDir)
