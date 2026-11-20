import type { Firestore } from "firebase-admin/firestore";
import { paymentDatabase } from "../payments/database.ts";
import { isPreviewEnvironment } from "./previewIsolation.ts";

export type CouponRecord = {id:string;code:string;[key:string]:any};
type Reader={get(ref:any):Promise<any>};
const previewCollection="previewCoupons";
const baseCollection="coupons";
export function couponWriteReference(id:string,db:Firestore=paymentDatabase()){
 return db.collection(isPreviewEnvironment()?previewCollection:baseCollection).doc(id);
}
export async function readCoupon(
 id:string,tx?:Reader,db:Firestore=paymentDatabase(),
):Promise<CouponRecord|null>{
 const get=(ref:any)=>tx?tx.get(ref):ref.get();
 if(isPreviewEnvironment()){
  const overlay=await get(db.collection(previewCollection).doc(id));
  if(overlay.exists){
   const next=overlay.data()||{};
   if(next.__previewDeleted===true)return null;
   const base=await get(db.collection(baseCollection).doc(id));
   const {__previewDeleted:_marker,...visible}=next;
   return {...(base.exists?base.data():{}),...visible,id} as CouponRecord;
  }
 }
 const doc=await get(db.collection(baseCollection).doc(id));
 return doc.exists?{...doc.data(),id:doc.id} as CouponRecord:null;
}
export async function listCoupons(db:Firestore=paymentDatabase()):Promise<CouponRecord[]>{
 const base=await db.collection(baseCollection).get();
 const records=new Map<string,CouponRecord>(base.docs.map(d=>[d.id,{...d.data(),id:d.id} as CouponRecord]));
 if(isPreviewEnvironment()){
  const overlay=await db.collection(previewCollection).get();
  for(const doc of overlay.docs){
   const value=doc.data()||{};
   if(value.__previewDeleted===true)records.delete(doc.id);
   else{
    const {__previewDeleted:_marker,...safe}=value;
    records.set(doc.id,{...(records.get(doc.id)||{}),...safe,id:doc.id} as CouponRecord);
   }
  }
 }
 return [...records.values()];
}
/** Resolve the same source and Preview override for quoting and Pix Orders.
 * Always use the supplied Firestore transaction when creating a paid order. */
export async function findCouponByCode(
 code:string,tx?:Reader,db:Firestore=paymentDatabase(),
):Promise<CouponRecord|null>{
 const get=(ref:any)=>tx?tx.get(ref):ref.get();
 const base=await get(db.collection(baseCollection).where("code","==",code));
 const candidates=new Set<string>(base.docs.map((d:any)=>d.id));
 if(isPreviewEnvironment()){
  const overlay=await get(db.collection(previewCollection).where("code","==",code));
  for(const d of overlay.docs)candidates.add(d.id);
 }
 const results:CouponRecord[]=[];
 for(const id of candidates){
  const resolved=await readCoupon(id,tx,db);
  if(resolved?.code===code)results.push(resolved);
 }
 if(results.length>1)throw new Error("duplicate_coupon_code");
 return results[0]||null;
}
