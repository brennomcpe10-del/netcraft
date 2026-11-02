import {test} from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {buildPixTestMonitor,filterPixTestEntries,
  paymentLabel,deliveryHoldLabel} from "../src/lib/pixTestMonitor.ts";
import {PixTestMonitor} from "../src/components/PixTestMonitor.tsx";
import type {PixTestOrderSummary,PixTestDeliverySummary} from "../src/types/index.ts";

const id=(letter:string)=>letter.repeat(64);
const sample=(ch:string,state:PixTestOrderSummary["state"]="pending"):PixTestOrderSummary=>({
 id:id(ch),environment:"test",state,gamertag:"Lab "+ch.toUpperCase(),
 totalCents:1999,linesCount:2,createdAt:"2026-11-02T09:00:00.000Z",
 approvedAt:state==="approved"?"2026-11-02T09:01:00.000Z":null,
 approvalObservedAt:state==="approved"?"2026-11-02T09:01:30.000Z":null,
 providerOrderId:"ORD-TEST-"+ch,expiresAt:"2026-11-02T09:15:00.000Z",
});
const job=(ch:string,hold:PixTestDeliverySummary["hold"]):PixTestDeliverySummary=>({
 id:id(ch)+"-0",orderId:id(ch),gamertag:"Lab "+ch.toUpperCase(),
 kind:"items",units:2,state:"pending",hold,dispatchEnabled:false,
 createdAt:"2026-11-02T09:02:00.000Z",
});
test("monitor separates payment processing, confirmed sandbox, review, closed, and unlinked records",()=>{
 const orders=[sample("a"),sample("b","approved"),sample("c","approved"),
  sample("d","refunded"),sample("e","unknown"),sample("f","approved")];
 const deliveries=[job("b","dispatch_disabled"),job("c","reward_invalid"),
  job("d","refunded"),job("9","payment_not_verified")];
 const summary=buildPixTestMonitor(orders,deliveries);
 assert.deepEqual(summary.counts,{
  total:6,pending:1,approved:1,attention:3,closed:1,
  deliveryJobs:4,heldJobs:3,unlinkedJobs:1,
 });
 assert.equal(summary.entries.find(x=>x.order.id===id("c"))?.status,"attention");
 assert.equal(summary.entries.find(x=>x.order.id===id("f"))?.status,"attention",
  "Pix approved with no matching delivery is not reported ready");
 assert.equal(summary.entries.find(x=>x.order.id===id("d"))?.status,"closed");
 assert.equal(summary.entries.find(x=>x.order.id===id("b"))?.status,"approved");
 assert.deepEqual(filterPixTestEntries(summary.entries,"lab c","attention")
  .map(x=>x.order.id),[id("c")]);
 assert.deepEqual(filterPixTestEntries(summary.entries,id("b")+"-0","all")
  .map(x=>x.order.id),[id("b")]);
 assert.equal(filterPixTestEntries(summary.entries,"not-found","all").length,0);
 assert.equal(filterPixTestEntries(summary.entries,"","closed").length,1);
 assert.match(paymentLabel("approved"),/teste/);
 assert.match(deliveryHoldLabel("refunded"),/estorno/);
});
test("monitor renders mobile-ready, readonly, no real-money claims and links jobs to orders",()=>{
 const order=sample("a","approved");
 const html=renderToStaticMarkup(<PixTestMonitor
  orders={[order]} deliveries={[job("a","dispatch_disabled")]}
  refreshedAt={Date.parse("2026-11-02T10:00:00.000Z")}
  loading={false} error="" onRefresh={()=>{}}/>);
 for(const snippet of [
  "Acompanhamento de Pix e entregas", "Pagamentos comerciais OFF",
  "concessões Minecraft OFF","Buscar Pix de teste","Filtrar Pix de teste",
  "Pix teste confirmado","1 entrega(s) associada(s)",
  'aria-label="Resumo de pedidos Pix de teste"',
  "Ver pagamento e entregas",
 ]){
  assert.ok(html.includes(snippet),snippet);
 }
 assert.ok(!html.includes("CPF"));
 assert.ok(!html.includes("Copiar cobrança"));
 const css=readFileSync(new URL("../src/index.css",import.meta.url),"utf8");
 assert.match(css,/@media \(max-width: 599px\)/);
});
test("partial fetch errors visibly mark all dashboard metrics incomplete",()=>{
 const html=renderToStaticMarkup(<PixTestMonitor
  orders={[sample("a","approved")]} deliveries={[]}
  refreshedAt={null} loading={false}
  error="Não foi possível carregar a fila." onRefresh={()=>{}}/>);
 assert.match(html,/role="alert"/);
 assert.match(html,/Dados incompletos/);
 assert.match(html,/Atenção necessária/);
 assert.match(html,/Nenhuma consulta completa disponível/);
 const source=readFileSync(new URL("../src/views/AdminView.tsx",import.meta.url),"utf8");
 assert.match(source,/Promise\.allSettled/);
 assert.match(source,/setPixTestRefreshedAt\(null\)/);
 assert.match(source,/<PixTestMonitor/);
 assert.ok(!source.includes("function pixTestStateLabel"));
});

test("historical order tracking filters stored statuses without claiming sandbox or real delivery proof",async()=>{
 const {legacyOrderOverview,filterLegacyOrders}=await import("../src/lib/legacyOrderMonitor.ts");
 const historic = [
  {id:"hist-pending",status:"Pendente",recipientNickname:"Halzin",buyerNickname:"Owner",productName:"Kit",transactionId:"T1"},
  {id:"hist-paid",status:"Pago",recipientNickname:"Alice",buyerNickname:"Buyer",productName:"VIP",transactionId:"T2"},
  {id:"hist-delivered",status:"Entregue",recipientNickname:"Bob",buyerNickname:"Buyer",productName:"Kit",transactionId:"T3"},
  {id:"hist-refunded",status:"Reembolsado",recipientNickname:"Carol",buyerNickname:"Buyer",productName:"VIP",transactionId:"T4"},
  {id:"hist-cancel",status:"Cancelado",recipientNickname:"Dan",buyerNickname:"Buyer",productName:"Kit",transactionId:"T5"},
 ] as any[];
 const stats=legacyOrderOverview(historic);
 assert.deepEqual(stats,{total:5,pending:1,paid:1,delivered:1,closed:2});
 assert.deepEqual(filterLegacyOrders(historic,"paid","").map(x=>x.id),["hist-paid"]);
 assert.deepEqual(filterLegacyOrders(historic,"closed","").map(x=>x.id),["hist-refunded","hist-cancel"]);
 assert.deepEqual(filterLegacyOrders(historic,"all","hAlZiN").map(x=>x.id),["hist-pending"]);
 assert.deepEqual(filterLegacyOrders(historic,"all","T3").map(x=>x.id),["hist-delivered"]);
 const source=readFileSync(new URL("../src/views/AdminView.tsx",import.meta.url),"utf8");
 assert.match(source,/Filtrar pedidos históricos/);
 assert.match(source,/Histórico legado/);
 assert.match(source,/filterLegacyOrders\(orders,legacyOrderFilter,searchQuery\)/);
});
