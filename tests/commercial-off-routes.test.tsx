import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {type AddressInfo} from 'node:net';
import {commercialPixReleaseRouter,commercialBdsReleaseRouter}
  from '../server/routes/commercialRelease.ts';

// Only localhost disposable mock Express, no real provider/BDS requests.
// Critical invariant: code present in Production does not enable payments.
test('isolated commercial endpoints stay OFF without independent release gates',async()=>{
  const app=express();
  app.use(express.json());
  app.use('/api/pix/commercial',commercialPixReleaseRouter);
  app.use('/api/delivery/bds',commercialBdsReleaseRouter);
  app.use((_req,res)=>res.status(404).json({error:'route_unavailable'}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{
    server.once('listening',()=>resolve());
    server.once('error',reject);
  });
  try{
    const address=server.address() as AddressInfo;
    assert.equal(address.address,'127.0.0.1');
    const root='http://127.0.0.1:'+address.port;
    const health=await fetch(root+'/api/pix/commercial/health');
    assert.equal(health.status,200);
    const info=await health.json();
    assert.equal(info.status,'code_deployed_only');
    assert.equal(info.paymentOrDeliveryAuthorization,false);
    assert.equal(health.headers.get('cache-control'),'no-store');

    const config=await fetch(root+'/api/pix/commercial/config');
    assert.equal(config.status,404,'cannot activate merchant from Preview');
    const create=await fetch(root+'/api/pix/commercial/orders',{
      method:'POST',headers:{'content-type':'application/json',
        'idempotency-key':'mock-only-idempotency-0123456789'},
      body:JSON.stringify({gamertag:'Ryck432',email:'test@example.com',
        lines:[{productId:'vip',quantity:1}]}),
    });
    assert.equal(create.status,404,'never create a Pix in LAB_OFF');
    const bds=await fetch(root+'/api/delivery/bds/poll',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({gamertag:'Ryck432',online:true}),
    });
    assert.equal(bds.status,503,'never offer a VIP in LAB_OFF');
    assert.equal((await bds.json()).error,'delivery_release_off');
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
});
