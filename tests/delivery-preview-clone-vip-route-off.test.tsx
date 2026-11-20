import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {previewCloneVipAdminRouter,previewCloneVipBdsRouter}
  from "../server/routes/previewCloneVipAutoLab.ts";
const keys=["VERCEL_ENV","VERCEL_GIT_COMMIT_REF",
  "NCBR_PREVIEW_GAME_LINK_LAB_ENABLED","NCBR_PREVIEW_CLONE_AUTO_ENABLED",
  "NCBR_PREVIEW_CLONE_BDS_TOKEN","NCBR_PREVIEW_BDS_LINK_TOKEN"];
async function server(fn:(base:string)=>Promise<void>){
  const app=express();app.use(express.json({limit:"4kb"}));
  app.use("/api/delivery/lab-clone-vip/bds",previewCloneVipBdsRouter);
  app.use("/api/delivery/lab-clone-vip",previewCloneVipAdminRouter);
  const listener=app.listen(0,"127.0.0.1");
  await new Promise<void>(r=>listener.once("listening",r));
  try {
    const address=listener.address();
    assert.ok(address&&typeof address!=="string");
    await fn("http://127.0.0.1:"+address.port);
  } finally {
    await new Promise<void>((resolve,reject)=>
      listener.close(e=>e?reject(e):resolve()));
  }
}
test("clone-queue and BDS endpoints cannot activate outside gated Preview branch",async()=>{
  const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try {
    for(const env of ["production","preview"]){
      process.env.VERCEL_ENV=env;
      process.env.VERCEL_GIT_COMMIT_REF="redesign-mobile-solaris";
      process.env.NCBR_PREVIEW_GAME_LINK_LAB_ENABLED="true";
      delete process.env.NCBR_PREVIEW_CLONE_AUTO_ENABLED;
      process.env.NCBR_PREVIEW_CLONE_BDS_TOKEN="Z".repeat(64);
      process.env.NCBR_PREVIEW_BDS_LINK_TOKEN="L".repeat(64);
      await server(async base=>{
        const q=await fetch(base+"/api/delivery/lab-clone-vip/queue",{
          method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({receiptId:"a".repeat(64),tier:"explorer"}),
        });
        assert.equal(q.status,503);
        const poll=await fetch(base+"/api/delivery/lab-clone-vip/bds/poll",{
          method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({gamertag:"Halzin5212",sessionId:"player-1"}),
        });
        assert.equal(poll.status,503);
      });
    }
  }finally {
    for(const k of keys)saved[k]===undefined?delete process.env[k]:
      process.env[k]=saved[k];
  }
});
test("activated lab still requires HTTPS, clone secret and independent admin login",async()=>{
  const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    process.env.VERCEL_ENV="preview";
    process.env.VERCEL_GIT_COMMIT_REF="redesign-mobile-solaris";
    process.env.NCBR_PREVIEW_GAME_LINK_LAB_ENABLED="true";
    process.env.NCBR_PREVIEW_CLONE_AUTO_ENABLED="true";
    process.env.NCBR_PREVIEW_CLONE_BDS_TOKEN="Z".repeat(64);
    process.env.NCBR_PREVIEW_BDS_LINK_TOKEN="L".repeat(64);
    await server(async base=>{
      let r=await fetch(base+"/api/delivery/lab-clone-vip/queue",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({receiptId:"a".repeat(64),tier:"explorer"}),
      });
      assert.ok([401,503].includes(r.status));
      r=await fetch(base+"/api/delivery/lab-clone-vip/bds/challenge",{
        method:"POST",headers:{"content-type":"application/json"},
        body:'{"schema":1}',
      });
      assert.equal(r.status,403); // HTTP on localhost is not Vercel HTTPS
      r=await fetch(base+"/api/delivery/lab-clone-vip/bds/challenge",{
        method:"POST",headers:{"content-type":"application/json",
          "x-forwarded-proto":"https","x-nc-clone-token":"wrong"},
        body:'{"schema":1}',
      });
      assert.equal(r.status,401);
    });
  }finally{
    for(const k of keys)saved[k]===undefined?delete process.env[k]:
      process.env[k]=saved[k];
  }
});
