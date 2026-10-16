import React from "react";
import { ArrowUpRight } from "lucide-react";
import { VIP, Product } from "../types/index.ts";
export function ProductCard({
  item,
  onBuy,
}: {
  item: VIP | Product;
  onBuy: () => void;
}) {
  const vip = "duration" in item;
  return (
    <article
      aria-label={item.name}
      className={`product-card ${vip && item.isPopular ? "featured" : ""}`}
    >
      <div className="product-art">
        {/^(https?:\/\/|data:image\/|\/|.*\.(png|jpe?g|webp|gif|svg)$)/i.test(
          item.image,
        ) ? (
          <img src={item.image} alt={item.name} loading="lazy" />
        ) : (
          <img
            src={vip ? "/categories/vips.webp" : "/categories/items.webp"}
            alt={item.name}
            loading="lazy"
          />
        )}
        {vip && item.isPopular && <span className="popular-tag">DESTAQUE</span>}
      </div>
      <div className="product-body">
        <h3>{item.name}</h3>
        <p className="product-price">
          {new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(item.price)}
        </p>
        <details>
          <summary>Benefícios e detalhes</summary>
          {vip && <p className="plan-duration">Duração: {item.duration}</p>}
          <p>{item.description}</p>
          <ul>
            {(vip ? item.benefits : item.highlights).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </details>
        <button className="nc-button" disabled={!item.active} onClick={onBuy}>
          Adicionar ao carrinho
          <ArrowUpRight size={17} />
        </button>
      </div>
    </article>
  );
}
