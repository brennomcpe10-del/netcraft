import React, { useState } from "react";
import { Product, VIP } from "../types/index.ts";
import { ProductCard } from "../components/ProductCard.tsx";
import { catalogCategories, selectCatalog } from "../lib/catalog.ts";
import { Search } from "lucide-react";

interface StoreViewProps {
  products: Product[];
  vips: VIP[];
  loading: boolean;
  initialCategory?: string;
  onBuyItem: (item: Product | VIP, type: "product" | "vip") => void;
}

export const StoreView: React.FC<StoreViewProps> = ({
  products,
  vips,
  loading,
  onBuyItem,
  initialCategory = "all",
}) => {
  const [selectedCategory, setSelectedCategory] =
    useState<string>(initialCategory);
  const [search, setSearch] = useState("");

  const categories = catalogCategories;
  const filteredItems = selectCatalog(products, vips, selectedCategory, search);

  return (
    <div className="nc-store max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-16 space-y-8 sm:space-y-12">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-bold font-heading text-white tracking-tight">
          Loja do Servidor
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-2 sm:mt-3 leading-relaxed">
          Adquira pacotes, kits e itens para aprimorar sua experiência.
        </p>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 border-b border-white/[0.06] pb-4">
        {/* Categories */}
        <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 max-w-full w-full sm:w-auto sm:flex-1 pb-1 sm:pb-0 scrollbar-none flex-nowrap">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                aria-pressed={isSelected}
                onClick={() => setSelectedCategory(cat.id)}
                className={`text-xs px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                  isSelected
                    ? "bg-white text-zinc-950 font-semibold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-60 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar produtos"
            placeholder="Buscar item..."
            className="w-full px-3 py-1.5 pl-8 bg-white/[0.02] border border-white/[0.08] focus:border-white/30 rounded-lg text-xs text-white placeholder-zinc-500 outline-none transition-colors"
          />
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="text-center py-16 sm:py-20 text-sm text-zinc-400">
          Carregando catálogo...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 sm:py-16 border border-white/[0.06] rounded-2xl bg-white/[0.01]">
          <p className="text-sm text-zinc-400">Nenhum item encontrado.</p>
        </div>
      ) : (
        <div className="catalog-grid">
          {filteredItems.map(({ item, type }) => (
            <ProductCard
              key={`${type}-${item.id}`}
              item={item}
              onBuy={() => onBuyItem(item, type)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
