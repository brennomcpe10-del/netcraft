import type {Order} from "../types/index.ts";
export type LegacyFilter = "all"|"pending"|"paid"|"delivered"|"closed";
export function legacyOrderOverview(orders:readonly Order[]){
 return {
  total:orders.length,
  pending:orders.filter(o=>o.status==="Pendente").length,
  paid:orders.filter(o=>o.status==="Pago").length,
  delivered:orders.filter(o=>o.status==="Entregue").length,
  closed:orders.filter(o=>["Cancelado","Estornado","Reembolsado"].includes(o.status)).length,
 };
}
export function filterLegacyOrders(
 orders:readonly Order[],filter:LegacyFilter,rawSearch:string,
):Order[]{
 const search=rawSearch.toLocaleLowerCase("pt-BR").trim().slice(0,128);
 const matches=(o:Order)=>filter==="all"||
  filter==="pending"&&o.status==="Pendente"||
  filter==="paid"&&o.status==="Pago"||
  filter==="delivered"&&o.status==="Entregue"||
  filter==="closed"&&["Cancelado","Estornado","Reembolsado"].includes(o.status);
 return orders.filter(o=>matches(o)&&(!search||
  [o.id,o.recipientNickname,o.buyerNickname,o.productName,o.couponCode??"",o.transactionId]
   .some(v=>String(v??"").toLocaleLowerCase("pt-BR").includes(search))));
}
