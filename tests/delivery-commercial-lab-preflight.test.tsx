import {test} from "node:test";
import assert from "node:assert/strict";
// @ts-ignore -- preflight is a pure Minecraft-side JavaScript module.
import {commercialLabPreflight,installCommercialLabPreflight}
  from "../minecraft/delivery-commercial-candidate/commercial_lab_preflight.js";
const off={version:"2.3.76",mode:"LAB_OFF",dispatchEnabled:false,
  realPaymentsEnabled:false,networkEnabled:false,deliveryEnabled:false};
const tags=["ncbr:vip_explorer","ncbr:vip_elite","ncbr:vip_supreme"];
const Server={DeliveryCommercial:{getStatus:()=>off},
  DeliveryLink:{linkPurchase:()=>{}},
  VIPSystem:{grantDeliveryVIPLab:()=>{},vipRanks:new Map(tags.map(t=>[t,{}]))},
  Ranks:{getRank:(t:string)=>tags.includes(t)?{}:null}};
const world={getDynamicProperty:()=>undefined,
  setDynamicProperty:()=>{throw Error("DIAGNOSTIC_MUST_NOT_WRITE")}};
test("2.3.76 preflight checks local interfaces but NEVER authorizes commerce",()=>{
  const report=commercialLabPreflight(Server,world);
  assert.equal(report.mode,"LAB_OFF_DIAGNOSTIC");
  assert.equal(report.canCharge,false);
  assert.equal(report.canGrantCommercial,false);
  assert.ok(Object.values(report.checks).every(Boolean));
});
test("broken release flags or unavailable receipt APIs fail diagnostic closed",()=>{
  assert.equal(commercialLabPreflight({},world).checks.commerceHardOff,false);
  const unsafe={DeliveryCommercial:{getStatus:()=>({...off,networkEnabled:true})}};
  assert.equal(commercialLabPreflight(unsafe,world).checks.commerceHardOff,false);
  assert.equal(commercialLabPreflight(Server,{}).checks.persistentReceiptApiReady,false);
});
test("read-only staff event never responds to non-admin or logs credentials",()=>{
  let listener:(e:any)=>void=()=>{};
  const logs:string[]=[],messages:string[]=[];
  const system={afterEvents:{scriptEventReceive:{subscribe:(fn:(e:any)=>void)=>{
    listener=fn;
  }}}};
  const result=installCommercialLabPreflight({
    Server,world,system,log:(s:string)=>logs.push(s),
  });
  const event={id:"ncbr:commercial_check_v1",
    sourceEntity:{typeId:"minecraft:player",isValid:true,
      hasTag:(_t:string)=>false,
      sendMessage:(s:string)=>messages.push(s)}};
  listener(event);
  assert.equal(messages.length,0);
  event.sourceEntity.hasTag=(tag:string)=>tag==="admin";
  listener(event);
  assert.equal(messages.length,2);
  assert.match(messages[0],/LAB_OFF/);
  assert.equal(result.eventId,"ncbr:commercial_check_v1");
  assert.equal(logs.length,2);
  assert.ok(logs.every(s=>!s.includes("SECRET")&&!s.includes("TOKEN")));
});
test("lab preflight cannot read network clients or private secrets",()=>{
  let accessed=false;
  const disguised={DeliveryCommercial:{getStatus:()=>off},
    get Net(){accessed=true;throw Error("forbidden");},
    get Secrets(){accessed=true;throw Error("forbidden");},
    VIPSystem:Server.VIPSystem,Ranks:Server.Ranks};
  commercialLabPreflight(disguised,world);
  assert.equal(accessed,false);
});
