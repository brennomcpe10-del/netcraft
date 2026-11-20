/**
 * NetCraftCore VIP MVP assembly. This is the one place connecting the
 * verified Core executor (durable write-ahead receipt) and the network pump.
 *
 * This pure module is NOT a BDS bootstrap. It must be installed only after
 * an independently reviewed release gate; it does NOT activate by importing.
 * Identity callback must verify a BDS-authenticated, stable player binding.
 */
import {createVerifiedLabExecutor} from "./verified_executor.js";
import {createMvpDeliveryPump,releaseReady} from "./vip_mvp_delivery_pump.js";
export function createNetCraftVipMvpCore({
  world,Server,ItemStack,transport,verifyPlayerIdentity,log=()=>{},
}){
  if(!world || !Server || !ItemStack ||
     typeof verifyPlayerIdentity!=="function")
    throw Error("NETCRAFT_MVP_IDENTITY_OR_RUNTIME_MISSING");
  const status=()=>Server.DeliveryIntegration?.getStatus?.();
  const verifier=(player,job)=>{
    if(!releaseReady(status()))return false;
    try{return verifyPlayerIdentity(player,job)===true;}
    catch{return false;}
  };
  // The executor library's "isOfflineClone" gate was originally named for
  // homologation. Here it is supplied by the strictly reviewed release
  // predicate. This builder is dormant until the status is RELEASE_APPROVED.
  const executor=createVerifiedLabExecutor({
    world,Server,ItemStack,verifyLinkedPlayer:verifier,
    isOfflineClone:()=>releaseReady(status()),
  });
  const pump=createMvpDeliveryPump({
    getStatus:status,onlinePlayers:()=>world.getAllPlayers(),
    transport,executor,linkVerified:verifier,
    receiptStatus:executor.receiptStatus,log,
  });
  return Object.freeze({
    runOnce:pump.run,
    releaseAllowed:()=>releaseReady(status()),
    receiptStatus:executor.receiptStatus,
  });
}
