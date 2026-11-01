// Source-only ZIP for the disposable BDS Core CLONE v0.3.2 lab bridge.
// NOT a .mcaddon or a stand-alone behavior pack. No server or provider changes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
const source=resolve("minecraft/delivery-e2e-local");
const files=[
  "delivery_verified_outbox_bds.js",
  "verified_outbox_protocol.js",
  "fixture_gateway_origin.js",
];
const content=files.map(name=>[name,readFileSync(join(source,name),"utf8")]);
const checks=[
  ["delivery_verified_outbox_bds.js","ncbr_fixture_clone_only"],
  ["delivery_verified_outbox_bds.js","secrets.get(TOKEN)"],
  ["delivery_verified_outbox_bds.js","fixtureGatewayOrigin"],
  ["verified_outbox_protocol.js","labFixture"],
  ["fixture_gateway_origin.js","netcraft-delivery-fixture-clone-only"],
];
for(const [name,marker] of checks)
  if(!content.find(([file])=>file===name)?.[1].includes(marker))
    throw Error("fixture_bridge_source_not_ready:"+name);
if(content.some(([,value])=>/MERCADOPAGO_ACCESS_TOKEN|NC_BDS_TEST_TOKEN\s*=/.test(value)))
  throw Error("fixture_bridge_must_not_embed_secrets");
const target=resolve("dist/bds-off");
mkdirSync(target,{recursive:true});
const output=join(target,"NetCraft_Delivery_Fixture_Bridge_Source_v0.3.2.zip");
const script=[
  "import pathlib,sys,zipfile",
  "base=pathlib.Path(sys.argv[1]); dst=pathlib.Path(sys.argv[2])",
  "names=sys.argv[3:]",
  "with zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED) as out:",
  "  for name in sorted(names):",
  "    data=(base/name).read_bytes()",
  "    zi=zipfile.ZipInfo('scripts/'+name,date_time=(1980,1,1,0,0,0))",
  "    zi.compress_type=zipfile.ZIP_DEFLATED",
  "    zi.external_attr=0o644<<16",
  "    out.writestr(zi,data)",
].join("\n");
execFileSync("python3",["-c",script,source,output,...files],{stdio:"inherit"});
const report={
  version:"0.3.2",
  purpose:"Clone-only BDS Core fixture integration source",
  zip:"NetCraft_Delivery_Fixture_Bridge_Source_v0.3.2.zip",
  modules:files,
  installable:false,
  publicRelease:false,
  addonIncluded:false,
  deliveryEnabledByDefault:false,
  marketplacePayments:false,
};
writeFileSync(join(target,"fixture-bridge-v032-manifest.json"),JSON.stringify(report,null,2)+"\n");
console.log("PASS: source-only fixture gateway bridge v0.3.2 assembled; no .mcaddon, no install, no payments");
