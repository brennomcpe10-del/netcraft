param(
  [ValidateSet('Prepare','Cleanup')][string]$Mode='Prepare',
  [string]$Gamertag='',
  [string]$AddonPath="$env:USERPROFILE\Downloads\NetCraftCore_v2.2.8_BDS_E2E_LAB_OFF.mcaddon"
)
$ErrorActionPreference='Stop'
$bds='C:\NetCraft-Lab\BDS-GateA'
$lab='C:\NetCraft-Lab\DeliveryE2E'
$world="$bds\worlds\NetCraftDeliveryE2E"
$bp="$bds\behavior_packs\NetCraftDeliveryE2E_Core"
$rp="$bds\resource_packs\NetCraftDeliveryE2E_Core"
$moduleId='bacf7af0-3528-5c77-a991-8bf0613b038a'
$cfg="$bds\config\$moduleId"
$properties="$bds\server.properties"
$backup="$lab\server.properties.backup"
$marker="$lab\started.json"
$thumb='1EB70D54662EDB873B21C34F1341EF6382D4C214'
$trust="Cert:\CurrentUser\Root\$thumb"
$utf8=New-Object System.Text.UTF8Encoding($false)
function SaveJson([string]$file,$obj) {
  [IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject $obj -Depth 12),$utf8)
}
function OwnListener {
  $listeners=@(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 18443 -State Listen -ErrorAction SilentlyContinue)
  foreach($listener in $listeners){
    $proc=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if(!$proc -or $proc.Name -ne 'node.exe' -or $proc.CommandLine -notlike '*DeliveryE2E\local_server.cjs*'){
      throw 'Porta HTTPS usada por outro processo. Nao modificar.'
    }
    Stop-Process -Id $proc.ProcessId -ErrorAction Stop
  }
}
try {
  if(Get-Process bedrock_server -ErrorAction SilentlyContinue){throw 'Encerre o BDS com stop primeiro.'}
  if(!(Test-Path "$bds\bedrock_server.exe")){throw 'BDS de testes nao encontrado.'}
  foreach($name in @('NetCraft LAB - Bloquear entrada','NetCraft LAB - Bloquear saida')){
    $rule=Get-NetFirewallRule -DisplayName $name -ErrorAction Stop
    $app=$rule | Get-NetFirewallApplicationFilter
    if($rule.Enabled.ToString() -ne 'True' -or $rule.Action.ToString() -ne 'Block' -or
       $app.Program -ine "$bds\bedrock_server.exe"){throw "Firewall alterado: $name"}
  }
  if($Mode -eq 'Cleanup'){
    if(!(Test-Path $marker)){throw 'Sem laboratorio E2E registrado para limpeza.'}
    OwnListener
    $state=Get-Content $marker -Raw | ConvertFrom-Json
    if(!(Test-Path $backup)){throw 'Backup do server.properties ausente; nao substituir.'}
    if((Get-Content $properties) -notcontains 'level-name=NetCraftDeliveryE2E'){
      throw 'Outro mundo esta selecionado; limpeza nao substituira server.properties.'
    }
    Copy-Item $backup $properties -Force
    if(Test-Path $cfg){
      $unexpected=@(Get-ChildItem $cfg -File | Where-Object {$_.Name -notin @('permissions.json','variables.json','secrets.json')})
      if($unexpected.Count -gt 0){throw 'Configuracao desconhecida do modulo; revisar manualmente.'}
      Remove-Item $cfg -Recurse -Force
    }
    if($state.addedTrust -eq $true -and (Test-Path $trust)){Remove-Item $trust -Force}
    foreach($owned in @($world,$bp,$rp)){
      if(Test-Path $owned){Remove-Item $owned -Recurse -Force}
    }
    foreach($file in @('synthetic.json','gate-c2-cert.pfx','e2e-receipts.json','local_server.cjs','server-stdout.log','server-stderr.log','extract')){
      $target=Join-Path $lab $file
      if(Test-Path $target){Remove-Item $target -Recurse -Force}
    }
    Remove-Item $marker -Force
    Write-Host 'NETCRAFT_DELIVERY_E2E_CLEANED'
    exit 0
  }
  if((Get-Content $properties) -notcontains 'level-name=NetCraftGateC'){
    throw 'O BDS nao voltou para NetCraftGateC; finalize a limpeza anterior.'
  }
  if(!(Test-Path "$bds\worlds\NetCraftGateC2")){throw 'Mundo base clonado NetCraftGateC2 nao encontrado.'}
  if($Gamertag -cnotmatch '^[A-Za-z0-9_ ]{1,32}$' -or $Gamertag.Trim() -cne $Gamertag){
    throw 'Gamertag invalida. Use -Gamertag com o nick exato.'
  }
  $expectedAddon='70f029d2bb48a4de1cb1af0c7532d4eac455f317ad5b05ab42a0e357f2406026'
  if(!(Test-Path $AddonPath)){throw 'Addon 2.2.8 nao encontrado na pasta Downloads.'}
  if((Get-Item $AddonPath).Length -lt 1000000){throw 'Addon incompleto ou vazio. Recuse este download.'}
  if((Get-FileHash $AddonPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedAddon){
    throw 'SHA-256 do addon nao confere; nao prosseguir.'
  }
  foreach($target in @($marker,$backup,$world,$bp,$rp,$cfg)){
    if(Test-Path $target){throw "O destino ja existe, nao sobrescrever: $target"}
  }
  if(@(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 18443 -State Listen -ErrorAction SilentlyContinue).Count -gt 0){
    throw 'A porta 18443 esta ocupada. Nao interferir no Gate C.2.'
  }
  $cert=Get-Item "Cert:\CurrentUser\My\$thumb" -ErrorAction Stop
  if($cert.NotAfter -le (Get-Date)){throw 'Certificado de laboratorio expirado.'}
  $node=(Get-Command node.exe -ErrorAction Stop).Source

  # Fetch only a reviewed, pinned, non-production localhost test service.
  $serverUrl='https://raw.githubusercontent.com/brennomcpe10-del/netcraft/11a95a67bb815171ac081bd1e6d7b71a020cb3a7/minecraft/delivery-e2e-local/local_server.cjs'
  $serverHash='d8bc179a57a7018b0d95107f977c9197e9299ad7c85d3c03bbb662ba071cab1b'
  New-Item -ItemType Directory -Path $lab -Force | Out-Null
  $serverPath="$lab\local_server.cjs"
  Invoke-WebRequest -Uri $serverUrl -OutFile $serverPath -ErrorAction Stop
  if((Get-FileHash $serverPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $serverHash){
    throw 'Codigo HTTPS de laboratorio nao corresponde ao commit auditado.'
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $temp="$lab\extract"
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  [IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path $AddonPath).Path,$temp)
  $bpPack=Join-Path $temp 'NetCraftCore_BP_v2.2.8_BDS_E2E_LAB_OFF.mcpack'
  $rpPack=Join-Path $temp 'NetCraftCore_RP_v2.2.7.mcpack'
  if(!(Test-Path $bpPack) -or !(Test-Path $rpPack)){throw 'Addon nao contem os dois packs esperados.'}
  [IO.Compression.ZipFile]::ExtractToDirectory($bpPack,$bp)
  [IO.Compression.ZipFile]::ExtractToDirectory($rpPack,$rp)
  $man=Get-Content "$bp\manifest.json" -Raw | ConvertFrom-Json
  if($man.header.uuid -ne 'ef9aec80-ddda-574d-be7c-e833fcfbc32a' -or
    ($man.header.version -join '.') -ne '2.2.8'){throw 'Behavior Pack inesperado.'}
  Copy-Item "$bds\worlds\NetCraftGateC2" $world -Recurse -Force
  SaveJson "$world\world_behavior_packs.json" @(@{pack_id='ef9aec80-ddda-574d-be7c-e833fcfbc32a';version=@(2,2,8)})
  SaveJson "$world\world_resource_packs.json" @(@{pack_id='e293f428-6467-5dda-a112-b0a76adfbd24';version=@(2,2,7)})
  New-Item -ItemType Directory -Path $cfg -Force | Out-Null
  SaveJson "$cfg\permissions.json" @{
    allowed_modules=@('@minecraft/server','@minecraft/server-ui','@minecraft/server-admin','@minecraft/server-net')
    module_permissions=@{'@minecraft/server-net'=@{
      allowed_uris=@('https://127.0.0.1:18443/delivery/challenge','https://127.0.0.1:18443/delivery/poll','https://127.0.0.1:18443/delivery/ack')
      force_tls=$true;max_body_bytes=4096;max_concurrent_requests=2
    }}
  }
  $bytes=New-Object byte[] 32
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
  $token=([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
  SaveJson "$cfg\variables.json" @{ncbr_e2e_lab_enabled=$true}
  SaveJson "$cfg\secrets.json" @{ncbr_e2e_lab_token=$token}
  SaveJson "$lab\synthetic.json" @{nc_delivery_e2e_token=$token;gamertag=$Gamertag;kind='items'}
  $token=$null
  Copy-Item $properties $backup
  SaveJson $marker @{addedTrust=$false;level='NetCraftDeliveryE2E'}
  (Get-Content $properties) | ForEach-Object {
    if($_ -eq 'level-name=NetCraftGateC'){'level-name=NetCraftDeliveryE2E'}else{$_}
  } | Set-Content $properties -Encoding ASCII
  $addedTrust=$false
  if(!(Test-Path $trust)){
    $tmp="$lab\temp-root.cer"
    try{
      [IO.File]::WriteAllBytes($tmp,$cert.RawData)
      Import-Certificate -FilePath $tmp -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
      $addedTrust=$true
    } finally {Remove-Item $tmp -Force -ErrorAction SilentlyContinue}
  }
  $password=[guid]::NewGuid().ToString('N')
  $secure=ConvertTo-SecureString $password -AsPlainText -Force
  Export-PfxCertificate -Cert $cert -FilePath "$lab\gate-c2-cert.pfx" -Password $secure -CryptoAlgorithmOption AES256_SHA256 | Out-Null
  SaveJson $marker @{addedTrust=$addedTrust;level='NetCraftDeliveryE2E'}
  $env:NC_DELIVERY_E2E_LOCAL='1'
  $env:NC_GATE_C_PFX_PASSWORD=$password
  $env:NC_E2E_LAB_DIR=$lab
  try{
    Start-Process -FilePath $node -ArgumentList ('"'+"$lab\local_server.cjs"+'"') -WorkingDirectory $lab -RedirectStandardOutput "$lab\server-stdout.log" -RedirectStandardError "$lab\server-stderr.log" | Out-Null
  } finally {
    Remove-Item Env:\NC_DELIVERY_E2E_LOCAL,Env:\NC_GATE_C_PFX_PASSWORD,Env:\NC_E2E_LAB_DIR -ErrorAction SilentlyContinue
    $password=$null
  }
  Start-Sleep -Seconds 1
  if(@(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 18443 -State Listen -ErrorAction SilentlyContinue).Count -ne 1){
    throw 'Servidor HTTPS nao iniciou. Execute Cleanup para restaurar.'
  }
  Write-Host 'NETCRAFT_DELIVERY_E2E_PREPARED'
  Write-Host 'Inicie BDS em C:\NetCraft-Lab\BDS-GateA e conecte seu jogador localmente na porta 19142.'
} catch {
  Write-Host ('NETCRAFT_DELIVERY_E2E_ERROR: '+$_.Exception.Message)
  exit 1
}
