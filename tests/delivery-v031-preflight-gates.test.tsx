import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pack='minecraft/delivery-v031-preflight/';
test('v0.3.1 Bedrock package has matching version and isolated UUIDs',()=>{
 const m=JSON.parse(readFileSync(pack+'manifest.json','utf8'));
 assert.equal(m.header.name,'NetCraft Delivery Pix v0.3.1 BDS Preflight OFF');
 assert.deepEqual(m.header.version,[0,3,1]);
 assert.deepEqual(m.modules[0].version,[0,3,1]);
 assert.equal(m.modules[0].entry,'scripts/main.js');
 assert.notEqual(m.header.uuid,m.modules[0].uuid);
 assert.deepEqual(m.dependencies,[
   {module_name:'@minecraft/server',version:'1.17.0'},
   {module_name:'@minecraft/server-admin',version:'1.0.0-beta'},
   {module_name:'@minecraft/server-net',version:'1.0.0-beta'},
 ]);
});
test('v0.3.1 can only probe read-only localhost HTTPS when explicitly enabled',()=>{
 const s=readFileSync(pack+'scripts/main.js','utf8');
 const gateway=readFileSync('minecraft/delivery-e2e-local/verified_outbox_server.cjs','utf8');
 assert.match(s,/variables\.get\(ENABLE\) === true/);
 assert.match(s,/secrets\.get\(SECRET\)/);
 assert.match(s,/https:\/\/127\.0\.0\.1:18443/);
 assert.match(s,/AUTHENTICATED_READ_ONLY_PREFLIGHT_PASS/);
 assert.match(s,/result\?\.grantsEnabled !== false/);
 assert.match(s,/result\?\.ackEnabled !== false/);
 for(const forbidden of ["'/delivery/poll'","'/delivery/nack'","'/delivery/ack'",
   'runCommand','runInterval','addItem(','addTag(','eval(','Math.random'])
  assert.equal(s.includes(forbidden),false,forbidden);
 assert.match(gateway,/req\.url==='\/delivery\/preflight'/);
 assert.match(gateway,/grantsEnabled:false,ackEnabled:false,ready:true/);
});
