import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {previewGameLinkLabAdminRouter,previewGameLinkLabBdsRouter}
  from "../server/routes/previewGameLinkLab.ts";
const vars=["VERCEL_ENV","VERCEL_GIT_COMMIT_REF","NCBR_PREVIEW_GAME_LINK_LAB_ENABLED",
  "NCBR_PREVIEW_BDS_LINK_TOKEN"];
async function serverRun(fn:(base:string)=>Promise<void>){
  const app=express();app.use(express.json({limit:"4kb"}));
  app.use("/api/delivery/lab-link",previewGameLinkLabAdminRouter);
  app.use("/api/delivery/bds",previewGameLinkLabBdsRouter);
  app.use("/api/delivery/bds",(_req,res)=>res.status(503).json({error:"delivery_release_off"}));
  let server:ReturnType<typeof app.listen>;
  await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});
  try{
    const address=server!.address();
    assert.ok(address&&typeof address!=="string");
    await fn("http://127.0.0.1:"+address.port);
  }finally{
    await new Promise<void>((resolve,reject)=>
      server!.close(e=>e?reject(e):resolve()));
  }
}
test("Preview LAB endpoints fail closed without independent Preview-only authorization",async()=>{
  const previous=Object.fromEntries(vars.map(x=>[x,process.env[x]]));
  try{
    for(const env of ["production","preview"]){
      process.env.VERCEL_ENV=env;
      delete process.env.NCBR_PREVIEW_GAME_LINK_LAB_ENABLED;
      process.env.VERCEL_GIT_COMMIT_REF="redesign-mobile-solaris";
      await serverRun(async(base)=>{
        let r=await fetch(base+"/api/delivery/lab-link/issue",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({gamertag:"Halzin5212"})});
        assert.equal(r.status,503);
        r=await fetch(base+"/api/delivery/bds/challenge",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:'{"schema":1}'});
        assert.equal(r.status,503);
        r=await fetch(base+"/api/delivery/lab-link/simulate-vip",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({receiptId:"a".repeat(64),tier:"explorer"})});
        assert.equal(r.status,503);
        r=await fetch(base+"/api/delivery/bds/poll",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:'{"gamertag":"Halzin5212","online":true}'});
        assert.equal(r.status,503);
      });
    }
  }finally{
    for(const k of vars)previous[k]===undefined?delete process.env[k]:
      process.env[k]=previous[k];
  }
});
test("Preview LAB when configured never intercepts poll, ACK, NACK or public payment routes",async()=>{
  const previous=Object.fromEntries(vars.map(x=>[x,process.env[x]]));
  try{
    process.env.VERCEL_ENV="preview";
    process.env.VERCEL_GIT_COMMIT_REF="redesign-mobile-solaris";
    process.env.NCBR_PREVIEW_GAME_LINK_LAB_ENABLED="true";
    process.env.NCBR_PREVIEW_BDS_LINK_TOKEN="A".repeat(64);
    await serverRun(async(base)=>{
      for(const action of ["poll","ack","nack"]){
        const r=await fetch(base+"/api/delivery/bds/"+action,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:'{}'});
        assert.equal(r.status,503,action);
        assert.deepEqual(await r.json(),{error:"delivery_release_off"});
      }
      const noAdmin=await fetch(base+"/api/delivery/lab-link/issue",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({gamertag:"Halzin5212"})});
      assert.ok([401,503].includes(noAdmin.status));
      const noAdminSim=await fetch(base+"/api/delivery/lab-link/simulate-vip",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({receiptId:"a".repeat(64),tier:"supreme"})});
      assert.ok([401,503].includes(noAdminSim.status));
    });
  }finally{
    for(const k of vars)previous[k]===undefined?delete process.env[k]:
      process.env[k]=previous[k];
  }
});
