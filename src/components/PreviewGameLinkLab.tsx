import React,{useState} from "react";

type LabReceipt={
  receiptId:string;gamertag:string;state:string;
  verifiedAt:number|null;proofExpiresAt?:number|null;
  simulation:true;grantsEnabled:false;
};
type Issued={code:string;receiptId:string;expiresAt:number;
  simulation:true;grantsEnabled:false};
type VipTier="explorer"|"elite"|"supreme";
type VipDryRun={status:"simulated_only"|"already_simulated";
  receiptId:string;gamertag:string;tier:VipTier;rankTag:string;
  days:30;startsAt:number;endsAt:number;
  simulation:true;dispatchEnabled:false;grantsEnabled:false;
  paymentsEnabled:false;liveVipGranted:false};

/**
 * Admin-only Preview lab. No checkout, payment or real VIP here.
 * Codes are transient React state only: never persisted in localStorage.
 */
export function PreviewGameLinkLab({adminToken}:{adminToken:string}){
  const [gamertag,setGamertag]=useState("");
  const [issued,setIssued]=useState<Issued|null>(null);
  const [receipt,setReceipt]=useState<LabReceipt|null>(null);
  const [busy,setBusy]=useState(false);
  const [tier,setTier]=useState<VipTier>("explorer");
  const [vipDryRun,setVipDryRun]=useState<VipDryRun|null>(null);
  const [message,setMessage]=useState("");
  const headers={Authorization:"Bearer "+adminToken};
  async function issue(){
    if(!/^[A-Za-z0-9_ ]{3,32}$/.test(gamertag)||
       gamertag.trim()!==gamertag){
      setMessage("Informe o gamertag Bedrock exato.");return;
    }
    // Preserve a still-valid displayed code if a rate-limited reissue fails.
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/delivery/lab-link/issue",{
        method:"POST",cache:"no-store",
        headers:{...headers,"Content-Type":"application/json"},
        body:JSON.stringify({gamertag}),
      });
      const json=await response.json();
      if(!response.ok||json?.simulation!==true||json.grantsEnabled!==false)
        throw new Error(json?.error||"Laboratório indisponível.");
      setIssued(json);
      setReceipt(null);
      setVipDryRun(null);
      setMessage("Código fictício gerado. Nenhuma cobrança foi criada.");
    }catch(e){
      setMessage(e instanceof Error?e.message:"Não foi possível gerar código.");
    }finally{setBusy(false);}
  }
  async function refresh(){
    if(!issued)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/delivery/lab-link/status/"+issued.receiptId,{
        cache:"no-store",headers,
      });
      const json=await response.json();
      if(!response.ok||json?.simulation!==true||json.grantsEnabled!==false)
        throw new Error(json?.error||"Não foi possível consultar a vinculação.");
      setReceipt(json);
    }catch(e){
      setMessage(e instanceof Error?e.message:"Status indisponível.");
    }finally{setBusy(false);}
  }
  async function simulateVip(){
    if(!issued||receipt?.state!=="verified_in_game")return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/delivery/lab-link/simulate-vip",{
        method:"POST",cache:"no-store",
        headers:{...headers,"Content-Type":"application/json"},
        body:JSON.stringify({receiptId:issued.receiptId,tier}),
      });
      const json=await response.json();
      if(!response.ok||json.simulation!==true||
         json.dispatchEnabled!==false||json.grantsEnabled!==false||
         json.paymentsEnabled!==false||json.liveVipGranted!==false||
         json.days!==30)
        throw new Error(json?.error||"Simulação indisponível.");
      setVipDryRun(json);
      setMessage("Simulação registrada, sem alterar VIP no jogo.");
    }catch(e){
      setMessage(e instanceof Error?e.message:"Simulação indisponível.");
    }finally{setBusy(false);}
  }
  return (
    <section className="rounded-2xl border border-emerald-700/30 bg-zinc-950 p-4 space-y-3">
      <h3 className="font-semibold text-zinc-100">Teste: Vincular compra no Minecraft</h3>
      <p className="text-xs text-zinc-400">
        Somente Preview. Código fictício válido por 10 minutos, não gera Pix,
        pedido comercial nem recompensa. Digite o código no menu
        Benefícios - Vincular compra do servidor de testes.
      </p>
      <label className="block text-sm text-zinc-300">
        Gamertag do jogador conectado
        <input className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
          autoComplete="off" placeholder="Gamertag Bedrock" maxLength={32}
          value={gamertag} onChange={e=>setGamertag(e.target.value)}/>
      </label>
      <button className="nc-button" type="button" disabled={busy} onClick={issue}>
        Gerar código de laboratório
      </button>
      {issued&&<div className="space-y-2">
        <label className="block text-xs text-zinc-400">
          Código temporário (não compartilhe publicamente)
          <input className="mt-1 w-full bg-zinc-900 p-2 rounded-lg font-mono text-emerald-300"
            value={issued.code} readOnly aria-label="Código temporário de vinculação"/>
        </label>
        <p className="text-xs text-zinc-400">
          Expira: {new Date(issued.expiresAt).toLocaleString("pt-BR")}
        </p>
        <button className="text-link" type="button" disabled={busy}
          onClick={refresh}>Consultar confirmação no jogo</button>
      </div>}
      {receipt && <p role="status" className="text-sm text-emerald-300">
        Estado: {receipt.state==="verified_in_game"
          ?"Código confirmado dentro do Minecraft (SEM entrega de VIP)"
          :receipt.state==="expired"?"Código expirado":"Aguardando código no jogo"}
      </p>}
      {receipt?.state==="verified_in_game" && issued &&
        <div className="space-y-2 border-t border-zinc-700 pt-3">
          <h4 className="text-sm font-semibold text-zinc-100">Simular entrega de VIP (SEM entregar)</h4>
          <p className="text-xs text-zinc-400">
            Gera somente um registro fictício com a tag e os 30 dias esperados.
            Nenhuma permissão, rank, dinheiro ou VIP será alterado no Minecraft.
            Uma simulação por código; para testar outro plano, faça uma nova vinculação.
          </p>
          <label className="block text-sm text-zinc-300">Plano do teste
            <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2"
              value={tier} disabled={busy||!!vipDryRun}
              onChange={e=>setTier(e.target.value as VipTier)}>
              <option value="explorer">Explorer - 30 dias</option>
              <option value="elite">Elite - 30 dias</option>
              <option value="supreme">Supreme - 30 dias</option>
            </select>
          </label>
          <button type="button" disabled={busy||!!vipDryRun} onClick={simulateVip}
            className="nc-button">Simular VIP (sem entrega real)</button>
        </div>}
      {vipDryRun&&<div role="status"
          className="rounded-lg border border-emerald-700/30 bg-zinc-900 p-3 text-sm text-zinc-200 space-y-1">
        <p className="font-semibold text-emerald-300">Simulação concluída — VIP NÃO ENTREGUE</p>
        <p>Jogador: {vipDryRun.gamertag}</p>
        <p>Plano: {vipDryRun.tier} ({vipDryRun.days} dias)</p>
        <p>Tag prevista: {vipDryRun.rankTag}</p>
        <p>Início fictício: {new Date(vipDryRun.startsAt).toLocaleString("pt-BR")}</p>
        <p>Fim fictício: {new Date(vipDryRun.endsAt).toLocaleString("pt-BR")}</p>
        <p className="text-xs text-amber-300">
          Não há liberação real, lançamento financeiro ou entrega automática neste teste.
        </p>
      </div>}
      {message&&<p role="status" className="text-xs text-amber-300">{message}</p>}
    </section>
  );
}
