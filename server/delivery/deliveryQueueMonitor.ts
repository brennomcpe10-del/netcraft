// Gate 34: private, LAB-only supervisor. No timers, public routes or external
// notifications. Produces deduplicated operator alerts in server-only Firestore.
// The commercial release switch is intentionally absent.
import crypto from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
type DB=Pick<Firestore,"collection"|"runTransaction">;
type Signal="stale_lease"|"awaiting_receipt"|"review_required"|
  "refund_after_ack"|"exhausted_retries"|"backlog";
const watchedStates=["leased","awaiting_receipt","review_required",
  "refunded_after_ack","queued"] as const;
const MAX_PER_STATE=200;
const BUCKET_MS=15*60_000;
const MIN_AGE_MS=2*60_000;
const MAX_QUEUE_AGE_MS=15*60_000;
function labOnly(){
 if(process.env.NODE_ENV!=="test"||
    process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8085"||
    process.env.VERCEL_ENV||process.env.MERCADOPAGO_ACCESS_TOKEN||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  throw Error("delivery_monitor_release_blocked");
}
const validTime=(s:unknown)=>
 typeof s==="string"&&Number.isFinite(Date.parse(s))?Date.parse(s):null;
function getSignal(row:any,now:number):Signal|null{
 if(!row||row.dispatchEnabled!==false||
    !/^[a-f0-9]{64}-(0|[1-9]\d{0,2})$/.test(row.id||""))
  return null;
 if(row.state==="refunded_after_ack")return "refund_after_ack";
 if(row.state==="review_required")return "review_required";
 if(row.state==="awaiting_receipt")return "awaiting_receipt";
 if(row.state==="leased"){
  const time=validTime(row.leasedAt);
  return time!==null&&now-time>=MIN_AGE_MS?"stale_lease":null;
 }
 if(row.state==="queued"){
  if(Number.isSafeInteger(row.attempts)&&row.attempts>=20)
   return "exhausted_retries";
  const time=validTime(row.createdAt);
  return time!==null&&now-time>=MAX_QUEUE_AGE_MS?"backlog":null;
 }
 return null;
}
export function createDeliveryQueueMonitor(db:DB, options:{now?:()=>number}={}){
 labOnly();
 const clock=options.now||Date.now;
 const source=db.collection("pixCommercialDeliveries");
 const alerts=db.collection("pixCommercialDeliveryAlerts");
 async function scan(){
  labOnly();
  const now=clock();
  if(!Number.isSafeInteger(now)||now<0)throw Error("invalid_monitor_clock");
  const found=await Promise.all(watchedStates.map(state=>
    source.where("state","==",state).get()));
  const signals=new Map<Signal,{count:number;sampleHash:string}>();
  let scanned=0,limitExceeded=false;
  for(const [i,query] of found.entries()){
   if(query.docs.length>MAX_PER_STATE)limitExceeded=true;
   for(const doc of query.docs.slice(0,MAX_PER_STATE)){
    scanned++;
    const row=doc.data();
    if(row?.state!==watchedStates[i]||doc.id!==row?.id)continue;
    const signal=getSignal(row,now);
    if(!signal)continue;
    const current=signals.get(signal);
    const hash=crypto.createHash("sha256").update(doc.id).digest("hex");
    signals.set(signal,{
      count:(current?.count||0)+1,sampleHash:current?.sampleHash||hash,
    });
   }
  }
  const bucket=Math.floor(now/BUCKET_MS);
  let created=0,existing=0;
  for(const [signal,info] of signals){
   const key=crypto.createHash("sha256").update("delivery-alert-v1:"+signal+":"+bucket)
    .digest("hex");
   const status=await db.runTransaction(async tx=>{
    const ref=alerts.doc(key),seen=await tx.get(ref);
    if(seen.exists)return "existing" as const;
    // Only pseudonymous metadata: never store raw queue payloads, player
    // names, provider response, auth headers, environment variables or tokens.
    tx.create(ref,{
      event:"delivery_queue_alert_v1",
      signal,severity:["refund_after_ack","review_required","awaiting_receipt"]
        .includes(signal)?"critical":"warning",
      count:info.count,sampleHash:info.sampleHash,
      bucket,createdAt:new Date(now).toISOString(),
      state:"unacknowledged",dispatchEnabled:false,
      environment:"commercial_candidate",
    });
    return "created" as const;
   });
   if(status==="created")created++;else existing++;
  }
  return {scanned,signals:Object.fromEntries(
    [...signals].map(([signal,x])=>[signal,x.count])),
    created,existing,limitExceeded,dispatchEnabled:false as const,
    notificationsEnabled:false as const};
 }
 // Future authenticated admin view should expose these events via a
 // separate role-checked endpoint. No public delivery status endpoint.
 return {scan};
}
