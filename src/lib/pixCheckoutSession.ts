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
