// Gate 31: browser Firebase SDK against an isolated ruleset, no credentials.
// The workflow uses firestore.delivery-isolated.rules in a disposable emulator.
import assert from "node:assert/strict";
import {initializeApp,deleteApp} from "firebase/app";
import {collection,doc,getDoc,getDocs,setDoc,deleteDoc,
  getFirestore,connectFirestoreEmulator,terminate} from "firebase/firestore";
assert.equal(process.env.NODE_ENV,"test");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8085");
assert.equal(process.env.GCLOUD_PROJECT,"demo-netcraft-admin-test");
assert.equal(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||"","");
const app=initializeApp({projectId:"demo-netcraft-admin-test",
 appId:"gate31-disposable-no-real-auth",apiKey:"synthetic-public-api-key"}, "delivery-rules-gate31");
const db=getFirestore(app);
connectFirestoreEmulator(db,"127.0.0.1",8085);
const privateCollections=["pixCommercialOrders","pixCommercialDeliveries",
 "pixCommercialDeliveryAudit","pixCommercialDeliveryAlerts",
 "pixCommercialDeliveryNonces","pixCommercialPlayerBindings",
 "pixTestOrders","pixTestDeliveries","pixTestWebhookReceipts",
 "orders","users","players","tickets","coupons","previewProducts",
 "previewVips","previewStoreSettings","previewCoupons","test",
 "unknownDeliveryCollection"];
const publicRead=["products","vips","events","news","settings","serverSettings",
 "stats","community","socialLinks","homeConfig","pagesConfig",
 "menuItems","appearanceConfig","faqItems","system"];
let verified=0;
try {
 for(const name of privateCollections){
  const target=doc(db,name,"gate31");
  await assert.rejects(getDoc(target),(e:any)=>e.code==="permission-denied",
   "private document read must be denied: "+name);
  await assert.rejects(setDoc(target,{id:"gate31",price:0}),(
   e:any)=>e.code==="permission-denied","private create denied: "+name);
  verified+=2;
 }
 for(const name of publicRead){
  const target=doc(db,name,"gate31");
  const got=await getDoc(target);
  assert.equal(got.exists(),false);
  await assert.rejects(setDoc(target,{content:"malicious browser write"}),(
   e:any)=>e.code==="permission-denied","public content must be read-only: "+name);
  await assert.rejects(deleteDoc(target),(
   e:any)=>e.code==="permission-denied","public deletion denied: "+name);
  verified+=3;
 }
 await assert.rejects(getDoc(doc(db,"products","test","nested","gate31")),
  (e:any)=>e.code==="permission-denied");
 verified++;
 console.log("PASS Gate31 isolated Firestore rules: "+verified+
  " browser read/write/delete permissions verified; NO production project or deploy");
}finally{
 await terminate(db);
 await deleteApp(app);
}
