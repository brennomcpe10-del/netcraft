param([ValidateSet('Prepare','Cleanup','Status')][string]$Mode='Prepare')
$ErrorActionPreference='Stop'
# LAB ONLY — NetherNet uses TCP signaling and dynamic UDP/WebRTC transport.
# Temporarily REPLACE lab's BDS-wide inbound/outbound blocks with BDS Internet-only
# blocks plus one LAN phone exception. NEVER touch the Windows Firewall profiles.
$Bds='C:\NetCraft-Lab\BDS-GateA\bedrock_server.exe'
$Lab='C:\NetCraft-Lab\DeliveryE2E'
$Marker=Join-Path $Lab 'nethernet-phone-access.json'
$Phone='192.168.1.2'
$HostAddress='192.168.1.9'
$Port=19142
$OriginalNames=@('NetCraft LAB - Bloquear entrada','NetCraft LAB - Bloquear saida')
$NewNames=@('NCBR-NN-LAB-BlockInternet-In','NCBR-NN-LAB-BlockInternet-Out',
            'NCBR-NN-LAB-AllowPhone-TCP','NCBR-NN-LAB-AllowPhone-UDP')
function OriginalRule([string]$name) {
 $rules=@(Get-NetFirewallRule -DisplayName $name -ErrorAction Stop)
 if($rules.Count -ne 1 -or $rules[0].Action.ToString() -ne 'Block' -or
    ($rules[0] | Get-NetFirewallApplicationFilter).Program -ine $Bds){
   throw "Original BDS-only block rule mismatch: $name"
 }
 return $rules[0]
}
function NewRule($name,$direction,$action,$proto,$remote,$port) {
 $options=@{Name=$name;Direction=$direction;Action=$action;Program=$Bds;
  RemoteAddress=$remote;Profile='Private';ErrorAction='Stop';Enabled='True'}
 if($proto){$options.Protocol=$proto}
 if($port){$options.LocalPort=$port}
 if($action -eq 'Allow'){$options.LocalAddress=$HostAddress}
 New-NetFirewallRule @options | Out-Null
}
function RemoveCreated {
 foreach($name in $NewNames) {
  $rule=Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
  if($rule) {
   if(($rule | Get-NetFirewallApplicationFilter).Program -ine $Bds){
     throw "Unexpected rule ownership: $name"
   }
   Remove-NetFirewallRule -Name $name -ErrorAction Stop
  }
 }
}
function RestoreOriginal {
 foreach($name in $OriginalNames) {
  $rule=OriginalRule $name
  Enable-NetFirewallRule -InputObject $rule -ErrorAction Stop
  $filter=$rule | Get-NetFirewallAddressFilter
  if(@($filter.RemoteAddress).Count -ne 1 -or $filter.RemoteAddress -ne 'Any'){
   throw "Original block scope unexpected: $name"
  }
 }
}
try {
 $identity=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
 if(-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
  throw 'Open Windows PowerShell as Administrator.'
 }
 if(!(Get-NetFirewallProfile -Name Private).Enabled){throw 'Private firewall is OFF.'}
 $wifi=@(Get-NetConnectionProfile | Where-Object {
   $_.InterfaceAlias -eq 'Wi-Fi' -and $_.NetworkCategory.ToString() -eq 'Private'
 })
 if($wifi.Count -ne 1){throw 'Wi-Fi must be Private.'}
 if(!(Test-Path $Bds) -or !(Test-Path "$Lab\started.json")){
   throw 'Only prepared disposable E2E lab is supported.'
 }
 if(@(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $HostAddress -ErrorAction SilentlyContinue).Count -ne 1){
  throw 'Computer local IPv4 changed; refusing unscoped access.'
 }
 foreach($name in $OriginalNames){$null=OriginalRule $name}
 if($Mode -eq 'Status'){
  foreach($name in ($OriginalNames+$NewNames)){
   Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue |
    Select-Object DisplayName,Enabled,Direction,Action
  }
  Write-Host ('NCBR_NETHERNET_PHONE_MARKER: '+(Test-Path $Marker))
  exit 0
 }
 if($Mode -eq 'Cleanup'){
  RestoreOriginal
  RemoveCreated
  if(Test-Path $Marker){Remove-Item $Marker -Force}
  Write-Host 'NCBR_NETHERNET_PHONE_CLEANED'
  exit 0
 }
 if(Test-Path $Marker){throw 'Already prepared. Run Cleanup before retrying.'}
 foreach($name in $NewNames){
  if(Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue){
   throw "Temporary rule already exists; run Cleanup first: $name"
  }
 }
 if(Get-NetFirewallRule -Name 'NetCraft-LAB-Phone-Relay-19144' -ErrorAction SilentlyContinue){
   throw 'Stop/cleanup the obsolete UDP relay first.'
 }
 foreach($name in $OriginalNames){
  $rule=OriginalRule $name
  if($rule.Enabled.ToString() -ne 'True' -or
     $rule.Direction.ToString() -ne $(if($name -like '*entrada'){'Inbound'}else{'Outbound'})){
    throw 'Original BDS block rule not in prepared state.'
  }
  $filter=$rule | Get-NetFirewallAddressFilter
  if(@($filter.RemoteAddress).Count -ne 1 -or $filter.RemoteAddress -ne 'Any'){
   throw 'Original BDS block must retain RemoteAddress Any.'
  }
 }
 try {
  # Both default broad BDS block rules remain ENABLED while narrow replacements
  # are created; this avoids a window of accidental unfiltered inbound access.
  NewRule $NewNames[0] 'Inbound' 'Block' $null 'Internet' $null
  NewRule $NewNames[1] 'Outbound' 'Block' $null 'Internet' $null
  NewRule $NewNames[2] 'Inbound' 'Allow' 'TCP' $Phone $Port
  NewRule $NewNames[3] 'Inbound' 'Allow' 'UDP' $Phone $null
  foreach($name in $NewNames){
    $rule=Get-NetFirewallRule -Name $name -ErrorAction Stop
    if(($rule | Get-NetFirewallApplicationFilter).Program -ine $Bds){
      throw "Unexpected temporary firewall rule: $name"
    }
  }
  foreach($name in @($NewNames[0],$NewNames[1])){
    $addr=(Get-NetFirewallRule -Name $name | Get-NetFirewallAddressFilter).RemoteAddress
    if($addr -ne 'Internet'){throw 'Internet-only block not accepted by Windows firewall.'}
  }
  foreach($name in @($NewNames[2],$NewNames[3])){
    $addr=(Get-NetFirewallRule -Name $name | Get-NetFirewallAddressFilter).RemoteAddress
    if($addr -ne $Phone){throw 'Phone-only firewall exception not accepted.'}
  }
  $markerData=@{pc=$HostAddress;phone=$Phone;tcpPort=$Port;mode='nethernet_lab_lan_only'}
  $markerData | ConvertTo-Json | Set-Content $Marker -Encoding UTF8
  foreach($name in $OriginalNames){
    Disable-NetFirewallRule -InputObject (OriginalRule $name) -ErrorAction Stop
  }
  if(@(Get-NetFirewallRule -Name $NewNames[2] -ErrorAction Stop).Count -ne 1){
    throw 'TCP phone rule unavailable after switch.'
  }
  Write-Host 'NCBR_NETHERNET_PHONE_READY'
  Write-Host "Redmi: $HostAddress port $Port (TCP signaling + UDP/WebRTC)."
  Write-Host 'Finish by running -Mode Cleanup before cleaning up BDS lab.'
 } catch {
  try{RestoreOriginal}catch{Write-Host 'WARNING: restore original BDS blocks MANUALLY before reconnecting to networks.'}
  try{RemoveCreated}catch{}
  if(Test-Path $Marker){Remove-Item $Marker -Force -ErrorAction SilentlyContinue}
  throw
 }
} catch {
 Write-Host ('NCBR_NETHERNET_PHONE_ERROR: '+$_.Exception.Message)
 exit 1
}
