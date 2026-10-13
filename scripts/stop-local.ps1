param([switch]$StopDatabase)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path -Parent $PSScriptRoot
$manifest=Join-Path $repoRoot 'work/service-pids.json'
if(Test-Path -LiteralPath $manifest){
 $saved=Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
 if([IO.Path]::GetFullPath($saved.root) -ne [IO.Path]::GetFullPath($repoRoot)){throw 'Process manifest belongs to another directory.'}
 foreach($serviceId in @($saved.api,$saved.web)){
  $service=Get-CimInstance Win32_Process -Filter "ProcessId=$serviceId" -ErrorAction SilentlyContinue
  if($service){
   if(!$service.CommandLine.Replace('\','/').ToLowerInvariant().Contains($repoRoot.Replace('\','/').ToLowerInvariant())){throw "Process $serviceId no longer belongs to this project; refusing to stop it."}
   Stop-Process -Id $serviceId
  }
 }
 Remove-Item -LiteralPath $manifest
}
if($StopDatabase){$pgControl=Join-Path $repoRoot 'work/postgres/pgsql/bin/pg_ctl.exe';$pgData=Join-Path $repoRoot 'work/postgres/data';if((Test-Path -LiteralPath $pgControl)-and(Test-Path -LiteralPath $pgData)){& $pgControl -D $pgData -m fast stop -w}}
Write-Output 'Owned preview processes stopped.'
