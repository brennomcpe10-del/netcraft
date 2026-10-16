import React, { useEffect, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Product, VIP } from "../types/index.ts";
import {
  StoreCategory,
  defaultStoreCategories,
  storeCategoryTitle,
} from "../lib/storeCategories.ts";
import { CategoryGrid } from "../components/CategoryGrid.tsx";
import { ProductCard } from "../components/ProductCard.tsx";
import { selectCatalog } from "../lib/catalog.ts";
interface StoreViewProps {
  products: Product[];
  vips: VIP[];
  loading: boolean;
  initialCategory?: string;
  categories?: StoreCategory[];
  onCategoryChange?: (id: string) => void;
  onBuyItem: (item: Product | VIP, type: "product" | "vip") => void;
}
export function StoreView({
  products,
  vips,
  loading,
  initialCategory = "all",
  categories = defaultStoreCategories,
  onCategoryChange,
  onBuyItem,
}: StoreViewProps) {
  const [selected, setSelected] = useState(initialCategory),
    [search, setSearch] = useState("");
  useEffect(() => {
    setSelected(initialCategory);
    setSearch("");
  }, [initialCategory]);
  const category = categories.find((c) => c.id === selected && c.active);
  const choose = (id: string) => {
    setSelected(id);
    setSearch("");
    onCategoryChange?.(id);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const items = category
    ? selectCatalog(products, vips, category.id, search)
    : [];
  return (
    <section className="nc-store nc-container nc-section">
      {!category ? (
        <>
          <span className="eyebrow">LOJA OFICIAL NETCRAFTBR</span>
          <h1 className="catalog-title">CATEGORIAS DA LOJA</h1>
          <p className="catalog-intro">
            Escolha uma categoria para conhecer seus produtos.
          </p>
          {loading ? (
            <p role="status">Carregando catálogo...</p>
          ) : (
            <CategoryGrid
              categories={categories}
              products={products}
              vips={vips}
              onSelect={choose}
            />
          )}
        </>
      ) : (
        <>
          <button className="back-categories" onClick={() => choose("all")}>
            <ArrowLeft size={18} />
            Voltar às categorias
          </button>
          <nav className="catalog-breadcrumb" aria-label="Localização">
            <button onClick={() => choose("all")}>Categorias da loja</button>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{storeCategoryTitle(category)}</span>
          </nav>
          <div className="category-page-heading">
            <img src={category.image} alt="" />
            <div>
              <span className="eyebrow">EXPLORE ESTA CATEGORIA</span>
              <h1 className="catalog-title">{storeCategoryTitle(category)}</h1>
              <p className="catalog-intro">{category.description}</p>
            </div>
          </div>
          <label className="category-search">
            <Search size={18} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nesta categoria..."
              aria-label="Buscar produtos nesta categoria"
            />
          </label>
          {loading ? (
            <p role="status">Carregando catálogo...</p>
          ) : items.length ? (
            <div className="catalog-grid">
              {items.map(({ item, type }) => (
                <ProductCard
                  key={`${type}-${item.id}`}
                  item={item}
                  onBuy={() => onBuyItem(item, type)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state" role="status">
              <p>
                {search
                  ? "Nenhum item encontrado nesta categoria."
                  : "Esta categoria ainda não tem produtos disponíveis."}
              </p>
              <button className="text-link" onClick={() => choose("all")}>
                <ArrowLeft size={16} />
                Explorar outras categorias
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
