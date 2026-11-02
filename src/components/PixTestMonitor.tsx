import React, {useMemo,useState} from "react";
import type {PixTestOrderSummary,PixTestDeliverySummary} from "../types/index.ts";
import {buildPixTestMonitor,deliveryHoldLabel,filterPixTestEntries,paymentLabel,
 type MonitorFilter} from "../lib/pixTestMonitor.ts";

const money=(value:number)=>new Intl.NumberFormat("pt-BR",{
 style:"currency",currency:"BRL",
}).format(value/100);
const time=(value:string|null)=>{
 if(!value)return "Não registrada";
 const d=new Date(value);
 return Number.isNaN(d.getTime())?"Data não identificada":d.toLocaleString("pt-BR");
};
const filterLabels:Record<MonitorFilter,string>={
 all:"Todos",pending:"Aguardando",approved:"Aprovados (teste)",
 attention:"Exigem revisão",closed:"Encerrados",
};
const statusLabels={
 pending:"Aguardando verificação",approved:"Pix teste confirmado · entrega OFF",
 attention:"Atenção necessária",closed:"Pedido de teste encerrado",
};
type Props={
 orders:PixTestOrderSummary[];
 deliveries:PixTestDeliverySummary[];
 loading:boolean;
 error:string;
 refreshedAt:number|null;
 onRefresh:()=>void;
};
export function PixTestMonitor({orders,deliveries,loading,error,refreshedAt,onRefresh}:Props){
 const [search,setSearch]=useState("");
 const [filter,setFilter]=useState<MonitorFilter>("all");
 const [expanded,setExpanded]=useState<string|null>(null);
 const monitor=useMemo(()=>buildPixTestMonitor(orders,deliveries),[orders,deliveries]);
 const visible=useMemo(()=>filterPixTestEntries(monitor.entries,search,filter),
  [monitor,search,filter]);
 const incomplete=Boolean(error)||refreshedAt===null;
 return <section className="rounded-xl border border-emerald-500/20 bg-white/[0.02] p-4 sm:p-5 space-y-4"
  aria-label="Monitor de Pix e entregas de teste">
  <div className="flex flex-wrap justify-between items-start gap-3">
   <div className="min-w-0">
    <h3 className="text-sm font-bold text-white">Acompanhamento de Pix e entregas · laboratório</h3>
    <p className="text-xs text-zinc-400 mt-1">
     Últimos 50 pedidos e 50 registros da fila, somente leitura. Não representam vendas
     reais, faturamento ou entregas no Minecraft.
    </p>
    <p className="text-xs text-amber-300 mt-1">
     Pagamentos comerciais OFF · concessões Minecraft OFF · nenhuma ação de liberação neste painel.
    </p>
   </div>
   <button type="button" className="px-3 py-2 rounded-lg border border-white/15 text-emerald-300 text-xs disabled:opacity-50"
    disabled={loading} onClick={onRefresh}>
    {loading?"Consultando…":"Atualizar acompanhamento"}
   </button>
  </div>
  {error&&<p role="alert" className="text-amber-300 text-xs">
   {error} Os indicadores não devem ser interpretados como dados completos.
  </p>}
  <p className="text-zinc-400 text-xs" aria-live="polite">
   {loading?"Atualizando…":refreshedAt? "Consultado em "+time(new Date(refreshedAt).toISOString()):
    "Nenhuma consulta completa disponível."}
   {incomplete?" · Dados incompletos":""}
  </p>
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" aria-label="Resumo de pedidos Pix de teste">
   {([
    ["Pedidos consultados",monitor.counts.total],
    ["Aguardando",monitor.counts.pending],
    ["Aprovados no teste",monitor.counts.approved],
    ["Exigem revisão",monitor.counts.attention],
    ["Encerrados",monitor.counts.closed],
    ["Registros na fila",monitor.counts.deliveryJobs],
    ["Entregas com impedimentos",monitor.counts.heldJobs],
    ["Entregas fora dos 50 pedidos",monitor.counts.unlinkedJobs],
   ] as [string,number][]).map(([label,count])=>
    <div className="p-3 min-w-0 rounded-lg bg-black/20 border border-white/10" key={label}>
     <p className="text-zinc-400 text-[11px]">{label}</p>
     <strong className="block text-lg text-white tabular-nums">{count}</strong>
    </div>
   )}
  </div>
  <div className="flex flex-col sm:flex-row gap-2 min-w-0">
   <label className="min-w-0 flex-1 text-xs text-zinc-300">
    Buscar por jogador, pedido ou entrega
    <input aria-label="Buscar Pix de teste" type="search" maxLength={128}
     className="mt-1 w-full min-w-0 rounded-lg px-3 py-2 bg-black/20 border border-white/15 text-white"
     placeholder="Nick ou identificação do teste" value={search}
     onChange={e=>setSearch(e.target.value)}/>
   </label>
   <label className="sm:w-52 text-xs text-zinc-300">
    Situação
    <select aria-label="Filtrar Pix de teste" value={filter} onChange={e=>setFilter(e.target.value as MonitorFilter)}
     className="mt-1 w-full min-w-0 rounded-lg px-3 py-2 bg-zinc-900 border border-white/15 text-white">
     {(Object.keys(filterLabels) as MonitorFilter[]).map(key=><option key={key} value={key}>{filterLabels[key]}</option>)}
    </select>
   </label>
  </div>
  {loading&&orders.length===0?<p role="status" className="text-xs text-zinc-400">Carregando simulações…</p>:
   visible.length===0?<p className="text-xs text-zinc-400">
    {orders.length===0?"Nenhum Pix de teste consultado.":"Nenhum pedido corresponde aos filtros."}
   </p>:<div className="divide-y divide-white/10" aria-label="Pedidos de teste">
    {visible.map(entry=>{
     const order=entry.order,open=expanded===order.id;
     return <div key={order.id} className="py-3 min-w-0">
      <div className="flex flex-wrap justify-between items-start gap-3 text-xs">
       <div className="min-w-0 flex-1">
        <p className="text-white font-semibold break-words">
         {order.gamertag} · {order.linesCount} item(ns)
        </p>
        <p className="text-zinc-400 font-mono text-[11px] break-all">Pedido teste #{order.id.slice(0,16)}</p>
        <p className="text-zinc-400 text-[11px]">Criado: {time(order.createdAt)}</p>
        <p className="text-zinc-300 text-[11px]">{paymentLabel(order.state)}</p>
        <p className={entry.status==="attention"?"text-amber-300 text-[11px]":"text-emerald-300 text-[11px]"}>
         {statusLabels[entry.status]} · {entry.deliveries.length} entrega(s) associada(s)
        </p>
       </div>
       <div className="text-right flex flex-col gap-2 items-end min-w-0">
        <strong className="text-white tabular-nums">{money(order.totalCents)}</strong>
        <button type="button" aria-expanded={open} aria-controls={"test-order-"+order.id}
         className="text-xs text-emerald-300 border border-white/10 px-3 py-2 rounded-lg"
         onClick={()=>setExpanded(open?null:order.id)}>
         {open?"Ocultar detalhes":"Ver pagamento e entregas"}
        </button>
       </div>
      </div>
      {open&&<div id={"test-order-"+order.id} className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 space-y-2 text-xs">
       <p className="text-zinc-300 break-all">ID interno: {order.id}</p>
       <p className="text-zinc-400 break-all">Pedido Mercado Pago teste: {order.providerOrderId??"Não confirmado"}</p>
       <p className="text-zinc-400">Aprovação informada: {time(order.approvedAt)}</p>
       <p className="text-zinc-400">Última confirmação observada: {time(order.approvalObservedAt)}</p>
       <p className="text-zinc-400">Vencimento: {time(order.expiresAt)}</p>
       {entry.deliveries.length===0?
        <p className="text-amber-300">Nenhum registro de entrega vinculado entre os 50 mais recentes.</p>:
        <div className="space-y-2">
         {entry.deliveries.map(job=><div key={job.id} className="border-t border-white/10 pt-2">
          <p className="text-zinc-200">{job.kind==="vip"?"VIP":job.kind==="items"?"Kit/itens":"Recompensa não configurada"} · {job.units} unidade(s)</p>
          <p className="text-zinc-400 font-mono break-all">Entrega #{job.id}</p>
          <p className="text-amber-300">{deliveryHoldLabel(job.hold)}</p>
          <p className="text-zinc-500">Execução no Minecraft: DESATIVADA</p>
         </div>)}
        </div>}
      </div>}
     </div>;
    })}
   </div>}
  {monitor.unlinked.length>0&&<details className="text-xs border-t border-white/10 pt-3">
   <summary className="cursor-pointer text-amber-300">
    {monitor.unlinked.length} registro(s) da fila sem pedido entre os 50 consultados
   </summary>
   <p className="text-zinc-400 mt-2">Isso pode ocorrer pelo limite de consulta; não significa que os pagamentos tenham sido aprovados.</p>
   {monitor.unlinked.map(j=><p className="text-zinc-300 break-all py-1" key={j.id}>
    #{j.id.slice(0,16)} · {j.gamertag} · {deliveryHoldLabel(j.hold)}
   </p>)}
  </details>}
 </section>;
}
