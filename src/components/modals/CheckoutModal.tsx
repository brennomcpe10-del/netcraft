import React, { useState } from 'react';
import { VIP, Product, Order } from '../../types/index.ts';
import { usePlayer } from '../../context/PlayerContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { api } from '../../lib/api.ts';
import { saveOrderToFirestore } from '../../lib/firestoreSync.ts';
import { X, ExternalLink, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CheckoutModalProps {
  item: VIP | Product;
  itemType: 'vip' | 'product';
  livePixUrl?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  item,
  itemType,
  livePixUrl,
  onClose
}) => {
  const { player, openLoginModal } = usePlayer();
  const { showSuccess, showError } = useToast();

  const [recipientType, setRecipientType] = useState<'self' | 'gift'>('self');
  const [recipientNickname, setRecipientNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  // Link do LivePix específico do item ou fallback global
  const targetLivePixUrl = (item.livepixUrl && item.livepixUrl.trim().length > 0)
    ? item.livepixUrl.trim()
    : (livePixUrl && livePixUrl.trim().length > 0 ? livePixUrl.trim() : '');

  if (!player) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm cursor-pointer" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-[#0d1017] border border-white/[0.08] rounded-2xl p-6 text-center space-y-4 z-10 shadow-2xl">
          <h3 className="text-lg font-bold text-white font-heading">Identificação Necessária</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Informe seu nickname do Minecraft antes de prosseguir com a compra.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                openLoginModal();
              }}
              className="flex-1 py-2.5 rounded-lg bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handlePayWithLivePix = async () => {
    const finalRecipient = recipientType === 'self' ? player.nickname : recipientNickname.trim();
    if (!finalRecipient) {
      showError('Informe o nickname do jogador beneficiário.');
      return;
    }

    try {
      setLoading(true);
      const order = await api.createOrder({
        buyerNickname: player.nickname,
        recipientNickname: finalRecipient,
        productId: item.id,
        productType: itemType,
        paymentMethod: 'LIVEPIX'
      });

      setActiveOrder(order);
      await saveOrderToFirestore(order).catch(() => {});

      if (targetLivePixUrl) {
        window.open(targetLivePixUrl, '_blank');
        showSuccess(`Pedido #${order.id} gerado! Redirecionando para o LivePix...`);
      } else {
        showError('Aviso: O administrador ainda não definiu o link do LivePix para este item.');
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Falha ao processar pedido.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0c1017] border border-white/[0.1] rounded-2xl p-6 sm:p-8 my-8 shadow-2xl z-10">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* STEP 1: BEFORE ORDER CREATION */}
        {!activeOrder && (
          <div className="space-y-6">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#00e676] font-bold">
                Checkout • NetCraftBR
              </span>
              <h2 className="text-xl font-black font-heading text-white mt-1">
                {item.name}
              </h2>
              <div className="text-2xl font-black text-[#00e676] mt-1 flex items-baseline gap-2">
                <span>R$ {item.price.toFixed(2).replace('.', ',')}</span>
                {'duration' in item && item.duration && (
                  <span className="text-xs text-zinc-400 font-normal font-sans">
                    / {item.duration}
                  </span>
                )}
              </div>
            </div>

            {/* Question: Para qual jogador deseja comprar? */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wide">
                Beneficiário do Plano
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRecipientType('self')}
                  className={`p-3 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                    recipientType === 'self'
                      ? 'border-[#00e676]/60 bg-[#00e676]/[0.08] text-white font-semibold shadow-[0_0_12px_rgba(0,230,118,0.15)]'
                      : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-semibold text-white">Comprar para mim</div>
                  <div className="text-[11px] text-[#00e676] font-mono truncate mt-0.5">{player.nickname}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRecipientType('gift')}
                  className={`p-3 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                    recipientType === 'gift'
                      ? 'border-[#00e676]/60 bg-[#00e676]/[0.08] text-white font-semibold shadow-[0_0_12px_rgba(0,230,118,0.15)]'
                      : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-semibold text-white">Presentear amigo</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">Outro nickname</div>
                </button>
              </div>

              {recipientType === 'gift' && (
                <div className="pt-1">
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Nickname do jogador no Bedrock
                  </label>
                  <input
                    type="text"
                    value={recipientNickname}
                    onChange={e => setRecipientNickname(e.target.value)}
                    placeholder="Nickname exato no Minecraft Bedrock"
                    className="w-full px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.12] focus:border-[#00e676] rounded-xl text-xs font-mono text-white outline-none"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Payment Method - ÚNICA OPÇÃO: LIVEPIX */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wide">
                Forma de Pagamento
              </label>
              
              <div className="p-3.5 rounded-xl border border-[#00e676]/40 bg-[#00e676]/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#00e676]/20 border border-[#00e676]/40 flex items-center justify-center text-[#00e676]">
                    <Zap className="w-5 h-5 fill-[#00e676]" />
                  </div>
                  <div>
                    <div className="font-heading font-black text-sm text-white tracking-wide flex items-center gap-2">
                      <span>LIVEPIX</span>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#00e676] text-zinc-950 font-bold uppercase tracking-wider">
                        Opção Única
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Pagamento rápido e seguro via LivePix
                    </div>
                  </div>
                </div>
                <div className="w-5 h-5 rounded-full bg-[#00e676] text-zinc-950 flex items-center justify-center font-bold text-xs shadow-[0_0_8px_#00e676]">
                  ✓
                </div>
              </div>
            </div>

            {/* Aviso caso LivePix não esteja configurado */}
            {!targetLivePixUrl && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="text-[11px]">
                  O administrador ainda não cadastrou o link do LivePix específico para este item no painel administrativo.
                </span>
              </div>
            )}

            {/* BOTÃO ÚNICO DE COMPRA COM LIVEPIX */}
            <button
              type="button"
              onClick={handlePayWithLivePix}
              disabled={loading || (recipientType === 'gift' && !recipientNickname.trim())}
              className="w-full py-3.5 bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-black font-heading text-xs tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(0,230,118,0.35)] hover:shadow-[0_0_24px_rgba(0,230,118,0.6)] hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span>PROCESSANDO PEDIDO...</span>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  <span>PAGAR COM LIVEPIX</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* STEP 2: ORDER CREATED & AWAITING PAYMENT VIA LIVEPIX */}
        {activeOrder && activeOrder.status === 'Pendente' && (
          <div className="space-y-6">
            <div>
              <span className="text-[10px] font-mono uppercase text-amber-400 font-bold">
                Aguardando Pagamento no LivePix • #{activeOrder.id}
              </span>
              <h2 className="text-xl font-black font-heading text-white mt-1">
                {activeOrder.productName}
              </h2>
              <div className="text-2xl font-black text-[#00e676] mt-1">
                R$ {activeOrder.amount.toFixed(2).replace('.', ',')}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Beneficiário: <strong className="text-white font-mono">{activeOrder.recipientNickname}</strong>
              </p>
            </div>

            <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-[#00e676] shrink-0" />
                <span>Pedido registrado no sistema do servidor.</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                A página de pagamento do <strong>LivePix</strong> foi aberta em uma nova aba do seu navegador para você concluir o pagamento de <strong>R$ {activeOrder.amount.toFixed(2).replace('.', ',')}</strong>.
              </p>
              
              {targetLivePixUrl && (
                <button
                  type="button"
                  onClick={() => window.open(targetLivePixUrl, '_blank')}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#00e676]/15 hover:bg-[#00e676]/25 border border-[#00e676]/40 text-[#00e676] text-xs font-black font-heading tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>ABRIR PÁGINA DO LIVEPIX NOVAMENTE</span>
                </button>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-white font-bold font-heading text-xs tracking-wider transition-all cursor-pointer"
              >
                ENTENDI, FECHAR
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PAID & DELIVERED */}
        {activeOrder && (activeOrder.status === 'Pago' || activeOrder.status === 'Entregue') && (
          <div className="space-y-6 text-center py-4">
            <span className="text-[10px] font-mono uppercase text-[#00e676] font-bold">
              Pagamento Confirmado
            </span>
            <h2 className="text-2xl font-black font-heading text-white">
              Vantagens Entregues
            </h2>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
              O pedido <strong className="text-white font-mono">#{activeOrder.id}</strong> foi ativado com sucesso para o jogador{' '}
              <strong className="text-[#00e676] font-mono">{activeOrder.recipientNickname}</strong>.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-black font-heading text-xs tracking-wider transition-colors cursor-pointer shadow-[0_0_16px_rgba(0,230,118,0.3)]"
            >
              CONCLUIR
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
