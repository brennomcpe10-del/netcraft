import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("Pix emulator stays OFF; remote origin is clone-flagged and allowlisted",()=>{
 const bridge=fs.readFileSync("minecraft/delivery-e2e-local/delivery_verified_outbox_bds.js","utf8");
 const protocol=fs.readFileSync("minecraft/delivery-e2e-local/verified_outbox_protocol.js","utf8");
 const gateway=fs.readFileSync("minecraft/delivery-e2e-local/verified_outbox_server.cjs","utf8");
 const origin=fs.readFileSync("minecraft/delivery-e2e-local/fixture_gateway_origin.js","utf8");
 for(const s of ["ncbr_pix_emulator_enabled","ncbr_pix_emulator_token",
    "verified_pix_emulator","FAIL_CLOSED"])
   assert.equal(bridge.includes(s)||protocol.includes(s),true,s);
 assert.match(origin,/https:\/\/127\.0\.0\.1:18443/);
 assert.match(origin,/netcraft-delivery-fixture-clone-only/);
 assert.match(bridge,/fixtureGatewayOrigin/);
 assert.match(bridge,/ncbr_fixture_clone_only/);
 assert.match(bridge,/variables\.get\(FLAG\)===true/);
 assert.match(bridge,/secrets\.get\(TOKEN\)/);
 assert.match(bridge,/@minecraft\/server-admin/);
 assert.match(bridge,/@minecraft\/server-net/);
 assert.match(gateway,/FIRESTORE_EMULATOR_HOST/);
 assert.match(gateway,/127\.0\.0\.1/);
 for(const forbidden of ["api.mercadopago.com","netcraftbr.srvmc.com",
   "netcraft.srvmc.com","MERCADOPAGO_ACCESS_TOKEN:"])
   assert.equal(bridge.includes(forbidden),false,forbidden);
 // These BDS-only files must not become part of the normal addon bootstrap.
 const bdsOnly=fs.readFileSync("minecraft/delivery-e2e-local/delivery_bridge_bds.js","utf8");
 assert.equal(bdsOnly.includes("startVerifiedPixEmulatorBds"),false);
});
