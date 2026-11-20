// Produces a separate inert Gate A build; does not modify the prior v0.2.0 pack.
import {readFileSync,mkdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
const base=resolve("minecraft/delivery-simulation/gate-a-minimal");
const manifest=JSON.parse(readFileSync(join(base,"manifest.json"),"utf8"));
const main=readFileSync(join(base,"scripts/main.js"),"utf8");
if(manifest.header.uuid!=="91bc21f7-a701-4f06-9785-7126cbdb67f1" ||
   manifest.modules.length!==1 ||
   manifest.modules[0].uuid!=="16f58c35-975f-45ac-a512-85f282b7ea45" ||
   manifest.modules[0].entry!=="scripts/main.js" ||
   manifest.dependencies.length!==1 ||
   manifest.dependencies[0].module_name!=="@minecraft/server" ||
   manifest.dependencies[0].version!=="1.17.0" ||
   main.trim()!=='import { system } from "@minecraft/server";\nsystem.run(() => console.warn("[NetCraft Gate A] MINIMAL OFF loaded; no delivery or network."));')
  throw new Error("Minimal Gate A source differs from reviewed inert baseline");
const dest=resolve("dist/bds-off");
mkdirSync(dest,{recursive:true});
const args=["-c","import sys,zipfile,pathlib; b=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED); [z.write(b/f,f) for f in ['manifest.json','scripts/main.js']]; z.close()",base,join(dest,"NetCraft_Delivery_GateA_Minimal_OFF_v0.2.1.mcpack")];
try{execFileSync("python3",args,{stdio:"inherit"});}catch{execFileSync("python",args,{stdio:"inherit"});}
console.log("Minimal Gate A packaged offline only.");
