// Deterministic OFF Bedrock BP/RP ZIP packaging (GitHub Actions Ubuntu).
// Never installs anything into MagnoHost or modifies any existing Core pack.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
const root=path.resolve("minecraft/delivery-core-v040-clone");
const target=path.resolve("dist/bds-off");
const version=[0,4,0];
const bp=JSON.parse(fs.readFileSync(path.join(root,"bp/manifest.json"),"utf8"));
const rp=JSON.parse(fs.readFileSync(path.join(root,"rp/manifest.json"),"utf8"));
const sameVersion=v=>JSON.stringify(v)===JSON.stringify(version);
for(const m of [bp,rp]){
 if(m.format_version!==2 || !sameVersion(m.header?.version) ||
    !Array.isArray(m.modules)||m.modules.length!==1 ||
    !sameVersion(m.modules[0].version)||
    !/^[a-f0-9-]{36}$/.test(m.header?.uuid||"")||
    !/^[a-f0-9-]{36}$/.test(m.modules[0].uuid||""))
  throw Error("invalid_or_mismatched_manifest_version");
}
const uuids=[bp.header.uuid,rp.header.uuid,bp.modules[0].uuid,rp.modules[0].uuid];
if(new Set(uuids).size!==4)throw Error("duplicate_pack_uuid");
if(bp.modules[0].type!=="script" || bp.modules[0].language!=="javascript" ||
   bp.modules[0].entry!=="scripts/main.js" ||
   rp.modules[0].type!=="resources" ||
   !bp.dependencies?.some(x=>x.uuid===rp.header.uuid&&sameVersion(x.version))||
   !bp.dependencies?.some(x=>x.module_name==="@minecraft/server"&&x.version==="1.17.0")||
   bp.dependencies.length!==2)
 throw Error("invalid_bp_rp_dependency");
const entry=fs.readFileSync(path.join(root,"bp/scripts/main.js"),"utf8");
const engine=fs.readFileSync(path.join(root,"core_delivery_engine.js"),"utf8");
// Check executable behavior rather than benign source comments.
if(!entry.includes("CLONE_PACKAGE_OFF_NO_GRANTS") ||
   /(?:http\.request|runInterval|setDynamicProperty|secrets\.get|\.execute\()/.test(entry) ||
   /^\s*import\s+.*(?:core_delivery_engine|@minecraft\/server-net)/m.test(entry))
  throw Error("entrypoint_not_inert");
for(const marker of ["ncbr:vip_explorer","ncbr:vip_elite","ncbr:vip_supreme",
 "identity_unverified","already_applied","vip_upgrade_review_required"])
 if(!engine.includes(marker))throw Error("missing_clone_executor_guard:"+marker);
if(/MERCADOPAGO_ACCESS_TOKEN|FIREBASE_SERVICE_ACCOUNT_JSON/.test(engine+entry))
 throw Error("sensitive_environment_marker_in_pack");
fs.mkdirSync(target,{recursive:true});
const output=path.join(target,"NetCraft_Delivery_Core_Clone_LAB_OFF_v0.4.0.mcaddon");
const py=`
import sys,zipfile,pathlib,json,hashlib,io
root=pathlib.Path(sys.argv[1])
output=pathlib.Path(sys.argv[2])
specs=[
 ('NetCraft_Delivery_Core_BP_LAB_OFF_v0.4.0.mcpack', [
  ('manifest.json',root/'bp/manifest.json'),
  ('scripts/main.js',root/'bp/scripts/main.js'),
  ('scripts/core_delivery_engine.js',root/'core_delivery_engine.js'),
 ]),
 ('NetCraft_Delivery_Core_RP_LAB_OFF_v0.4.0.mcpack',[
  ('manifest.json',root/'rp/manifest.json'),
  ('texts/languages.json',root/'rp/texts/languages.json'),
  ('texts/en_US.lang',root/'rp/texts/en_US.lang'),
  ('texts/pt_BR.lang',root/'rp/texts/pt_BR.lang'),
 ]),
]
def zinfo(name):
 zi=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0))
 zi.compress_type=zipfile.ZIP_DEFLATED
 zi.external_attr=0o644<<16
 return zi
def build(files):
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w') as z:
  for name,src in files:z.writestr(zinfo(name),src.read_bytes())
 return b.getvalue()
packs={name:build(files) for name,files in specs}
with zipfile.ZipFile(output,'w') as addon:
 for name in sorted(packs):addon.writestr(zinfo(name),packs[name])
with zipfile.ZipFile(output) as addon:
 assert len(addon.namelist())==2
 for name in addon.namelist():
  with zipfile.ZipFile(io.BytesIO(addon.read(name))) as z:
   m=json.loads(z.read('manifest.json'))
   assert m['header']['version']==[0,4,0]
   assert m['modules'][0]['version']==[0,4,0]
   if 'Core_BP_' in name:
    code=z.read('scripts/main.js').decode()
    assert 'CLONE_PACKAGE_OFF_NO_GRANTS' in code
    assert not any(x in code for x in ('http.request','runInterval','core_delivery_engine','secrets.get'))
    assert b'createCoreDeliveryCloneEngine' in z.read('scripts/core_delivery_engine.js')
print(hashlib.sha256(output.read_bytes()).hexdigest())
`;
const child=spawnSync("python3",["-c",py,root,output],{encoding:"utf8"});
if(child.status!==0)throw Error("packaging_failed:"+String(child.stderr).slice(0,500));
const hash=crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex");
if(!child.stdout.includes(hash))throw Error("package_sha256_verification_failed");
const report={name:path.basename(output),version:"0.4.0",kind:"mcaddon",
 packages:["BP","RP"],sha256:hash,dispatchEnabled:false,
 installsCoreOriginal:false,productionReady:false,commercialPayments:false,
 offlineCloneOnly:true};
fs.writeFileSync(path.join(target,"netcraft-delivery-v040-integrity.json"),
 JSON.stringify(report,null,2)+"\n");
console.log("PASS clone-only BP/RP version and dependency validation, ZIP integrity SHA256",hash);
