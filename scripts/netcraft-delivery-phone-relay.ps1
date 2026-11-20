param([ValidateSet('Prepare','Cleanup')][string]$Mode='Prepare')
$ErrorActionPreference='Stop'
# Separate REDMI -> Node UDP proxy -> 127.0.0.1:BDS. Never edits BDS block rules.
$phone='192.168.1.2'
$pc='192.168.1.9'
$gamePort=19142
$proxyPort=19144
$bdsExe='C:\NetCraft-Lab\BDS-GateA\bedrock_server.exe'
$labDir='C:\NetCraft-Lab\DeliveryE2E'
$relayPath=Join-Path $labDir 'phone_udp_relay.cjs'
$marker=Join-Path $labDir 'phone-relay-state.json'
$stdout=Join-Path $labDir 'phone-relay-stdout.log'
$stderr=Join-Path $labDir 'phone-relay-stderr.log'
$ruleName='NetCraft-LAB-Phone-Relay-19144'
$pin='814c3c86f24c241239c66f368e737c09792ded65'
$sourceUrl="https://raw.githubusercontent.com/brennomcpe10-del/netcraft/$pin/minecraft/delivery-e2e-local/phone_udp_relay.cjs"
$sourceSha='e93a2c72823ac423449052fbc570ee1b53d783a314532601d6b5698304de7355'
function IsOurRule($rule) {
  if(!$rule) { return $false }
  $remote=@(($rule | Get-NetFirewallAddressFilter).RemoteAddress)
  $local=@(($rule | Get-NetFirewallAddressFilter).LocalAddress)
  $port=@(($rule | Get-NetFirewallPortFilter).LocalPort)
  $path=($rule | Get-NetFirewallApplicationFilter).Program
  return ($rule.Action.ToString() -eq 'Allow' -and $rule.Direction.ToString() -eq 'Inbound' -and
    $remote.Count -eq 1 -and $remote[0] -eq $phone -and
    $local.Count -eq 1 -and $local[0] -eq $pc -and
    $port.Count -eq 1 -and $port[0] -eq "$proxyPort" -and
    $path -eq (Get-Command node.exe -ErrorAction Stop).Source)
}
function StopOurNode($id) {
  if(!$id){return}
  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
  if(!$p){return}
  $expected=(Get-Command node.exe -ErrorAction Stop).Source
  if($p.Name -ne 'node.exe' -or $p.ExecutablePath -ine $expected -or
      $p.CommandLine -notlike '*phone_udp_relay.cjs*'){
    throw 'PID nao pertence ao relay: nao encerrar processo desconhecido.'
  }
  Stop-Process -Id $id -Force -ErrorAction Stop
}
function CheckLabRule($name,$direction) {
  $r=@(Get-NetFirewallRule -DisplayName $name -ErrorAction Stop)
  if($r.Count -ne 1 -or $r[0].Enabled.ToString() -ne 'True' -or
     $r[0].Action.ToString() -ne 'Block' -or
     $r[0].Direction.ToString() -ne $direction -or
     ($r[0] | Get-NetFirewallApplicationFilter).Program -ine $bdsExe){
    throw "Bloqueio original do BDS inesperado: $name"
  }
  $remote=@(($r[0] | Get-NetFirewallAddressFilter).RemoteAddress)
  if($remote.Count -ne 1 -or $remote[0] -ne 'Any'){
    throw "Regra original modificada: $name"
  }
}
try{
  $administrator=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if(!$administrator.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
    throw 'Abra o PowerShell como administrador.'
  }
  if(-not (Get-NetFirewallProfile -Name Private).Enabled){throw 'Firewall privado desligado.'}
  CheckLabRule 'NetCraft LAB - Bloquear entrada' 'Inbound'
  CheckLabRule 'NetCraft LAB - Bloquear saida' 'Outbound'
  $rule=Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
  if($Mode -eq 'Cleanup'){
    if($rule){
      if(!(IsOurRule $rule)){throw 'Regra de relay alterada; recusar exclusao.'}
    }
    if(Test-Path $marker){
      $saved=Get-Content $marker -Raw | ConvertFrom-Json
      if($saved.port -ne $proxyPort -or $saved.phone -ne $phone){throw 'Marcador de relay inesperado.'}
      StopOurNode $saved.pid
    }
    if($rule){Remove-NetFirewallRule -Name $ruleName -ErrorAction Stop}
    foreach($file in @($marker,$relayPath,$stdout,$stderr)){
      if(Test-Path $file){Remove-Item $file -Force}
    }
    Write-Host 'NETCRAFT_PHONE_RELAY_CLEANED'
    exit 0
  }
  if($rule -or (Test-Path $marker)){throw 'Relay ja preparado; nao criar duplicado.'}
  if(!(Test-Path "$labDir\started.json")){throw 'Laboratorio E2E nao preparado.'}
  if(!(Test-Path $bdsExe)){throw 'BDS de laboratorio ausente.'}
  $wifi=@(Get-NetConnectionProfile | Where-Object {$_.InterfaceAlias -eq 'Wi-Fi' -and $_.NetworkCategory.ToString() -eq 'Private'})
  if($wifi.Count -ne 1){throw 'Wi-Fi do PC deve estar como rede privada.'}
  if(@(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $pc -ErrorAction SilentlyContinue).Count -ne 1){throw 'IP do PC mudou; recusar teste.'}
  if(@(Get-NetUDPEndpoint -LocalPort $proxyPort -ErrorAction SilentlyContinue).Count -gt 0){throw 'Porta 19144 ja ocupada.'}
  $node=(Get-Command node.exe -ErrorAction Stop).Source
  Invoke-WebRequest -Uri $sourceUrl -OutFile $relayPath -ErrorAction Stop
  if((Get-Item $relayPath).Length -lt 2000 -or
     (Get-FileHash $relayPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceSha){
    Remove-Item $relayPath -Force -ErrorAction SilentlyContinue
    throw 'Fonte da ponte UDP incompleta ou adulterada.'
  }
  $created=$false
  $pidStarted=$null
  try{
    New-NetFirewallRule -Name $ruleName -DisplayName 'NetCraft LAB - Ponte Redmi local 19144' -Direction Inbound -Action Allow -Program $node -Protocol UDP -LocalAddress $pc -LocalPort $proxyPort -RemoteAddress $phone -Profile Private -ErrorAction Stop | Out-Null
    $created=$true
    if(!(IsOurRule (Get-NetFirewallRule -Name $ruleName -ErrorAction Stop))){throw 'Regra criada nao corresponde ao escopo esperado.'}
    $env:NC_PHONE_LAB_RELAY='1'
    try{
      $proc=Start-Process -FilePath $node -ArgumentList ('"' + $relayPath + '"') -WorkingDirectory $labDir -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -ErrorAction Stop
      $pidStarted=$proc.Id
    }finally{
      Remove-Item Env:\NC_PHONE_LAB_RELAY -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
    $endpoint=@(Get-NetUDPEndpoint -LocalAddress $pc -LocalPort $proxyPort -ErrorAction SilentlyContinue)
    if($endpoint.Count -ne 1 -or $endpoint[0].OwningProcess -ne $pidStarted){throw 'Ponte UDP nao iniciou corretamente.'}
    @{pid=$pidStarted;phone=$phone;port=$proxyPort;target=$gamePort} |
      ConvertTo-Json | Set-Content -Path $marker -Encoding UTF8
    Write-Host 'NETCRAFT_PHONE_RELAY_READY'
    Write-Host "Conecte o Redmi ao IP $pc porta $proxyPort, com o BDS aberto."
    Write-Host 'Depois use este mesmo script com -Mode Cleanup.'
  }catch{
    if($pidStarted){try{StopOurNode $pidStarted}catch{}}
    if($created){try{Remove-NetFirewallRule -Name $ruleName -ErrorAction Stop}catch{}}
    if(Test-Path $marker){Remove-Item $marker -Force -ErrorAction SilentlyContinue}
    throw
  }
}catch{
  Write-Host ('NETCRAFT_PHONE_RELAY_ERROR: '+$_.Exception.Message)
  exit 1
}
