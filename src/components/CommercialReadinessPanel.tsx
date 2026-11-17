import React, {useEffect,useState} from "react";
import {api} from "../lib/api.ts";

type Readiness=Awaited<ReturnType<typeof api.getCommercialReadiness>>;
export function CommercialReadinessPanel({adminToken}:{adminToken:string}){
  const [status,setStatus]=useState<Readiness|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    setError("");
    api.getCommercialReadiness(adminToken).then(result=>{
      if(active)setStatus(result);
    }).catch(()=>{
      if(active){setStatus(null);setError("Verificação indisponível.");}
    }).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[adminToken,revision]);
  const preview=status?.environment==="preview";
  return (
    <section className="rounded-xl border border-white/[0.1] bg-zinc-950/80 p-4 space-y-3"
      aria-label="Preparação comercial do Pix e Minecraft">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h3 className="font-semibold text-zinc-100">Pix real + entrega no Minecraft</h3>
          <p className="text-xs text-zinc-400">
            Diagnóstico administrativo somente leitura; não cobra nem entrega itens.
          </p>
        </div>
        <button type="button" className="text-sm rounded-md border border-zinc-600 px-3 py-2 text-zinc-100"
          disabled={loading} onClick={()=>setRevision(n=>n+1)}>
          {loading?"Verificando...":"Atualizar"}
        </button>
      </div>
      {error&&<p role="alert" className="text-sm text-amber-300">{error}</p>}
      {status&&<>
        <p className="text-sm font-medium text-amber-300" role="status">
          {preview?"Preview: somente testes, vendas reais desativadas":
           status.status==="blocked"?"Produção: checkout comercial bloqueado":
           "Configuração encontrada; revisão presencial e homologação ainda obrigatórias"}
        </p>
        <p className="text-xs text-zinc-300">
          Não libere pagamentos reais até concluir os testes de Pix, vinculação Bedrock,
          entrega única, reembolso e reconexão do servidor.
        </p>
        {status.missing.length>0 &&(
          <details className="text-xs text-zinc-300">
            <summary className="cursor-pointer">
              {status.missing.length} verificações ainda pendentes neste ambiente
            </summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc">
              {status.missing.map(name=><li key={name}><code>{name}</code></li>)}
            </ul>
            <p className="mt-2 text-zinc-400">
              Não copie segredos para o navegador. Esta lista apresenta apenas nomes
              de configurações ausentes ou desativadas.
            </p>
          </details>
        )}
      </>}
    </section>
  );
}
