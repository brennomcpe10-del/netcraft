import React from "react";
import { VIP } from "../types/index.ts";
import { ProductCard } from "../components/ProductCard.tsx";
export function VipView({
  vips,
  loading,
  onBuyVip,
}: {
  vips: VIP[];
  loading: boolean;
  onBuyVip: (v: VIP) => void;
}) {
  return (
    <section className="nc-container nc-section">
      <span className="eyebrow">APOIE O SERVIDOR</span>
      <h1 className="catalog-title">Sua jornada. Mais possibilidades.</h1>
      <p className="catalog-intro">
        Escolha seu VIP e confira todos os benefícios antes de comprar.
      </p>
      {loading ? (
        <p role="status">Carregando planos…</p>
      ) : (
        <div className="catalog-grid">
          {vips
            .filter((v) => v.active)
            .sort((a, b) => a.order - b.order)
            .map((v) => (
              <ProductCard key={v.id} item={v} onBuy={() => onBuyVip(v)} />
            ))}
        </div>
      )}
      {!loading && !vips.some((v) => v.active) && (
        <p className="empty-state">Nenhum plano disponível no momento.</p>
      )}
      <p className="store-note">
        Informe sua gamertag exata no checkout. O pagamento será conferido antes
        da ativação. Acompanhe seu pedido no perfil ou fale com o suporte.
      </p>
    </section>
  );
}
