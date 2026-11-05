/**
 * NetCraftBR MVP Core-side delivery runner.
 * Pure BDS-compatible JS for integration into Core AFTER release approval.
 * No direct network, no automatic timer, no handler on import.
 *
 * A signed transport offer is NOT permission by itself: release bits, current
 * online player's verified stable identity and Core's durable receipt are
 * mandatory. The v2.3.29/30 LAB OFF status intentionally fails all checks.
 */
const ID=/^[a-f0-9]{64}-(0|[1-9][0-9]{0,2})$/;
const RANK=new Set(['ncbr:vip_explorer','ncbr:vip_elite','ncbr:vip_supreme']);
const SAFE_NACK=new Set(['player_offline','inventory_full','inventory_unavailable',
  'vip_not_configured','vip_not_loaded']);

export function validateMvpOffer(offer){
  const j=offer?.payload;
  return !!offer && typeof offer==='object' &&
    offer.dispatchEnabled===true && offer.simulation!==true &&
    /^[a-f0-9]{32}$/.test(offer.leaseToken||'') &&
    j?.contract==='netcraft.delivery.v1' && ID.test(j.id||'') &&
    j.orderId===j.id.split('-')[0] && /^[A-Za-z0-9_ ]{3,32}$/.test(j.gamertag||'') &&
    j.gamertag===j.gamertag.trim() && j.kind==='vip' &&
    RANK.has(j.rankTag) && j.days===30 &&
    Object.keys(j).length===7 &&
    ['contract','id','orderId','gamertag','kind','rankTag','days']
      .every(key=>Object.prototype.hasOwnProperty.call(j,key));
}

export function releaseReady(status){
  return !!status && status.mode==='RELEASE_APPROVED' &&
    status.dispatchEnabled===true && status.realPaymentsEnabled===true &&
    status.networkEnabled===true && status.deliveryEnabled===true &&
    status.verifiedPlayerBindingReady===true &&
    status.privateGatewayReady===true;
}

/**
 * execute is the VERIFIED Core executor with write-ahead world receipts.
 * linkVerified must verify the player identity against a stored binding made
 * by an authenticated BDS session, NEVER just a gamertag in the checkout.
 */
export function createMvpDeliveryPump({getStatus,onlinePlayers,transport,executor,
  linkVerified,receiptStatus,log=()=>{}}){
  let running=false;
  const safeLog=value=>{try{log('[NCBR DELIVERY MVP] '+value);}catch{}};
  return Object.freeze({run:async()=>{
    if(running)return {status:'busy'};
    if(!releaseReady(getStatus?.()))return {status:'release_off'};
    if(typeof onlinePlayers!=='function'||typeof linkVerified!=='function'||
       typeof receiptStatus!=='function'||typeof executor?.execute!=='function'||
       typeof transport?.poll!=='function'||typeof transport?.ack!=='function'||
       typeof transport?.nack!=='function')return {status:'integration_missing'};
    running=true;let processed=0,manualReview=0;
    try {
      const players=onlinePlayers();
      if(!Array.isArray(players)||players.length>40)return {status:'players_invalid'};
      for(const player of players){
        if(!releaseReady(getStatus?.()))return {status:'release_revoked'};
        if(player?.isValid!==true||typeof player?.id!=='string'||
           typeof player?.name!=='string')continue;
        let offers;
        try {offers=await transport.poll(player.name);}
        catch {safeLog('POLL_TRANSPORT_FAILED');continue;}
        if(offers?.dispatchEnabled!==true||offers?.simulation===true||
           !Array.isArray(offers?.deliveries)||offers.deliveries.length>4){
          safeLog('POLL_RELEASE_OR_SCHEMA_BLOCKED');continue;
        }
        for(const offer of offers.deliveries){
          if(!releaseReady(getStatus?.()))return {status:'release_revoked'};
          if(!validateMvpOffer(offer) ||
             offer.payload.gamertag!==player.name){
            safeLog('OFFER_INVALID_HELD');manualReview++;continue;
          }
          let linked=false;
          try {linked=linkVerified(player,offer.payload)===true;}catch{}
          if(!linked){safeLog('PLAYER_IDENTITY_NOT_LINKED');manualReview++;continue;}
          let result={status:'manual_review'};
          try {result=executor.execute(offer.payload);}
          catch {safeLog('EXECUTOR_EXCEPTION_MANUAL_REVIEW');}
          if(['applied','already_applied'].includes(result?.status)){
            try {await transport.ack(offer.payload.id,offer.leaseToken,result.status);processed++;}
            catch {safeLog('ACK_LOST_RECEIPT_SAVED_NO_REPLAY');manualReview++;}
          }else{
            let receipt='unknown';
            try {receipt=receiptStatus(offer.payload.id);}catch{}
            if(!['none','started','applied'].includes(receipt))receipt='unknown';
            const reason=String(result?.status||'manual_review');
            const safe=receipt==='none'&&SAFE_NACK.has(reason);
            try {await transport.nack(offer.payload.id,offer.leaseToken,
              safe?reason:'manual_review',receipt);}
            catch {safeLog('NACK_UNCONFIRMED_MANUAL_REVIEW');}
            if(!safe)manualReview++;
          }
        }
      }
      return {status:'completed',processed,manualReview};
    }finally {running=false;}
  }});
}
