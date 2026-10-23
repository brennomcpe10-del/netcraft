import React, { useEffect, useState } from "react";
import type { CartLine } from "../lib/cart.ts";
type Order = {
  id: string;
  state: string;
  apiVersion?: string;
  providerOrderId?: string;
  paymentId?:string|null;
  totalCents: number;
  discountCents: number;
  qrCode?: string;
  qrBase64?: string;
  expiresAt: string;
  delivery: string;
};
const money = (v: number) =>
  (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function PixCheckout({
  lines,
  disabled,
}: {
  lines: CartLine[];
  disabled: boolean;
}) {
  const [available, setAvailable] = useState(false),
    [configChecking, setConfigChecking] = useState(true),
    [configError, setConfigError] = useState(""),
    [gamertag, setGamertag] = useState(""),
    [email, setEmail] = useState(""),
    [cpf, setCpf] = useState(""),
    [couponCode, setCoupon] = useState(""),
    [order, setOrder] = useState<Order | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [key, setKey] = useState(() => {
    try {
      return sessionStorage.getItem("netcraft-pix-key") || "";
    } catch {
      return "";
    }
  });
  async function checkConfiguration(signal?: AbortSignal) {
    setConfigChecking(true);
    setConfigError("");
    try {
      const response = await fetch("/api/pix/config", {
        cache: "no-store",
        signal,
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "A API do checkout não retornou JSON. O acesso pode estar bloqueado pela proteção da Preview ou pela rota do servidor.",
        );
      const config = await response.json();
      if (!signal?.aborted) {
        setAvailable(response.ok && config.available === true);
        if (!response.ok || !config.available)
          setConfigError(
            config.reason ||
              "A API do checkout não conseguiu validar a configuração desta versão.",
          );
      }
    } catch (error) {
      if (!signal?.aborted) {
        setAvailable(false);
        setConfigError(
          error instanceof Error
            ? error.message
            : "Falha de conexão com o checkout.",
        );
      }
    } finally {
      if (!signal?.aborted) setConfigChecking(false);
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    checkConfiguration(abort.signal);
    return () => abort.abort();
  }, []);
  async function refresh(k = key, signal?: AbortSignal) {
    const id = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(k),
    );
    const hash = Array.from(new Uint8Array(id), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const r = await fetch(`/api/pix/orders/${hash}`, {
      headers: { "x-checkout-key": k },
      cache: "no-store",
      signal,
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    if (!signal?.aborted) {
      setOrder(d);
      setError("");
    }
  }
  useEffect(() => {
    if (!key || busy || order?.state === "creating") return;
    const abort = new AbortController();
    let active = true;
    const tick = () => {
      if (active && document.visibilityState === "visible")
        refresh(key, abort.signal).catch((e) => {
          if (active) setError(e.message);
        });
    };
    tick();
    const timer = setInterval(tick, 12000);
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
    };
  }, [key, busy, order?.state === "creating"]);
  function resetCheckout() {
    try {
      sessionStorage.removeItem("netcraft-pix-key");
      sessionStorage.removeItem("netcraft-pix-request");
    } catch {}
    setKey("");
    setOrder(null);
    setError("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const request = {
      lines,
      gamertag: gamertag.trim(),
      email: email.trim(),
      cpf: cpf.replace(/\D/g, ""),
      couponCode: couponCode.trim(),
    };
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(request)),
    );
    const fingerprint = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    let previousFingerprint = "";
    try {
      previousFingerprint =
        sessionStorage.getItem("netcraft-pix-request") || "";
    } catch {}
    // A previously reserved order must be retried with the same key.
    // Never create a second provider order while the first is unresolved.
    const k = key && previousFingerprint === fingerprint ? key : crypto.randomUUID();
    setKey(k);
    setOrder(null);
    try {
      sessionStorage.setItem("netcraft-pix-key", k);
      sessionStorage.setItem("netcraft-pix-request", fingerprint);
    } catch {}
    try {
      const r = await fetch("/api/pix/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "idempotency-key": k },
        body: JSON.stringify(request),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error || "Falha ao gerar Pix.");
      }
      setOrder(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar Pix.");
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    creating: "Criando cobrança",
    pending: "Aguardando pagamento",
    processing: "Processando no Mercado Pago",
    approved: "Pagamento aprovado — teste",
    expired: "Pix expirado",
    cancelled: "Pagamento cancelado",
    refunded: "Pagamento devolvido",
  };
  return (
    <section className="space-y-4 min-w-0">
      <h3 className="font-bold text-lg">Pix automático · ambiente de teste</h3>
      <p className="text-sm text-zinc-400">
        Não pague com seu banco. Este fluxo não entrega itens no servidor.
      </p>
      {order?.apiVersion === "payments-legacy" && !order.paymentId && <div className="space-y-2"><p>Esta tentativa pertence ao checkout anterior. O registro será preservado; reiniciar não cancela uma eventual cobrança anterior.</p><button className="text-link" type="button" onClick={resetCheckout}>Reiniciar checkout</button></div>}
      {order?.state === "creating" && (
        <div role="status" className="space-y-2">
          <p>Esta tentativa ainda não foi concluída pelo Mercado Pago. Preencha os mesmos dados e clique em Gerar Pix de teste para tentar recuperá-la sem duplicar a cobrança.</p>
          <button className="text-link" type="button" onClick={resetCheckout}>Descartar esta tentativa local e começar outra</button>
        </div>
      )}
      {order && order.state !== "creating" ? (
        <div className="space-y-3">
          <p role="status">{labels[order.state] || order.state}</p>
          <strong>{money(order.totalCents)}</strong>
          {order.discountCents > 0 && (
            <p>Desconto validado: {money(order.discountCents)}</p>
          )}
          {(order.state === "pending" || order.state === "processing") && (
            <>
              {order.qrBase64 && (
                <img
                  className="w-full max-w-64 bg-white p-3 rounded-xl"
                  alt="QR Code Pix de teste"
                  src={`data:image/png;base64,${order.qrBase64}`}
                />
              )}
              {!order.qrCode && (
                <p role="status">
                  Aguardando a geração do QR Code pela Orders API. O pedido já
                  foi registrado e será consultado novamente.
                </p>
              )}
              {order.qrCode && (
                <>
                  <label className="block">
                    Pix Copia e Cola
                    <textarea
                      readOnly
                      className="w-full bg-zinc-900 p-3 rounded-xl text-xs"
                      value={order.qrCode || ""}
                    />
                  </label>
                  <button
                    className="nc-button"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(order.qrCode || "")
                        .then(() => setError("Código copiado."))
                        .catch(() =>
                          setError("Selecione e copie o código acima."),
                        )
                    }
                  >
                    Copiar código Pix
                  </button>
                </>
              )}
              <p>
                Validade: {new Date(order.expiresAt).toLocaleString("pt-BR")}
              </p>
            </>
          )}
          <p className="text-sm">{order.delivery}</p>
          <button
            className="text-link"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Atualizar status
          </button>
          {["cancelled", "expired", "refunded", "approved"].includes(
            order.state,
          ) && (
            <button
              className="text-link"
              onClick={() => {
                resetCheckout();
              }}
            >
              Iniciar outro pedido
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {[
            ["Gamertag Bedrock", gamertag, setGamertag, "text"],
            ["E-mail de teste", email, setEmail, "email"],
            ["CPF do comprador de teste", cpf, setCpf, "text"],
            ["Cupom (opcional)", couponCode, setCoupon, "text"],
          ].map(([label, value, set, type]) => (
            <label key={String(label)} className="block text-sm">
              {String(label)}
              <input
                className="block w-full rounded-xl bg-zinc-900 p-3 border border-white/10"
                type={String(type)}
                value={String(value)}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
                inputMode={
                  label === "CPF do comprador de teste" ? "numeric" : undefined
                }
                placeholder={
                  label === "Cupom (opcional)"
                    ? "Deixe vazio se não tiver cupom"
                    : label === "CPF do comprador de teste"
                      ? "Com ou sem pontos e traço"
                      : undefined
                }
                required={label !== "Cupom (opcional)"}
                maxLength={100}
              />
            </label>
          ))}
          <button
            className="nc-button w-full"
            disabled={disabled || busy || configChecking || !available}
          >
            {configChecking
              ? "Verificando integração…"
              : busy
                ? "Gerando Pix…"
                : "Gerar Pix de teste"}
          </button>
        </form>
      )}
      {configChecking && (
        <p role="status">Verificando a conta de teste no Mercado Pago…</p>
      )}
      {!configChecking && !available && (
        <div className="space-y-2">
          <p role="alert" className="text-amber-300 text-sm">
            {configError}
          </p>
          <button
            className="text-link"
            type="button"
            onClick={() => checkConfiguration()}
          >
            Verificar integração novamente
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-amber-300 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
