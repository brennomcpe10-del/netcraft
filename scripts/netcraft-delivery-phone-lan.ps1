param([ValidateSet('Prepare','Cleanup')][string]$Mode='Prepare')
$ErrorActionPreference='Stop'
# LAB ONLY: Allow BDS to communicate with exactly one IPv4 phone, no Internet.
$phone='192.168.1.2'
$pc='192.168.1.9'
$port=19142
$exe='C:\NetCraft-Lab\BDS-GateA\bedrock_server.exe'
$allowName='NetCraft-LAB-Celular-19142'
$inName='NetCraft LAB - Bloquear entrada'
$outName='NetCraft LAB - Bloquear saida'
$marker='C:\NetCraft-Lab\DeliveryE2E\phone-firewall.json'
$networks=@(
'0.0.0.0/1','128.0.0.0/2','192.0.0.0/9','192.128.0.0/11',
'192.160.0.0/13','192.168.0.0/24','192.168.1.0/31',
'192.168.1.3/32','192.168.1.4/30','192.168.1.8/29',
'192.168.1.16/28','192.168.1.32/27','192.168.1.64/26',
'192.168.1.128/25','192.168.2.0/23','192.168.4.0/22',
'192.168.8.0/21','192.168.16.0/20','192.168.32.0/19',
'192.168.64.0/18','192.168.128.0/17','192.169.0.0/16',
'192.170.0.0/15','192.172.0.0/14','192.176.0.0/12',
'192.192.0.0/10','193.0.0.0/8','194.0.0.0/7',
'196.0.0.0/6','200.0.0.0/5','208.0.0.0/4',
'224.0.0.0/3','::/0')
function Get-LabRule([string]$name,[string]$direction) {
  $r=@(Get-NetFirewallRule -DisplayName $name -ErrorAction Stop)
  if($r.Count -ne 1 -or $r[0].Direction.ToString() -ne $direction -or $r[0].Action.ToString() -ne 'Block' -or $r[0].Enabled.ToString() -ne 'True'){throw "Unexpected BDS lab firewall rule: $name"}
  $app=($r[0] | Get-NetFirewallApplicationFilter).Program
  if($app -ine $exe){throw "Rule is not scoped to BDS lab: $name"}
  return $r[0]
}
function Set-Remote($rule,[string[]]$addresses) {
  $rule | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -RemoteAddress $addresses -ErrorAction Stop | Out-Null
}
try {
  $admin=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if(-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run PowerShell as administrator.'}
  $private=Get-NetFirewallProfile -Name Private
  $wifi=@(Get-NetConnectionProfile | Where-Object {$_.InterfaceAlias -eq 'Wi-Fi' -and $_.NetworkCategory.ToString() -eq 'Private'})
  if(-not $private.Enabled -or $wifi.Count -ne 1){throw 'Private Windows firewall and private Wi-Fi are required.'}
  $in=Get-LabRule $inName 'Inbound'
  $out=Get-LabRule $outName 'Outbound'
  $existing=Get-NetFirewallRule -Name $allowName -ErrorAction SilentlyContinue
  if($Mode -eq 'Cleanup'){
    Set-Remote $in @('Any')
    Set-Remote $out @('Any')
    if($existing){$existing | Remove-NetFirewallRule -ErrorAction Stop}
    if(Test-Path $marker){Remove-Item $marker -Force}
    Write-Host 'NETCRAFT_PHONE_ACCESS_CLEANED'
    exit 0
  }
  if(-not (Test-Path $exe)){throw 'BDS lab not found.'}
  if($existing -or (Test-Path $marker)){throw 'Old phone test rule exists; run Cleanup first.'}
  foreach($r in @($in,$out)){
    $remote=@(($r | Get-NetFirewallAddressFilter).RemoteAddress)
    if($remote.Count -ne 1 -or $remote[0] -ne 'Any'){throw 'Original block scope unexpectedly changed: '+$r.DisplayName}
  }
  if(@(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $pc -ErrorAction SilentlyContinue).Count -lt 1){throw 'PC IPv4 is no longer 192.168.1.9.'}
  $created=$false
  try {
    New-NetFirewallRule -Name $allowName -DisplayName 'NetCraft LAB - Somente celular' -Direction Inbound -Action Allow -Program $exe -Protocol UDP -LocalAddress $pc -LocalPort $port -RemoteAddress $phone -Profile Private -ErrorAction Stop | Out-Null
    $created=$true
    Set-Remote $in $networks
    Set-Remote $out $networks
    $actualIn=@(($in | Get-NetFirewallAddressFilter).RemoteAddress)
    $actualOut=@(($out | Get-NetFirewallAddressFilter).RemoteAddress)
    if($actualIn.Count -ne $networks.Count -or $actualOut.Count -ne $networks.Count){throw 'Firewall did not apply all restricted prefixes.'}
    if(-not (Test-Path (Split-Path $marker))){throw 'Lab folder missing.'}
    @{phone=$phone;pc=$pc;port=$port;mode='local_test_only'} | ConvertTo-Json | Set-Content -Path $marker -Encoding UTF8
    Write-Host 'NETCRAFT_PHONE_ACCESS_READY'
    Write-Host "Connect Redmi to $pc on port $port, using IP $phone."
    Write-Host 'Restore protection using this script with -Mode Cleanup.'
  } catch {
    try{Set-Remote $in @('Any')}catch{}
    try{Set-Remote $out @('Any')}catch{}
    if($created){try{Get-NetFirewallRule -Name $allowName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue}catch{}}
    if(Test-Path $marker){Remove-Item $marker -Force -ErrorAction SilentlyContinue}
    throw
  }
} catch {
  Write-Host ('NETCRAFT_PHONE_ACCESS_ERROR: '+$_.Exception.Message)
  exit 1
}
