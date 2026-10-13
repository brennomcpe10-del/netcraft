import React, { useState } from 'react';
import { VIP, Product, Order, Coupon } from '../../types/index.ts';
import { usePlayer } from '../../context/PlayerContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { api } from '../../lib/api.ts';
import {
  saveOrderToFirestore,
  getVipByIdFromFirestore,
  getProductByIdFromFirestore,
  getCouponsFromFirestore,
  incrementCouponUsageInFirestore
} from '../../lib/firestoreSync.ts';
import { extractUrlFromText } from '../../lib/urlUtils.ts';
import { X, ExternalLink, Zap, AlertCircle, CheckCircle2, QrCode, Copy, Ticket, Tag, Percent } from 'lucide-react';

interface CheckoutModalProps {
  item: VIP | Product;
  itemType: 'vip' | 'product';
  livePixUrl?: string;
  pixUrl?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  item,
  itemType,
  livePixUrl,
  pixUrl,
  onClose
}) => {
  const { player, openLoginModal } = usePlayer();
  const { showSuccess, showError } = useToast();

  const [recipientType, setRecipientType] = useState<'self' | 'gift'>('self');
  const [recipientNickname, setRecipientNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  // Coupon state
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<number>(0);
  const [couponFeedback, setCouponFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Texto/Link cadastrado do LivePix específico do item ou fallback global
  const rawLivePixText = (item.livepixUrl && item.livepixUrl.trim().length > 0)
    ? item.livepixUrl.trim()
    : (livePixUrl && livePixUrl.trim().length > 0 ? livePixUrl.trim() : '');

  // Texto/Link cadastrado do PIX específico do item ou fallback global (pode conter frases com URL, URL direta ou chave)
  const rawPixText = (item.pixUrl && item.pixUrl.trim().length > 0)
    ? item.pixUrl.trim()
    : (pixUrl && pixUrl.trim().length > 0 ? pixUrl.trim() : '');

  // Extrai automaticamente a URL limpa de destino caso o texto contenha https:// ou http://
  const targetPixUrl = extractUrlFromText(rawPixText);
  const targetLivePixUrl = extractUrlFromText(rawLivePixText) || (rawLivePixText.startsWith('http') ? rawLivePixText : '');

  // Default to PIX if available, otherwise LIVEPIX
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'LIVEPIX'>(() => {
    if (rawPixText || targetPixUrl) return 'PIX';
    return 'LIVEPIX';
  });

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

  const rawPrice = Number(item.price) || 0;
  const finalPrice = appliedCoupon
    ? Math.max(0, Number((rawPrice - couponDiscount).toFixed(2)))
    : rawPrice;

  const handleApplyCoupon = async () => {
    const cleanCode = couponCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setCouponFeedback({ type: 'error', message: 'Digite o código do cupom.' });
      return;
    }

    setIsValidatingCoupon(true);
    setCouponFeedback(null);

    try {
      // 1. Try server endpoint
      const res = await api.validateCoupon(cleanCode, rawPrice);
      if (res.valid && res.coupon) {
        setAppliedCoupon(res.coupon as any);
        setCouponDiscount(res.discountAmount);
        setCouponFeedback({
          type: 'success',
          message: res.message || `Cupom ${res.coupon.code} aplicado com sucesso!`
        });
        showSuccess(`Cupom "${res.coupon.code}" aplicado!`);
        return;
      }

      // 2. Direct Firestore fallback check
      const firestoreCoupons = await getCouponsFromFirestore();
      const found = firestoreCoupons.find(c => c.code.trim().toUpperCase() === cleanCode);

      if (!found) {
        setCouponFeedback({ type: 'error', message: `Cupom "${cleanCode}" não foi encontrado.` });
        return;
      }
      if (!found.active) {
        setCouponFeedback({ type: 'error', message: 'Este cupom está desativado no momento.' });
        return;
      }
      if (found.expiresAt && new Date(found.expiresAt).getTime() < Date.now()) {
        setCouponFeedback({ type: 'error', message: 'Este cupom expirou.' });
        return;
      }
      if (found.maxUses && Number(found.usedCount || 0) >= Number(found.maxUses)) {
        setCouponFeedback({ type: 'error', message: 'O limite de utilizações deste cupom foi atingido.' });
        return;
      }
      if (found.minOrderValue && rawPrice < Number(found.minOrderValue)) {
        setCouponFeedback({
          type: 'error',
          message: `Valor mínimo para este cupom é R$ ${Number(found.minOrderValue).toFixed(2).replace('.', ',')}.`
        });
        return;
      }

      let discount = 0;
      if (found.discountType === 'percentage') {
        discount = Number(((rawPrice * found.discountValue) / 100).toFixed(2));
      } else {
        discount = Math.min(rawPrice, Number(found.discountValue));
      }

      setAppliedCoupon(found);
      setCouponDiscount(discount);
      setCouponFeedback({
        type: 'success',
        message: `Cupom ${found.code} aplicado! Desconto de ${
          found.discountType === 'percentage'
            ? `${found.discountValue}% (-R$ ${discount.toFixed(2).replace('.', ',')})`
            : `R$ ${discount.toFixed(2).replace('.', ',')}`
        }`
      });
      showSuccess(`Cupom "${found.code}" aplicado!`);
    } catch (err: unknown) {
      setCouponFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao validar cupom.'
      });
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponCodeInput('');
    setCouponFeedback(null);
  };

  const handleProceedPayment = async () => {
    const finalRecipient = recipientType === 'self' ? player.nickname : recipientNickname.trim();
    if (!finalRecipient) {
      showError('Informe o nickname do jogador beneficiário.');
      return;
    }

    try {
      setLoading(true);

      // Verify and fetch freshest item data directly from Firestore
      let freshItem: VIP | Product | null = null;
      try {
        freshItem = itemType === 'vip'
          ? await getVipByIdFromFirestore(item.id)
          : await getProductByIdFromFirestore(item.id);
      } catch (err) {
        console.warn('Firestore direct verify notice:', err);
      }

      if (freshItem && freshItem.active === false) {
        showError(`O ${itemType === 'vip' ? 'VIP' : 'produto'} "${freshItem.name}" está temporariamente desativado para novas compras.`);
        return;
      }

      let order: Order;
      try {
        order = await api.createOrder({
          buyerNickname: player.nickname,
          recipientNickname: finalRecipient,
          productId: item.id,
          productType: itemType,
          paymentMethod: paymentMethod === 'PIX' ? 'PIX' : 'LIVEPIX',
          couponCode: appliedCoupon?.code
        } as any);
      } catch (apiErr: unknown) {
        console.warn('API createOrder notice, utilizando criação direta no Firestore:', apiErr);
        const activeItem = freshItem || item;
        const itemName = String(activeItem.name || 'Item').trim();
        const productName = itemType === 'vip'
          ? (itemName.toLowerCase().startsWith('vip') ? itemName : `VIP ${itemName}`)
          : itemName;
        const baseAmount = Number(activeItem.price) || 0;
        const finalCalculated = appliedCoupon
          ? Math.max(0, Number((baseAmount - couponDiscount).toFixed(2)))
          : baseAmount;
        const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
        const txId = `TX-${paymentMethod}-${Date.now().toString().slice(-6)}`;
        const pixCode = `00020126580014BR.GOV.BCB.PIX0136netcraftbr-pagamentos-pix@srvmc.com520400005303986540${finalCalculated.toFixed(2)}5802BR5910NETCRAFTBR6009SAO PAULO62070503***6304${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        order = {
          id: orderId,
          buyerNickname: player.nickname.trim(),
          recipientNickname: finalRecipient.trim(),
          productId: String(activeItem.id || item.id),
          productName,
          productType: itemType,
          amount: finalCalculated,
          originalAmount: baseAmount,
          couponCode: appliedCoupon ? appliedCoupon.code : undefined,
          discountAmount: couponDiscount > 0 ? couponDiscount : undefined,
          createdAt: new Date().toISOString(),
          status: 'Pendente',
          transactionId: txId,
          paymentMethod: paymentMethod === 'PIX' ? 'PIX' : 'LIVEPIX',
          pixCode,
          pixQrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixCode)}`
        };
      }

      if (appliedCoupon) {
        incrementCouponUsageInFirestore(appliedCoupon.code).catch(() => {});
      }

      setActiveOrder(order);
      await saveOrderToFirestore(order).catch(() => {});

      // Determine the most accurate payment links (from backend order response, fresh item, or prop fallback)
      const effectivePixUrl = (order as any).pixUrl || (freshItem && freshItem.pixUrl) || rawPixText;
      const effectiveLivePixUrl = (order as any).livepixUrl || (freshItem && freshItem.livepixUrl) || rawLivePixText;
      const cleanTargetPix = extractUrlFromText(effectivePixUrl);
      const cleanTargetLivePix = extractUrlFromText(effectiveLivePixUrl) || (effectiveLivePixUrl.startsWith('http') ? effectiveLivePixUrl : '');

      if (paymentMethod === 'PIX') {
        if (cleanTargetPix) {
          window.open(cleanTargetPix, '_blank');
          showSuccess(
            `Pedido #${order.id} gerado! Redirecionando para a cobrança PIX...`
          );
        } else if (effectivePixUrl && effectivePixUrl.trim().length > 0) {
          navigator.clipboard.writeText(effectivePixUrl.trim());
          showSuccess(`Pedido #${order.id} gerado! Chave PIX copiada para a área de transferência.`);
        } else {
          showError('Link ou chave de cobrança PIX não está configurado para este item. Solicite ao administrador.');
        }
      } else {
        if (cleanTargetLivePix) {
          window.open(cleanTargetLivePix, '_blank');
          showSuccess(
            `Pedido #${order.id} gerado! Redirecionando para o LivePix...`
          );
        } else if (effectiveLivePixUrl && effectiveLivePixUrl.trim().length > 0) {
          navigator.clipboard.writeText(effectiveLivePixUrl.trim());
          showSuccess(`Pedido #${order.id} gerado! Link do LivePix copiado.`);
        } else {
          showError('Link do LivePix não está configurado para este item. Solicite ao administrador.');
        }
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Falha ao processar pedido.');
    } finally {
      setLoading(false);
    }
  };

  const isCurrentUrlConfigured = paymentMethod === 'PIX'
    ? !!(targetPixUrl || rawPixText)
    : !!(targetLivePixUrl || rawLivePixText);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0c1017] border border-white/[0.1] rounded-2xl p-5 sm:p-8 my-4 sm:my-8 shadow-2xl z-10">
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
                <span>R$ {finalPrice.toFixed(2).replace('.', ',')}</span>
                {appliedCoupon && (
                  <span className="text-sm text-zinc-500 line-through font-mono font-normal">
                    R$ {rawPrice.toFixed(2).replace('.', ',')}
                  </span>
                )}
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

            {/* Payment Method - OPÇÕES: PIX & LIVEPIX */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wide">
                Escolha a Forma de Pagamento
              </label>

              <div className="grid grid-cols-1 gap-2.5">
                {/* OPÇÃO 1: PIX (Link de Cobrança) */}
                <div
                  onClick={() => setPaymentMethod('PIX')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    paymentMethod === 'PIX'
                      ? 'border-cyan-400/80 bg-cyan-500/[0.08] shadow-[0_0_16px_rgba(34,211,238,0.2)]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.2]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-heading font-black text-sm text-white tracking-wide flex items-center gap-2">
                        <span>PIX</span>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyan-400 text-zinc-950 font-bold uppercase tracking-wider">
                          Cobrança Direta
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Link de pagamento via Mercado Pago, Nubank ou chave PIX
                      </div>
                    </div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      paymentMethod === 'PIX'
                        ? 'bg-cyan-400 text-zinc-950 shadow-[0_0_8px_#22d3ee]'
                        : 'border border-white/20'
                    }`}
                  >
                    {paymentMethod === 'PIX' && '✓'}
                  </div>
                </div>

                {/* OPÇÃO 2: LIVEPIX */}
                <div
                  onClick={() => setPaymentMethod('LIVEPIX')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    paymentMethod === 'LIVEPIX'
                      ? 'border-[#00e676]/80 bg-[#00e676]/[0.08] shadow-[0_0_16px_rgba(0,230,118,0.2)]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.2]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#00e676]/20 border border-[#00e676]/40 flex items-center justify-center text-[#00e676]">
                      <Zap className="w-5 h-5 fill-[#00e676]" />
                    </div>
                    <div>
                      <div className="font-heading font-black text-sm text-white tracking-wide flex items-center gap-2">
                        <span>LIVEPIX</span>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#00e676] text-zinc-950 font-bold uppercase tracking-wider">
                          Instantâneo
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Pagamento rápido e prático com a plataforma LivePix
                      </div>
                    </div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      paymentMethod === 'LIVEPIX'
                        ? 'bg-[#00e676] text-zinc-950 shadow-[0_0_8px_#00e676]'
                        : 'border border-white/20'
                    }`}
                  >
                    {paymentMethod === 'LIVEPIX' && '✓'}
                  </div>
                </div>
              </div>
            </div>

            {/* Aviso caso o método selecionado não tenha link configurado */}
            {!isCurrentUrlConfigured && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="text-[11px]">
                  {paymentMethod === 'PIX'
                    ? 'O administrador ainda não cadastrou o link de cobrança PIX específico deste item no painel.'
                    : 'O administrador ainda não cadastrou o link do LivePix específico deste item no painel.'}
                </span>
              </div>
            )}

            {/* CUPOM DE DESCONTO */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wide flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Possui um Cupom de Desconto?</span>
                </span>
                {appliedCoupon && (
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    Cupom Aplicado
                  </span>
                )}
              </label>

              {!appliedCoupon ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCodeInput}
                    onChange={e => setCouponCodeInput(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyCoupon();
                      }
                    }}
                    placeholder="Ex: RESET10"
                    disabled={isValidatingCoupon}
                    className="flex-1 px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.12] focus:border-emerald-500 rounded-xl text-xs font-mono font-bold text-white uppercase tracking-wider outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={isValidatingCoupon || !couponCodeInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isValidatingCoupon ? 'Validando...' : 'Aplicar'}
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-mono font-bold text-xs text-white flex items-center gap-1.5">
                        <span>{appliedCoupon.code}</span>
                        <span className="text-emerald-400 font-sans text-[11px] font-semibold">
                          ({appliedCoupon.discountType === 'percentage'
                            ? `${appliedCoupon.discountValue}% OFF`
                            : `R$ ${appliedCoupon.discountValue.toFixed(2).replace('.', ',')} OFF`})
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        Desconto de R$ {couponDiscount.toFixed(2).replace('.', ',')}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-zinc-400 hover:text-rose-400 text-xs font-semibold px-2 py-1 rounded transition-colors cursor-pointer"
                    title="Remover Cupom"
                  >
                    Remover
                  </button>
                </div>
              )}

              {/* Feedback Message */}
              {couponFeedback && (
                <div
                  className={`text-[11px] flex items-center gap-1.5 pt-0.5 ${
                    couponFeedback.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {couponFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{couponFeedback.message}</span>
                </div>
              )}
            </div>

            {/* RESUMO DO PEDIDO COM VALOR FINAL */}
            <div className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-2 text-xs">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Subtotal</span>
                <span className="font-mono">R$ {rawPrice.toFixed(2).replace('.', ',')}</span>
              </div>
              {appliedCoupon && couponDiscount > 0 && (
                <div className="flex items-center justify-between text-emerald-400 font-semibold">
                  <span className="flex items-center gap-1">
                    <Ticket className="w-3 h-3" />
                    <span>Desconto ({appliedCoupon.code})</span>
                  </span>
                  <span className="font-mono">- R$ {couponDiscount.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div className="border-t border-white/[0.08] pt-2 flex items-center justify-between">
                <span className="font-bold text-white text-xs uppercase tracking-wide">Total a Pagar</span>
                <span className="text-xl font-black font-mono text-[#00e676]">
                  R$ {finalPrice.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>

            {/* BOTÃO DE CONFIRMAR E PAGAR */}
            <button
              type="button"
              onClick={handleProceedPayment}
              disabled={loading || (recipientType === 'gift' && !recipientNickname.trim())}
              className={`w-full py-3.5 font-black font-heading text-xs tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                paymentMethod === 'PIX'
                  ? 'bg-cyan-400 hover:bg-cyan-300 text-zinc-950 shadow-[0_0_16px_rgba(34,211,238,0.35)] hover:shadow-[0_0_24px_rgba(34,211,238,0.6)]'
                  : 'bg-[#00e676] hover:bg-[#00c853] text-zinc-950 shadow-[0_0_16px_rgba(0,230,118,0.35)] hover:shadow-[0_0_24px_rgba(0,230,118,0.6)]'
              }`}
            >
              {loading ? (
                <span>PROCESSANDO PEDIDO...</span>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  <span>
                    {paymentMethod === 'PIX' ? 'PAGAR COM PIX (COBRANÇA)' : 'PAGAR COM LIVEPIX'}
                  </span>
                </>
              )}
            </button>
          </div>
        )}

        {/* STEP 2: ORDER CREATED & AWAITING PAYMENT */}
        {activeOrder && activeOrder.status === 'Pendente' && (
          <div className="space-y-6">
            <div>
              <span className="text-[10px] font-mono uppercase text-amber-400 font-bold">
                Aguardando Pagamento • #{activeOrder.id} ({activeOrder.paymentMethod})
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
                <span>Pedido registrado com sucesso no sistema.</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {activeOrder.paymentMethod === 'PIX' ? (
                  <>
                    A página de cobrança do <strong>PIX</strong> foi aberta para você concluir o pagamento de{' '}
                    <strong>R$ {activeOrder.amount.toFixed(2).replace('.', ',')}</strong>.
                  </>
                ) : (
                  <>
                    A página de pagamento do <strong>LivePix</strong> foi aberta em uma nova aba para você concluir o pagamento de{' '}
                    <strong>R$ {activeOrder.amount.toFixed(2).replace('.', ',')}</strong>.
                  </>
                )}
              </p>

              {/* Botão de abrir link novamente */}
              {activeOrder.paymentMethod === 'PIX' && (targetPixUrl || rawPixText) && (
                <div className="space-y-2 pt-1">
                  {targetPixUrl ? (
                    <button
                      type="button"
                      onClick={() => window.open(targetPixUrl, '_blank')}
                      className="w-full py-2.5 px-4 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-400 text-xs font-black font-heading tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>ABRIR LINK DE COBRANÇA PIX</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(targetPixUrl || rawPixText);
                      showSuccess('Link ou chave PIX copiado!');
                    }}
                    className="w-full py-2.5 px-4 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-cyan-400" />
                    <span>COPIAR LINK OU CHAVE PIX</span>
                  </button>
                </div>
              )}

              {activeOrder.paymentMethod === 'LIVEPIX' && (targetLivePixUrl || rawLivePixText) && (
                <button
                  type="button"
                  onClick={() => window.open(targetLivePixUrl || rawLivePixText, '_blank')}
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
