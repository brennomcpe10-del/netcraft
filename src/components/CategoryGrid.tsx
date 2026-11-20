import React from "react";
import { safeStoreImage, fallbackStoreImage } from "../lib/storeImage.ts";
import { ArrowRight } from "lucide-react";
import {
  StoreCategory,
  visibleCategories,
  storeCategoryTitle,
} from "../lib/storeCategories.ts";
import { Product, VIP } from "../types/index.ts";
export function CategoryGrid({
  categories,
  products,
  vips,
  onSelect,
}: {
  categories: StoreCategory[];
  products: Product[];
  vips: VIP[];
  onSelect: (id: string) => void;
}) {
  const visible = visibleCategories(categories, products, vips);
  return (
    <div className="shop-category-grid">
      {visible.map((c) => (
        <button
          className="shop-category-card"
          key={c.id}
          onClick={() => onSelect(c.id)}
        >
          <img src={safeStoreImage(c.image, "/categories/items.webp")} onError={(event) => fallbackStoreImage(event, "/categories/items.webp")} alt="" loading="lazy" />
          <span className="shop-category-copy">
            <strong>{storeCategoryTitle(c)}</strong>
            <span>{c.description}</span>
            <span className="category-cta">
              Ver produtos
              <ArrowRight size={17} />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
