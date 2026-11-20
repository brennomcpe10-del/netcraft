/**
 * Keep real-money checkout attempts separate from Preview/test attempts.
 * The legacy keys are retained only for the TEST checkout so existing fake
 * orders can still be inspected without being sent to Production.
 */
export type PixCheckoutMode="commercial"|"test";
export function pixCheckoutStorageNames(mode:PixCheckoutMode){
  return mode==="commercial"
    ? Object.freeze({key:"netcraft-commercial-pix-key",
      request:"netcraft-commercial-pix-request"})
    : Object.freeze({key:"netcraft-pix-key",request:"netcraft-pix-request"});
}
export function readPixCheckoutKey(
  storage:Pick<Storage,"getItem">,mode:PixCheckoutMode,
){
  const value=storage.getItem(pixCheckoutStorageNames(mode).key)||"";
  return /^[A-Za-z0-9-]{20,80}$/.test(value)?value:"";
}

/**
 * Never erase the only browser-side lookup key for a PAID commercial order
 * while Minecraft has not acknowledged the reward. A fresh order would use
 * a new idempotency key, leaving the previous buyer without its voucher path.
 */
export function canStartNextPixOrder(
  mode:PixCheckoutMode,state:string|undefined,deliveryStatus?:string,
):boolean{
  if(["cancelled","expired","refunded"].includes(state||""))return true;
  if(state==="approved")
    return mode==="test"||deliveryStatus==="delivered";
  return false;
}

/**
 * A verified commercial voucher is short-lived and may only be restored in
 * the SAME browser session as the original checkout key. Never use localStorage.
 * A lost voucher must expire before the gateway can issue a replacement.
 */
const LINK_STORAGE_KEY="netcraft-commercial-pix-link-v1";
const VOUCHER=/^NC-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/;
const ORDER=/^[a-f0-9]{64}$/;
export type CachedCommercialLink=Readonly<{
  checkoutKey:string;orderId:string;code:string;expiresAt:string;
}>;
export function readCachedCommercialLink(
  store:Pick<Storage,"getItem">,checkoutKey:string,orderId:string,
  now=Date.now(),
):CachedCommercialLink|null {
  if(!ORDER.test(orderId)||!checkoutKey)return null;
  try{
    const raw=store.getItem(LINK_STORAGE_KEY);
    if(!raw||raw.length>512)return null;
    const data=JSON.parse(raw);
    if(!data||data.checkoutKey!==checkoutKey||data.orderId!==orderId||
       typeof data.code!=="string"||!VOUCHER.test(data.code)||
       typeof data.expiresAt!=="string"||
       !Number.isFinite(Date.parse(data.expiresAt))||
       Date.parse(data.expiresAt)<=now)return null;
    return Object.freeze({
      checkoutKey,orderId,code:data.code,expiresAt:data.expiresAt,
    });
  }catch{return null;}
}
export function storeCachedCommercialLink(
  store:Pick<Storage,"setItem">,link:CachedCommercialLink,
){
  if(!link||!ORDER.test(link.orderId)||!VOUCHER.test(link.code)||
     !/^[A-Za-z0-9-]{20,80}$/.test(link.checkoutKey)||
     !Number.isFinite(Date.parse(link.expiresAt)))
    return false;
  try{store.setItem(LINK_STORAGE_KEY,JSON.stringify(link));return true;}
  catch{return false;}
}
export function clearCachedCommercialLink(store:Pick<Storage,"removeItem">){
  try{store.removeItem(LINK_STORAGE_KEY);}catch{}
}
