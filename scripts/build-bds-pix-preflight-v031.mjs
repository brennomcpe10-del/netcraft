// Deterministic two-file Minecraft Bedrock Dedicated Server 0.3.1 probe pack.
// No installation, world modification, remote network calls, or deployment.
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const base = resolve('minecraft/delivery-v031-preflight');
const manifest = JSON.parse(readFileSync(join(base,'manifest.json'),'utf8'));
const main = readFileSync(join(base,'scripts/main.js'),'utf8');
if (manifest.header.uuid !== 'bd4cd42e-f32f-4ca2-8f9c-ce73377cabf9' ||
    manifest.header.name !== 'NetCraft Delivery Pix v0.3.1 BDS Preflight OFF' ||
    JSON.stringify(manifest.header.version) !== '[0,3,1]' ||
    manifest.modules.length !== 1 ||
    manifest.modules[0].entry !== 'scripts/main.js' ||
    manifest.modules[0].uuid !== 'b71c5a3e-3b1e-4bfd-8485-5c05631ce280' ||
    JSON.stringify(manifest.modules[0].version) !== '[0,3,1]' ||
    JSON.stringify(manifest.dependencies) !== JSON.stringify([
      {module_name:'@minecraft/server',version:'1.17.0'},
      {module_name:'@minecraft/server-admin',version:'1.0.0-beta'},
      {module_name:'@minecraft/server-net',version:'1.0.0-beta'}
    ])) throw Error('v031_manifest_mismatch');
if (!main.includes("variables.get(ENABLE) === true") ||
    !main.includes("https://127.0.0.1:18443") ||
    !main.includes("AUTHENTICATED_READ_ONLY_PREFLIGHT_PASS") ||
    !main.includes("secrets.get(SECRET)") ||
    /['"]\/delivery\/(poll|ack|nack)['"]|runCommand|\.addItem\(|\.addTag\(|runInterval|world\.getAllPlayers|Math\.random|eval\(/.test(main))
  throw Error('v031_read_only_guard_failed');
const output = resolve('dist/bds-off'); mkdirSync(output,{recursive:true});
const dest = join(output,'NetCraft_Delivery_Pix_Preflight_OFF_v0.3.1.mcpack');
const args = ['-c',
"import pathlib,sys,zipfile; b=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED); [z.write(b/f,f) for f in ['manifest.json','scripts/main.js']]; z.close()",
base,dest];
try { execFileSync('python3',args,{stdio:'inherit'}); }
catch { execFileSync('python',args,{stdio:'inherit'}); }
console.log('NetCraft Delivery Pix v0.3.1 OFF preflight built, no install or deploy.');
