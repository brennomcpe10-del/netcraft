import test from "node:test";
import assert from "node:assert/strict";
import {pixCheckoutStorageNames,readPixCheckoutKey,canStartNextPixOrder}
  from "../src/lib/pixCheckoutSession.ts";

test("test and commercial Pix keys cannot overwrite or reuse each other",()=>{
  const fake=new Map<string,string>();
  const read={getItem:(key:string)=>fake.get(key)??null};
  const testKeys=pixCheckoutStorageNames("test");
  const realKeys=pixCheckoutStorageNames("commercial");
  assert.notEqual(testKeys.key,realKeys.key);
  assert.notEqual(testKeys.request,realKeys.request);
  fake.set(testKeys.key,"test-pix-order-1234567890123456789012");
  fake.set(testKeys.request,"sha-test");
  assert.equal(readPixCheckoutKey(read,"commercial"),"");
  assert.equal(readPixCheckoutKey(read,"test"),fake.get(testKeys.key));
  fake.set(realKeys.key,"commercial-order-123456789012345678");
  fake.set(realKeys.request,"sha-commercial");
  assert.equal(readPixCheckoutKey(read,"commercial"),fake.get(realKeys.key));
  assert.equal(readPixCheckoutKey(read,"test"),fake.get(testKeys.key));
  fake.delete(realKeys.key);
  fake.delete(realKeys.request);
  assert.equal(readPixCheckoutKey(read,"commercial"),"");
  assert.equal(fake.get(testKeys.request),"sha-test");
});
test("malformed cached payment keys fail closed without affecting other mode",()=>{
  const read={getItem:(_key:string)=>"not a valid checkout key"};
  assert.equal(readPixCheckoutKey(read,"commercial"),"");
  assert.equal(readPixCheckoutKey(read,"test"),"");
});

test("commercial customer keeps the paid order key until server confirms VIP",()=>{
  for(const state of ["approved","pending","processing","creating"]){
    assert.equal(canStartNextPixOrder("commercial",state,"awaiting_queue"),false);
  }
  for(const state of ["awaiting_queue","queued","processing",
    "blocked","review_required",undefined]){
    assert.equal(canStartNextPixOrder("commercial","approved",state),false);
  }
  assert.equal(canStartNextPixOrder("commercial","approved","delivered"),true);
  assert.equal(canStartNextPixOrder("test","approved"),true);
  for(const state of ["cancelled","expired","refunded"])
    assert.equal(canStartNextPixOrder("commercial",state),true);
});
