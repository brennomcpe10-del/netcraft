import React, {useEffect, useRef, useState} from 'react';
import type {VIP} from '../../types/index.ts';

type CommercialOrder={
  id:string;state:string;totalCents:number;qrCode?:string;
  qrCodeBase64?:string;qrBase64?:string;deliveryStatus?:string;
};
type StoredOrder={key:string;productId:string;gamertag:string};
type Voucher={orderId:string;code:string;expiresAt:string};
const STORAGE='netcraft-commercial-vip-order-v1';
const VOUCHER='netcraft-commercial-vip-voucher-v1';
const CODE=/^NC-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/;
const ID=/^[a-f0-9]{64}$/;
const KEY=/^[A-Za-z0-9-]{20,80}$/;
const cents=(n:number)=>Number.isSafeInteger(n)&&n>=0?
  (n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
const safeJSON=async(response:Response):Promise<any>=>{
  if(!response.headers.get('content-type')?.includes('application/json'))
    throw Error('Não foi possível consultar o pagamento. Tente novamente.');
  return response.json();
};
function readOrder():StoredOrder|null{
  try{
    const raw=sessionStorage.getItem(STORAGE);
    if(!raw||raw.length>300)return null;
    const item=JSON.parse(raw);
    if(KEY.test(item?.key||'')&&typeof item?.productId==='string'&&
       /^[A-Za-z0-9_.-]{1,128}$/.test(item.productId)&&
       typeof item?.gamertag==='string'&&item.gamertag.length<=32)
      return {key:item.key,productId:item.productId,gamertag:item.gamertag};
  }catch{}
  return null;
}
function readVoucher(id:string):Voucher|null{
  try{
    const raw=sessionStorage.getItem(VOUCHER);
    if(!raw||raw.length>400)return null;
    const item=JSON.parse(raw);
    if(item.orderId===id&&CODE.test(item.code||'')&&
       typeof item.expiresAt==='string'&&
       Number.isFinite(Date.parse(item.expiresAt))&&
       Date.parse(item.expiresAt)>Date.now())
      return {orderId:id,code:item.code,expiresAt:item.expiresAt};
  }catch{}
  return null;
}
async function hashKey(key:string){
  const digest=await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('netcraft-commercial-v1:'+key));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

/** Enabled only after server-side /api/pix/commercial/config validates the merchant
 * and every release flag. Browser input cannot authorize a Pix or VIP grant.
 * All monetary amounts come back from the backend's approved product catalog.
 */
export function CommercialVipCheckout({
  item,buyerNickname,onClose,
}:{item:VIP;buyerNickname:string;onClose:()=>void}){
  const [saved,setSaved]=useState<StoredOrder|null>(readOrder);
  const [gamertag,setGamertag]=useState(buyerNickname);
  const [email,setEmail]=useState('');
  const [order,setOrder]=useState<CommercialOrder|null>(null);
  const [voucher,setVoucher]=useState<Voucher|null>(null);
  const [busy,setBusy]=useState(false);
  const [codeBusy,setCodeBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const issueAttempt=useRef('');
  const orderKey=saved?.key||'';

  async function refresh(key:string,signal?:AbortSignal){
    const id=await hashKey(key);
    const response=await fetch('/api/pix/commercial/orders/'+id,{
      headers:{'x-checkout-key':key},cache:'no-store',signal});
    const data=await safeJSON(response);
    if(!response.ok)throw Error(data.error||'Falha ao consultar o pedido.');
    if(data?.status==='not_found')return;
    if(data?.id!==id||typeof data?.state!=='string')
      throw Error('Resposta de pagamento inválida.');
    if(!signal?.aborted){
      setOrder(data);
      if(data.deliveryStatus==='delivered'){
        sessionStorage.removeItem(VOUCHER);
        setVoucher(null);
      }
    }
  }
  useEffect(()=>{
    if(!orderKey)return;
    const abort=new AbortController();
    let timer:ReturnType<typeof setInterval>|undefined;
    const tick=()=>{if(document.visibilityState==='visible')
      void refresh(orderKey,abort.signal).catch(e=>{
        if(!abort.signal.aborted)setError(String(e?.message||'Falha na consulta.'));
      });};
    tick();timer=setInterval(tick,12000);
    return ()=>{abort.abort();clearInterval(timer);};
  },[orderKey]);

  async function generateVoucher(){
    if(!saved||order?.state!=='approved'||order.deliveryStatus==='delivered'||
       codeBusy)return;
    setCodeBusy(true);setError('');
    try{
      const response=await fetch('/api/pix/commercial/orders/link-code',{
        method:'POST',headers:{'x-checkout-key':saved.key},cache:'no-store'});
      const body=await safeJSON(response);
      if(!response.ok||!CODE.test(body.code||'')||
         !Number.isFinite(Date.parse(body.expiresAt||'')))
        throw Error('Código indisponível. Se já existir um código ativo, use-o ou aguarde a expiração.');
      const created={orderId:order.id,code:body.code,expiresAt:body.expiresAt};
      sessionStorage.setItem(VOUCHER,JSON.stringify(created));
      setVoucher(created);
    }catch(e){setError(e instanceof Error?e.message:'Falha ao gerar código.');}
    finally{setCodeBusy(false);}
  }
  useEffect(()=>{
    if(!saved||!order||order.state!=='approved'||
       order.deliveryStatus==='delivered')return;
    const active=readVoucher(order.id);
    if(active){if(voucher?.code!==active.code)setVoucher(active);return;}
    if(issueAttempt.current===order.id)return;
    issueAttempt.current=order.id;
    void generateVoucher();
  },[order?.id,order?.state,order?.deliveryStatus,saved?.key]);

  async function start(e:React.FormEvent){
    e.preventDefault();if(busy||saved)return;
    const nick=gamertag.trim();
    if(!/^[A-Za-z0-9_ ]{3,32}$/.test(nick)){
      setError('Informe o nick exato do jogador Bedrock.');return;
    }
    const key=crypto.randomUUID();
    setBusy(true);setError('');setNotice('');
    const newOrder:StoredOrder={key,productId:item.id,gamertag:nick};
    // Persist BEFORE POST: even a network timeout may have created a Pix.
    try{sessionStorage.setItem(STORAGE,JSON.stringify(newOrder));setSaved(newOrder);}
    catch{
      setError('Ative o armazenamento da sessão para recuperar o pedido com segurança.');
      setBusy(false);return;
    }
    try{
      const response=await fetch('/api/pix/commercial/orders',{
        method:'POST',headers:{'Content-Type':'application/json','idempotency-key':key},
        body:JSON.stringify({gamertag:nick,email:email.trim(),
          lines:[{productId:item.id,quantity:1}]})});
      const data=await safeJSON(response);
      if(!response.ok)throw Error(data.error||'Pix indisponível.');
      setOrder(data);
    }catch{
      setError('Não foi possível confirmar a criação do Pix. O pedido foi preservado; use Atualizar status. Não pague duas vezes.');
    }finally{setBusy(false);}
  }
  function clear(){
    sessionStorage.removeItem(STORAGE);
    sessionStorage.removeItem(VOUCHER);
    issueAttempt.current='';
    setSaved(null);setOrder(null);setVoucher(null);setError('');
  }
  const final=order?.deliveryStatus==='delivered';
  const canNew=!!order&&(['expired','cancelled','refunded'].includes(order.state)||final);
  const labels:Record<string,string>={
    creating:'Criando pedido',pending:'Aguardando pagamento Pix',
    processing:'Mercado Pago processando',
    approved:'Pix aprovado e validado',
    expired:'Pix expirado',cancelled:'Pix cancelado',refunded:'Pagamento devolvido',
  };
  return <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
    <div className="fixed inset-0 bg-black/85" onClick={onClose}/>
    <div className="relative z-10 max-w-md w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0c1017] p-5 space-y-4 text-zinc-100">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-bold text-lg">Pix automático · VIP NetCraftBR</h2>
        <button type="button" onClick={onClose} aria-label="Fechar"
          className="text-zinc-300 p-2">✕</button>
      </div>
      {!saved&&<form onSubmit={start} className="space-y-3">
        <p className="text-sm text-zinc-300">VIP {item.name}. O valor final é confirmado pelo servidor antes de emitir o Pix.</p>
        <label className="block text-sm">Nick do jogador Bedrock
          <input required maxLength={32} value={gamertag}
            onChange={e=>setGamertag(e.target.value)}
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-white/20 p-3"/>
        </label>
        <label className="block text-sm">E-mail do comprador
          <input required type="email" maxLength={100} value={email}
            onChange={e=>setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-white/20 p-3"/>
        </label>
        <button disabled={busy} type="submit"
          className="w-full rounded-lg bg-emerald-600 p-3 text-white font-bold disabled:opacity-60">
          {busy?'Consultando o Mercado Pago...':'Gerar Pix de compra'}
        </button>
      </form>}
      {saved&&<div className="space-y-3">
        {saved.productId!==item.id&&<p className="text-amber-300 text-sm">
          Você tem uma compra anterior em andamento para outro plano. Conclua ou consulte esse pedido antes de comprar novamente.
        </p>}
        <p className="text-sm">Jogador: <strong>{saved.gamertag}</strong></p>
        <p role="status" className="font-semibold">
          {final?'VIP entregue e confirmado pelo Minecraft':
            labels[order?.state||'']||'Consultando pedido no Mercado Pago'}
        </p>
        {order&&<p className="text-lg font-semibold">{cents(order.totalCents)}</p>}
        {order&&['pending','processing'].includes(order.state)&&<>
          {(order.qrBase64||order.qrCodeBase64)&&
            <img className="mx-auto w-56 bg-white p-3 rounded-lg"
              alt="QR Code Pix da compra" src={'data:image/png;base64:'+(order.qrBase64||order.qrCodeBase64)}/>}
          {order.qrCode&&<label className="block text-sm">Pix Copia e Cola
            <textarea readOnly value={order.qrCode}
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-white/20 p-3 text-xs" rows={3}/>
            <button type="button" className="mt-1 text-emerald-300 underline"
              onClick={()=>void navigator.clipboard.writeText(order.qrCode||'')
                .then(()=>setNotice('Código Pix copiado.')).catch(()=>setNotice('Selecione e copie o código acima.'))}>
              Copiar Pix
            </button>
          </label>}
        </>}
        {order?.state==='approved'&&!final&&<div className="space-y-2">
          <p className="text-sm">Pagamento confirmado. Resgate no LOBBY pelo menu Benefícios → Vincular compra ou pelo comando /resgatar.</p>
          {voucher&&Date.parse(voucher.expiresAt)>Date.now()&&<>
            <input readOnly value={voucher.code} aria-label="Código temporário de resgate"
              className="w-full bg-zinc-900 rounded-lg border border-white/20 p-3 font-mono text-emerald-300"/>
            <button type="button" className="text-emerald-300 underline"
              onClick={()=>void navigator.clipboard.writeText(voucher.code)
                .then(()=>setNotice('Código de resgate copiado.')).catch(()=>setNotice('Selecione e copie o código acima.'))}>
              Copiar código de resgate
            </button>
            <p className="text-xs text-zinc-400">Expira em {new Date(voucher.expiresAt).toLocaleString('pt-BR')}</p>
          </>}
          {(!voucher||Date.parse(voucher.expiresAt)<=Date.now())&&
            <button type="button" disabled={codeBusy}
              onClick={()=>void generateVoucher()}
              className="w-full rounded-lg border border-emerald-500 p-3 disabled:opacity-60">
              {codeBusy?'Gerando código...':'Gerar código de resgate'}
            </button>}
          <p className="text-xs text-zinc-400">
            A entrega só será exibida como concluída após a confirmação do servidor.
          </p>
        </div>}
        {order?.deliveryStatus==='review_required'&&<p className="text-amber-300 text-sm">
          Entrega em revisão. Entre em contato com o suporte e informe o pedido.
        </p>}
        {order?.deliveryStatus==='queued'&&<p className="text-sm">
          Pagamento aprovado. Aguardando resgate e entrada do jogador no LOBBY.
        </p>}
        {order?.deliveryStatus==='processing'&&<p className="text-sm">
          VIP em processamento; aguardando confirmação do Minecraft.
        </p>}
        <button type="button" className="text-emerald-300 underline"
          onClick={()=>void refresh(saved.key).then(()=>setNotice('Status atualizado.'))
            .catch(()=>setError('Falha na consulta do pedido.'))}>
          Atualizar status
        </button>
        {canNew&&<button type="button" onClick={clear}
          className="ml-3 text-zinc-400 underline">Nova compra</button>}
      </div>}
      {notice&&<p role="status" className="text-emerald-300 text-sm">{notice}</p>}
      {error&&<p role="alert" className="text-amber-300 text-sm">{error}</p>}
    </div>
  </div>;
}
