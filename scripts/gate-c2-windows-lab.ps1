param(
  [ValidateSet("Prepare","Cleanup")][string]$Mode = "Prepare",
  [string]$Commit = ""
)
$ErrorActionPreference = "Stop"
$bds = "C:\NetCraft-Lab\BDS-GateA"
$lab = "C:\NetCraft-Lab\GateC-HTTPS"
$thumb = "1EB70D54662EDB873B21C34F1341EF6382D4C214"
$moduleId = "8c5efdab-2f90-4d8d-9dc7-9b1bb49ac3fa"
$packId = "7ba25e40-c7a4-4f0a-a68e-17fc47f32c57"
$pack = "$bds\behavior_packs\NetCraftGateC2_Local"
$world = "$bds\worlds\NetCraftGateC2"
$cfg = "$bds\config\$moduleId"
$props = "$bds\server.properties"
$backup = "$props.gateC2.backup"
$rootCert = "Cert:\CurrentUser\Root\$thumb"
$utf8 = New-Object Text.UTF8Encoding($false)

function SaveJson($path,$obj) {
  [IO.File]::WriteAllText($path,(ConvertTo-Json -InputObject $obj -Depth 12),$utf8)
}
function StopOnlyOurNode {
  $listeners = @(Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 18443 -State Listen -ErrorAction SilentlyContinue)
  foreach($listener in $listeners) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($p.Name -ne "node.exe" -or $p.CommandLine -notlike '*GateC-HTTPS\gate-c2-local-server.cjs*') {
      throw "A porta HTTPS pertence a outro processo; nao sera encerrado."
    }
    Stop-Process -Id $p.ProcessId -ErrorAction Stop
  }
}
try {
  if (Get-Process bedrock_server -ErrorAction SilentlyContinue) { throw "Encerre o BDS usando stop." }
  if (@(Get-MpThreat | Where-Object {$_.IsActive}).Count -gt 0) { throw "Defender detectou ameaca ativa." }
  foreach($name in @("NetCraft LAB - Bloquear entrada","NetCraft LAB - Bloquear saida")) {
    $rule = Get-NetFirewallRule -DisplayName $name -ErrorAction Stop
    $app = $rule | Get-NetFirewallApplicationFilter
    if ($rule.Enabled.ToString() -ne "True" -or $rule.Action.ToString() -ne "Block" -or
        $app.Program -ine "$bds\bedrock_server.exe") { throw "Firewall alterado: $name" }
  }

  if ($Mode -eq "Cleanup") {
    StopOnlyOurNode
    if (Test-Path "$cfg\variables.json") {
      SaveJson "$cfg\variables.json" @{nc_gate_c2_enabled=$false}
    }
    if (Test-Path "$cfg\secrets.json") {
      $keys = @((Get-Content "$cfg\secrets.json" -Raw | ConvertFrom-Json).PSObject.Properties.Name)
      if ($keys.Count -ne 1 -or $keys[0] -ne "nc_gate_c2_synthetic_token") {
        throw "Segredos inesperados; limpeza interrompida."
      }
      Remove-Item "$cfg\secrets.json" -Force
    }
    if (Test-Path $backup) {
      if ((Get-Content $props) -contains "level-name=NetCraftGateC2" -and
          (Get-Content $backup) -contains "level-name=NetCraftGateC") {
        Copy-Item $backup $props -Force
      }
    }
    if (Test-Path $rootCert) { Remove-Item $rootCert -Force }
    if (Test-Path "$lab\gate-c2-cert.pfx") { Remove-Item "$lab\gate-c2-cert.pfx" -Force }
    Write-Host "GATE_C2_LAB_CLEANED" -ForegroundColor Green
    Write-Host "BDS/HTTPS encerrados; token de modulo removido; TLS temporario removido; Firewall preservado."
    return
  }

  if ($Commit -notmatch '^[a-f0-9]{40}$') { throw "Informe o commit GitHub fixo em -Commit." }
  if ((Get-Content $props) -notcontains "level-name=NetCraftGateC") { throw "Gate C nao e o mundo atual." }
  if (!(Test-Path "$bds\worlds\NetCraftGateC\level.dat")) { throw "Mundo Gate C ausente." }
  if ((Test-Path $world) -or (Test-Path $pack) -or (Test-Path $cfg) -or (Test-Path $backup)) {
    throw "Gate C.2 ja existe; nenhum arquivo foi sobrescrito."
  }
  if (Get-NetTCPConnection -LocalPort 18443 -State Listen -ErrorAction SilentlyContinue) {
    throw "Porta 18443 ocupada. Encerre somente o servico anterior."
  }
  foreach($f in @("synthetic.json","cert.pem","probe.cjs")) {
    if (!(Test-Path "$lab\$f")) { throw "Arquivo do Gate C ausente: $f" }
  }
  $token = (Get-Content "$lab\synthetic.json" -Raw | ConvertFrom-Json).nc_gate_c_synthetic
  if ($token -cnotmatch '^[a-f0-9]{64}$') { throw "Token sintetico invalido." }
  $cert = Get-Item "Cert:\CurrentUser\My\$thumb" -ErrorAction Stop
  if ($cert.Subject -ne "CN=localhost" -or !$cert.HasPrivateKey -or $cert.NotAfter -le (Get-Date).AddMinutes(15)) {
    throw "Certificado anterior expirado ou proximo de expirar. Nao foi criada confianca nova."
  }
  $pem = Get-Content "$lab\cert.pem" -Raw
  $match = [regex]::Match($pem,'(?s)-----BEGIN CERTIFICATE-----\s*(.*?)\s*-----END CERTIFICATE-----')
  if (!$match.Success) { throw "PEM invalido." }
  $pemCert = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
    [Convert]::FromBase64String(($match.Groups[1].Value -replace '\s','')))
  if ($pemCert.Thumbprint -ne $thumb) { throw "PEM nao corresponde ao certificado." }

  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $base = "https://raw.githubusercontent.com/brennomcpe10-del/netcraft/$Commit"
  $manifestText = (Invoke-WebRequest "$base/minecraft/delivery-simulation/gate-c2-local/manifest.json" -UseBasicParsing).Content
  $scriptText = (Invoke-WebRequest "$base/minecraft/delivery-simulation/gate-c2-local/scripts/main.js" -UseBasicParsing).Content
  $serverText = (Invoke-WebRequest "$base/scripts/gate-c2-local-server.cjs" -UseBasicParsing).Content
  $manifest = $manifestText | ConvertFrom-Json
  if ($manifest.header.uuid -ne $packId -or $manifest.modules[0].uuid -ne $moduleId -or
      $manifest.header.name -ne "NetCraft Delivery Gate C.2 Local OFF" -or
      $scriptText -notmatch 'nc_gate_c2_enabled' -or
      $serverText -notmatch 'GATE_C2_HTTPS_LOCAL_READY') {
    throw "Fonte GitHub diferente do Gate C.2 revisado."
  }

  Copy-Item "$bds\worlds\NetCraftGateC" $world -Recurse
  New-Item -ItemType Directory "$pack\scripts" -Force | Out-Null
  New-Item -ItemType Directory $cfg -Force | Out-Null
  [IO.File]::WriteAllText("$pack\manifest.json",$manifestText,$utf8)
  [IO.File]::WriteAllText("$pack\scripts\main.js",$scriptText,$utf8)
  [IO.File]::WriteAllText("$lab\gate-c2-local-server.cjs",$serverText,$utf8)
  SaveJson "$world\world_behavior_packs.json" @(@{pack_id=$packId;version=@(0,0,1)})
  SaveJson "$cfg\permissions.json" @{
    allowed_modules=@("@minecraft/server","@minecraft/server-admin","@minecraft/server-net")
    module_permissions=@{"@minecraft/server-net"=@{
      allowed_uris=@("https://127.0.0.1:18443/delivery/challenge","https://127.0.0.1:18443/delivery/poll")
      force_tls=$true;max_body_bytes=1024;max_concurrent_requests=1
    }}
  }
  SaveJson "$cfg\variables.json" @{nc_gate_c2_enabled=$true}
  SaveJson "$cfg\secrets.json" @{nc_gate_c2_synthetic_token=$token}
  $token = $null
  Copy-Item $props $backup
  $updated = (Get-Content $props) | ForEach-Object {
    if ($_ -eq "level-name=NetCraftGateC") {"level-name=NetCraftGateC2"} else {$_}
  }
  Set-Content $props -Value $updated -Encoding ASCII

  if (!(Test-Path $rootCert)) {
    $tmp = "$lab\gate-c2-public-temp.cer"
    try {
      [IO.File]::WriteAllBytes($tmp,$cert.RawData)
      Import-Certificate -FilePath $tmp -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
    } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
  }
  $password = [guid]::NewGuid().ToString("N")
  $secure = ConvertTo-SecureString $password -AsPlainText -Force
  Export-PfxCertificate -Cert $cert -FilePath "$lab\gate-c2-cert.pfx" -Password $secure -CryptoAlgorithmOption AES256_SHA256 | Out-Null
  $env:NC_GATE_C2_LOCAL = "1"
  $env:NC_GATE_C_PFX_PASSWORD = $password
  try {
    $svc = Start-Process -FilePath $node -ArgumentList ('"' + "$lab\gate-c2-local-server.cjs" + '"') -WorkingDirectory $lab -RedirectStandardOutput "$lab\gate-c2-stdout.log" -RedirectStandardError "$lab\gate-c2-stderr.log" -PassThru
  } finally {
    Remove-Item Env:\NC_GATE_C2_LOCAL -ErrorAction SilentlyContinue
    Remove-Item Env:\NC_GATE_C_PFX_PASSWORD -ErrorAction SilentlyContinue
    $password = $null
  }
  Start-Sleep -Seconds 1
  & $node "$lab\probe.cjs"
  if ($LASTEXITCODE -ne 0 -or $svc.HasExited) { throw "Falha HTTPS local. Execute Cleanup." }
  Write-Host "GATE_C2_LAB_PREPARED" -ForegroundColor Green
  Write-Host "HTTPS local validado; mundo NetCraftGateC2 pronto; sem entregas ou ACK."
  Write-Host "Inicie o BDS, copie as mensagens [GATE_C2_BDS], encerre com stop e execute Cleanup."
} catch {
  Write-Host ("GATE_C2_ERROR: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host "Nao desative Firewall, TLS ou Defender. Se preparacao foi parcial, execute Cleanup com BDS parado."
}
