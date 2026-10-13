$ApiPort=3001
$WebPort=5173
$ErrorActionPreference='Stop'
$repoRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot
if (!(Test-Path -LiteralPath '.env')) { throw 'Missing .env. Follow docs/operations/local.md first.' }
$nodeExecutable=(Get-Command node).Source
$pgControl=Join-Path $repoRoot 'work/postgres/pgsql/bin/pg_ctl.exe'
$pgData=Join-Path $repoRoot 'work/postgres/data'
if ((Test-Path -LiteralPath $pgControl) -and (Test-Path -LiteralPath $pgData)) {
 & $pgControl -D $pgData status *> $null
 if ($LASTEXITCODE -ne 0) {
  $pgArgs=@('-D',('"'+$pgData+'"'),'-l',('"'+(Join-Path $repoRoot 'work/postgres/server.log')+'"'),'-o','"-p 55432 -h 127.0.0.1"','start','-w')
  $pgStarter=Start-Process -FilePath $pgControl -ArgumentList $pgArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput 'work/postgres/start.log' -RedirectStandardError 'work/postgres/start-error.log'
  if (!$pgStarter.WaitForExit(30000)) { throw 'PostgreSQL start timed out; inspect work/postgres/server.log.' }
  if ($pgStarter.ExitCode -ne 0) { throw 'PostgreSQL did not start; inspect work/postgres/server.log.' }
 }
}
foreach ($port in @($ApiPort,$WebPort)) { if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Port $port is already in use. Close the previous preview before running this script." } }
New-Item -ItemType Directory -Force work/logs | Out-Null
$apiEntry=Join-Path $repoRoot 'apps/server/src/index.ts'
$viteEntry=Join-Path $repoRoot 'node_modules/vite/bin/vite.js'
$viteConfig=Join-Path $repoRoot 'apps/web/vite.config.ts'
$apiProcess=Start-Process -FilePath $nodeExecutable -WorkingDirectory $repoRoot -ArgumentList @('--import','tsx',('"'+$apiEntry+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput 'work/logs/api.log' -RedirectStandardError 'work/logs/api-error.log'
$webProcess=Start-Process -FilePath $nodeExecutable -WorkingDirectory $repoRoot -ArgumentList @(('"'+$viteEntry+'"'),'--config',('"'+$viteConfig+'"'),'--port',"$WebPort") -WindowStyle Hidden -PassThru -RedirectStandardOutput 'work/logs/web.log' -RedirectStandardError 'work/logs/web-error.log'
@{root=$repoRoot;api=$apiProcess.Id;web=$webProcess.Id} | ConvertTo-Json | Set-Content work/service-pids.json
$ready=$false
for($attempt=0;$attempt -lt 30;$attempt++) {
 & curl.exe --fail --silent --max-time 2 --output NUL "http://127.0.0.1:$ApiPort/api/health"
 $apiReady=$LASTEXITCODE -eq 0
 & curl.exe --fail --silent --max-time 2 --output NUL "http://127.0.0.1:$WebPort/"
 if($apiReady -and $LASTEXITCODE -eq 0){$ready=$true;break}
 Start-Sleep -Milliseconds 500
}
if(!$ready){throw 'Preview did not become ready. Inspect work/logs/*-error.log and run scripts/stop-local.ps1.'}
Write-Output "Preview ready: http://127.0.0.1:$WebPort/"

