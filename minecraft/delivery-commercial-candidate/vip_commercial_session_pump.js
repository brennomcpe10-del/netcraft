/**
 * Commercial VIP session bridge CANDIDATE for a separately reviewed Core build.
 *
 * No BDS import, timer, command, network call or grant occurs on import.
 * Unlike the older nick-only MVP, every poll AND ACK must use the currently
 * connected Bedrock player's authenticated session. The gateway separately
 * rechecks live Orders, the voucher proof and the immutable approved catalog.
 *
 * Do NOT install this candidate by itself: the Core-owned executor must
 * persist write-ahead receipts and perform its own linked-player checks.
 */
const NAME=/^[A-Za-z0-9_ ]{3,32}$/;
const SESSION=/^[A-Za-z0-9_:\-.]{1,128}$/;
const ORDER=/^[a-f0-9]{64}$/;
const DELIVERY=/^[a-f0-9]{64}-(0|[1-9][0-9]{0,2})$/;
const LEASE=/^[a-f0-9]{32}$/;
const CODE=/^NC-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/;
const RANK=new Set(["ncbr:vip_explorer","ncbr:vip_elite","ncbr:vip_supreme"]);
const SAFE_NACK=new Set(["player_offline","inventory_full",
  "inventory_unavailable","vip_not_configured","vip_not_loaded"]);
const SESSION_TTL=14*60*1000;
export const commercialVipReleaseReady=s=>!!s &&
  s.mode==="RELEASE_APPROVED" &&
  s.dispatchEnabled===true && s.realPaymentsEnabled===true &&
  s.networkEnabled===true && s.deliveryEnabled===true &&
  s.verifiedPlayerBindingReady===true && s.privateGatewayReady===true;

function validPlayer(player){
  return player?.isValid===true&&NAME.test(player.name||"")&&
    player.name.trim()===player.name&&SESSION.test(player.id||"");
}
function validOffer(offer,player,link){
  const job=offer?.payload;
  if(!offer||offer.status!=="offered"||offer.dispatchEnabled!==true||
     !LEASE.test(offer.leaseToken||"")||!DELIVERY.test(offer.deliveryId||"")||
     !job||typeof job!=="object"||Array.isArray(job)||
     Object.keys(job).length!==7||
     !["contract","days","gamertag","id","kind","orderId","rankTag"]
       .every(key=>Object.prototype.hasOwnProperty.call(job,key))||
     job.contract!=="netcraft.delivery.v1"||job.kind!=="vip"||
     job.id!==offer.deliveryId||job.orderId!==link.orderId||
     job.id.split("-")[0]!==job.orderId||job.gamertag!==player.name||
     job.days!==30||!RANK.has(job.rankTag))return false;
  return true;
}
const sanitizeReceipt=receipt=>
  ["none","started","applied"].includes(receipt)?receipt:"unknown";
export function createCommercialVipSessionPump({
  getStatus,onlinePlayers,transport,executor,verifyLinkedPlayer,
  receiptStatus,clock=Date.now,log=()=>{},
}){
  if(typeof getStatus!=="function"||typeof onlinePlayers!=="function"||
     typeof transport?.link!=="function"||
     typeof transport?.poll!=="function"||
     typeof transport?.ack!=="function"||
     typeof transport?.nack!=="function"||
     typeof executor?.execute!=="function"||
     typeof verifyLinkedPlayer!=="function"||
     typeof receiptStatus!=="function"||typeof clock!=="function")
    throw Error("COMMERCIAL_CORE_INTEGRATION_INCOMPLETE");
  const links=new Map(),pendingAcks=new Map();
  let busy=false;
  const safeLog=message=>{try{log("[NCBR COMMERCIAL CANDIDATE] "+message);}catch{}};
  const released=()=>commercialVipReleaseReady(getStatus());
  async function linkPlayer(player,code){
    // The caller MUST be the Core command handler for the actual player,
    // never a browser nickname or a console-provided fake principal.
    if(!released())return {status:"release_off"};
    if(!validPlayer(player)||!CODE.test(code||""))
      return {status:"invalid_link"};
    let result;
    try{result=await transport.link(code,player.name,player.id);}
    catch{return {status:"link_unavailable"};}
    if(result?.status!=="verified_in_game"||
       result.gamertag!==player.name||!ORDER.test(result.orderId||""))
      return {status:"link_rejected"};
    links.set(player.name,{sessionId:player.id,orderId:result.orderId,
      expiresAt:clock()+SESSION_TTL});
    return {status:"linked",expiresAt:clock()+SESSION_TTL};
  }
  async function run(){
    if(busy)return {status:"busy"};
    if(!released())return {status:"release_off"};
    busy=true;
    let applied=0,review=0;
    try{
      // Never replay an applied item after a lost ACK. Only retry the ACK.
      for(const [id,pending] of pendingAcks){
        if(!released())return {status:"release_revoked"};
        try{
          const answer=await transport.ack(id,pending.leaseToken,
            pending.result,pending.sessionId);
          if(answer?.status!=="acknowledged")throw Error("ACK_NOT_CONFIRMED");
          pendingAcks.delete(id);
        }catch{
          safeLog("ACK_RETRY_PENDING_NO_NEW_GRANTS");
          return {status:"ack_pending",applied,review};
        }
      }
      const players=onlinePlayers();
      if(!Array.isArray(players)||players.length>40)
        return {status:"players_invalid"};
      for(const player of players){
        if(!released())return {status:"release_revoked"};
        if(!validPlayer(player))continue;
        const link=links.get(player.name);
        if(!link||link.sessionId!==player.id||
           clock()>=link.expiresAt)continue;
        let response;
        try{response=await transport.poll(player.name,player.id);}
        catch{safeLog("POLL_FAILED");continue;}
        if(response?.schema!==1||response?.simulation!==false||
           response?.dispatchEnabled!==true||
           !Array.isArray(response.deliveries)||response.deliveries.length>4){
          safeLog("POLL_SCHEMA_OR_RELEASE_REJECTED");review++;continue;
        }
        for(const offer of response.deliveries){
          if(!released())return {status:"release_revoked"};
          if(!validOffer(offer,player,link)){
            safeLog("INVALID_OFFER_HELD_FOR_REVIEW");review++;continue;
          }
          if(pendingAcks.has(offer.deliveryId))continue;
          let matched=false;
          try{matched=verifyLinkedPlayer(player,offer.payload)===true;}
          catch{}
          if(!matched){
            safeLog("IDENTITY_NOT_VERIFIED");review++;continue;
          }
          let outcome="manual_review";
          try{outcome=executor.execute(offer.payload)?.status||"manual_review";}
          catch{safeLog("EXECUTOR_FAILED_RECEIPT_REQUIRED");}
          let receipt="unknown";
          try{receipt=sanitizeReceipt(receiptStatus(offer.deliveryId));}
          catch{safeLog("RECEIPT_READ_FAILED_MANUAL_REVIEW");}
          if(["applied","already_applied"].includes(outcome) &&
             receipt==="applied"){
            const pending={leaseToken:offer.leaseToken,result:outcome,
              sessionId:player.id};
            pendingAcks.set(offer.deliveryId,pending);
            try{
              const answer=await transport.ack(offer.deliveryId,
                offer.leaseToken,outcome,player.id);
              if(answer?.status!=="acknowledged")throw Error("ACK_NOT_CONFIRMED");
              pendingAcks.delete(offer.deliveryId);
              applied++;
            }catch{
              safeLog("ACK_LOST_RECEIPT_PERSISTED");
              // Finish handling offers ALREADY leased in this same poll.
              // Do not initiate another poll until the ACKs are confirmed.
              continue;
            }
          }else{
            const safe=receipt==="none"&&SAFE_NACK.has(outcome);
            try{
              await transport.nack(offer.deliveryId,offer.leaseToken,
                safe?outcome:"manual_review",receipt);
            }catch{safeLog("NACK_NOT_CONFIRMED");}
            if(!safe)review++;
          }
        }
        if(pendingAcks.size>0)
          return {status:"ack_pending",applied,review};
      }
      return {status:"completed",applied,review};
    }finally{busy=false;}
  }
  return Object.freeze({linkPlayer,run,
    getPendingAcknowledgements:()=>pendingAcks.size});
}
