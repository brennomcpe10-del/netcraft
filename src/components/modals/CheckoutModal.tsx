import React from "react";
import { X } from "lucide-react";
import { useModalFocus } from "../../hooks/useModalFocus.ts";
import type { Product, VIP } from "../../types/index.ts";
import { PixCheckout } from "../PixCheckout.tsx";

/**
 * Compatibility entrypoint for old product cards.
 *
 * Never construct a local "paid" order, write directly to Firestore, or
 * redirect to an unverified manual payment link when the API fails.
 * All purchases go through the server-priced Orders Pix TEST checkout.
 */
interface CheckoutModalProps {
  item: VIP | Product;
  itemType: "vip" | "product";
  livePixUrl?: string;
  pixUrl?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  item,
  itemType,
  onClose,
}) => {
  const dialogRef = useModalFocus(onClose);
  const safeItem = item.active === true &&
    typeof item.id === "string" && item.id.length > 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button type="button" onClick={onClose} aria-label="Fechar checkout"
        className="fixed inset-0 bg-black/80 backdrop-blur-sm cursor-pointer" />
      <div ref={dialogRef} role="dialog" aria-modal="true"
        aria-label="Checkout Pix de teste"
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1017] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 pb-4">
          <div>
            <h2 className="font-bold text-lg">{item.name}</h2>
            <p className="text-sm text-zinc-400">
              Checkout seguro — somente ambiente de testes
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose}
            className="rounded-lg p-2 hover:bg-white/10">
            <X size={20} />
          </button>
        </div>
        {!safeItem ? (
          <p role="alert" className="text-amber-300">
            Produto indisponível. Nenhuma cobrança foi criada.
          </p>
        ) : (
          <PixCheckout
            lines={[{ productId: item.id, productType: itemType, quantity: 1 }]}
            disabled={false}
          />
        )}
      </div>
    </div>
  );
};
