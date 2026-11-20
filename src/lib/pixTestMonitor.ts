import type {PixTestOrderSummary,PixTestDeliverySummary} from "../types/index.ts";

// Browser presentation only. These states are NEVER a payment proof or a grant command.
export type MonitorFilter = "all" | "pending" | "approved" | "attention" | "closed";
export type MonitorEntry = {
 order: PixTestOrderSummary;
 deliveries: PixTestDeliverySummary[];
 status: "pending" | "approved" | "attention" | "closed";
};
const finalStates = new Set(["expired","cancelled","refunded"]);
const needsReview = new Set<PixTestDeliverySummary["hold"]>([
 "refunded","payment_not_verified","missing_approval_timestamp",
 "reward_review_required","vip_mapping_required","reward_missing",
 "reward_invalid","quantity_invalid","product_invalid","plan_missing",
]);
export const paymentLabel = (state:PixTestOrderSummary["state"]) => ({
 creating:"Criando cobrança de teste",pending:"Aguardando pagamento de teste",
 processing:"Processando pagamento de teste",approved:"Aprovado no ambiente de teste",
 expired:"Pix de teste expirado",cancelled:"Pix de teste cancelado",
 refunded:"Pix de teste reembolsado",unknown:"Pagamento não identificado",
}[state]);
export const deliveryHoldLabel = (hold:PixTestDeliverySummary["hold"]) => ({
 payment_not_verified:"Pagamento não verificado",refunded:"Entrega bloqueada por estorno/cancelamento",
 missing_approval_timestamp:"Falta data de aprovação para VIP",
 reward_review_required:"Revisar recompensa antes da integração",
 vip_mapping_required:"VIP ainda sem mapeamento no Core",
 reward_missing:"Produto sem recompensa configurada",
 reward_invalid:"Recompensa inválida",quantity_invalid:"Quantidade inválida",
 product_invalid:"Produto inválido",plan_missing:"Plano de entrega ausente",
 dispatch_disabled:"Entrega real desativada",
}[hold]);

export function buildPixTestMonitor(
 orders:readonly PixTestOrderSummary[],deliveries:readonly PixTestDeliverySummary[]
){
 const jobsByOrder=new Map<string,PixTestDeliverySummary[]>();
 for(const job of deliveries){
  if(!/^[a-f0-9]{64}$/.test(job.orderId))continue;
  const jobs=jobsByOrder.get(job.orderId)??[];
  jobs.push(job);
  jobsByOrder.set(job.orderId,jobs);
 }
 const entries:MonitorEntry[]=orders.map(order=>{
  const jobs=jobsByOrder.get(order.id)??[];
  let status:MonitorEntry["status"];
  if(finalStates.has(order.state))status="closed";
  else if(jobs.some(j=>needsReview.has(j.hold))||order.state==="unknown"||
          (order.state==="approved" && jobs.length===0))status="attention";
  else if(order.state==="approved")status="approved";
  else status="pending";
  return {order,deliveries:jobs,status};
 });
 const unlinked=deliveries.filter(job=>!orders.some(o=>o.id===job.orderId));
 const counts={
  total:entries.length,
  pending:entries.filter(e=>e.status==="pending").length,
  approved:entries.filter(e=>e.status==="approved").length,
  attention:entries.filter(e=>e.status==="attention").length,
  closed:entries.filter(e=>e.status==="closed").length,
  deliveryJobs:deliveries.length,
  heldJobs:deliveries.filter(j=>needsReview.has(j.hold)).length,
  unlinkedJobs:unlinked.length,
 };
 return {entries,counts,unlinked};
}
export function filterPixTestEntries(
 entries:readonly MonitorEntry[],search:string,filter:MonitorFilter
){
 const query=search.trim().toLocaleLowerCase("pt-BR").slice(0,128);
 return entries.filter(entry=>{
  if(filter!=="all"&&entry.status!==filter)return false;
  if(!query)return true;
  return [entry.order.id,entry.order.gamertag,
   entry.order.providerOrderId??"",...entry.deliveries.map(j=>j.id)]
   .some(s=>s.toLocaleLowerCase("pt-BR").includes(query));
 });
}
