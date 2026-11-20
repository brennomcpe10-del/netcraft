# Offline-only validation of the extracted GitHub Actions OFF mcpack.
# Does not launch BDS, use secrets or contact the network.
param(
    [Parameter(Mandatory=$true)][string]$PackPath
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
$expected = @("manifest.json","scripts/main.js","scripts/secretHeaderProbe.js","scripts/capabilityInspection.js")
$full = (Resolve-Path -LiteralPath $PackPath).Path
if (-not $full.EndsWith(".mcpack", [StringComparison]::OrdinalIgnoreCase)) { throw "Expected .mcpack" }
$zip = [System.IO.Compression.ZipFile]::OpenRead($full)
try {
    $names = @($zip.Entries | ForEach-Object { $_.FullName })
    if (@(Compare-Object $expected $names).Count -ne 0 -or $names.Count -ne $expected.Count) {
        throw "Unexpected OFF pack contents"
    }
    function Read-ZipText([string]$name) {
        $entry = $zip.GetEntry($name)
        if ($null -eq $entry) { throw "Missing expected entry" }
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    }
    $manifest = Read-ZipText "manifest.json" | ConvertFrom-Json
    $entry = Read-ZipText "scripts/main.js"
    if ($manifest.header.name -ne "NetCraft Delivery Homologacao OFF" -or
        $manifest.header.uuid -ne "6c521552-24ef-4339-9212-e2a349ace991" -or
        ($manifest.header.version -join ".") -ne "0.2.0" -or
        $manifest.modules.Count -ne 1 -or
        $manifest.modules[0].uuid -ne "99ac2e49-b003-46fc-8473-55700984acc7" -or
        $manifest.modules[0].entry -ne "scripts/main.js" -or
        ($manifest.modules[0].version -join ".") -ne "0.2.0") {
        throw "Unexpected OFF manifest identity"
    }
    $deps = @{}
    foreach ($dep in $manifest.dependencies) {
        if ($deps.ContainsKey($dep.module_name)) { throw "Repeated module dependency" }
        $deps[$dep.module_name] = $dep.version
    }
    if ($deps.Count -ne 3 -or
        $deps["@minecraft/server"] -ne "1.17.0" -or
        $deps["@minecraft/server-admin"] -ne "1.0.0-beta" -or
        $deps["@minecraft/server-net"] -ne "1.0.0-beta") { throw "Unexpected dependency version" }
    if ($entry -notmatch "modo OFF" -or
        $entry -match "http\.request|secrets\.get|secretHeaderProbe|capabilityInspection|runInterval|runTimeout|runJob|playerSpawn|runCommand") {
        throw "Entrypoint not inert"
    }
    $hash = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
    Write-Output "PASS: offline OFF pack structure and identity verified"
    Write-Output "SHA256: $hash"
    Write-Output "Runtime BDS compatibility: NOT VERIFIED"
} finally { $zip.Dispose() }
