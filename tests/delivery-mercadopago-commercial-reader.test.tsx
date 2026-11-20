import {test} from "node:test";
import assert from "node:assert/strict";
import {createCommercialOrdersReader} from "../server/payments/mercadoPagoCommercialReader.ts";
import {ORD,ordersFixture} from "./fixtures/pixOrders.ts";

const environment=["NODE_ENV","VERCEL_ENV","FIRESTORE_EMULATOR_HOST"];
const token="APP_USR-"+("A".repeat(50));
function fixtureEnv(fn:()=>Promise<void>){
  const prev=Object.fromEntries(environment.map(k=>[k,process.env[k]]));
  process.env.NODE_ENV="production";
  delete process.env.VERCEL_ENV;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  return fn().finally(()=>{
    for(const k of environment){
      if(prev[k]===undefined)delete process.env[k];
      else process.env[k]=prev[k];
    }
  });
}
test("commercial Orders reader uses GET only, private token and checked API URLs",async()=>{
  await fixtureEnv(async()=>{
    const urls:string[]=[];
    const provider=ordersFixture("a".repeat(64),"4.90","approved");
    provider.live_mode=true;
    const transport:typeof fetch=async(input,init)=>{
      assert.equal(init?.method,"GET");
      assert.equal(new Headers(init?.headers).get("authorization"),"Bearer "+token);
      assert.equal(init?.redirect,"error");
      urls.push(String(input));
      return new Response(JSON.stringify(String(input).endsWith("/users/me")
        ? {id:42,tags:[]} : provider),{status:200});
    };
    const client=createCommercialOrdersReader({accessToken:token,transport});
    assert.deepEqual(await client.me(),{id:"42",netcraftTestAccount:false});
    assert.equal((await client.get(ORD)).id,ORD);
    assert.deepEqual(urls,["https://api.mercadopago.com/users/me",
      "https://api.mercadopago.com/v1/orders/"+ORD]);
    await assert.rejects(()=>client.get("../payments"),/invalid_commercial_provider_order_id/);
  });
});
test("commercial reader cannot use Preview or a TEST/garbage credential",async()=>{
  await fixtureEnv(async()=>{
    assert.throws(()=>createCommercialOrdersReader({accessToken:"TEST-synthetic"}),
      /private_merchant_credentials_required/);
    process.env.VERCEL_ENV="preview";
    assert.throws(()=>createCommercialOrdersReader({accessToken:token}),
      /commercial_provider_reader_release_blocked/);
    delete process.env.VERCEL_ENV;
    const client=createCommercialOrdersReader({accessToken:token,
      transport:async()=>new Response("Forbidden",{status:403})});
    await assert.rejects(()=>client.me(),/commercial_provider_unavailable/);
  });
});
