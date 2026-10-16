import React from "react";
import { Crown, ArrowUpRight } from "lucide-react";
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
      className={`product-card ${vip && item.isPopular ? "featured" : ""}`}
    >
      <div className="product-art">
        {/^(https?:\/\/|data:image\/|\/|.*\.(png|jpe?g|webp|gif|svg)$)/i.test(
          item.image,
        ) ? (
          <img src={item.image} alt={item.name} loading="lazy" />
        ) : (
          <Crown size={64} />
        )}
        <span className="product-tag">
          {vip ? item.duration : item.category}
        </span>
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
          <p>{item.description}</p>
          <ul>
            {(vip ? item.benefits : item.highlights).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </details>
        <button className="nc-button" onClick={onBuy}>
          Escolher {vip ? "VIP" : "produto"}
          <ArrowUpRight size={17} />
        </button>
      </div>
    </article>
  );
}
