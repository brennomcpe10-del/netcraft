// Offline-only build of the inert BDS preflight .mcpack. Never deploys.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
const base=resolve("minecraft/delivery-simulation/preflight-pack");
const manifest=JSON.parse(readFileSync(join(base,"manifest.json"),"utf8"));
if(manifest.header.name!=="NetCraft Delivery Homologacao OFF" ||
   manifest.modules.length!==1 ||
   manifest.modules[0].entry!=="scripts/main.js")
  throw new Error("Unsafe BDS preflight manifest");
const entry=readFileSync(join(base,"scripts/main.js"),"utf8");
if(/http\.request|secrets\.get|secretHeaderProbe|capabilityInspection|runInterval|runTimeout|runJob|playerSpawn|runCommand/.test(entry))
  throw new Error("Preflight entrypoint is not inert");
const out=resolve("dist/bds-off");
mkdirSync(out,{recursive:true});
// Explicit whitelist avoids bundling future test tools or secrets by accident.
// Python's standard-library zipfile creates Bedrock-compatible ZIP-based .mcpack.
const args=[
  "-c",
  "import sys,zipfile,pathlib; base=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]); "
  +"files=['manifest.json','scripts/main.js','scripts/secretHeaderProbe.js','scripts/capabilityInspection.js']; "
  +"z=zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED); "
  +"[(z.write(base/f,f)) for f in files]; z.close()",
  base,join(out,"NetCraft_Delivery_Homologacao_OFF_v0.2.0.mcpack")
];
try {execFileSync("python",args,{stdio:"inherit"});}
catch {execFileSync("python3",args,{stdio:"inherit"});}
console.log("OFF BDS preflight mcpack built locally; NO deployment performed.");
