import { Product, ProductCategory, VIP } from "../types/index.ts";
export const catalogCategories: {
  id: "all" | ProductCategory;
  label: string;
}[] = [
  { id: "all", label: "Todos" },
  { id: "vips", label: "VIPs" },
  { id: "kits", label: "Kits" },
  { id: "itens", label: "Itens especiais" },
  { id: "cosmeticos", label: "Cosméticos" },
  { id: "pacotes", label: "Pacotes" },
  { id: "outros", label: "Outros" },
];
export function selectCatalog(
  products: Product[],
  vips: VIP[],
  category = "all",
  search = "",
) {
  const term = search
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return [
    ...vips.map((item) => ({ item, type: "vip" as const, category: "vips" })),
    ...products.map((item) => ({
      item,
      type: "product" as const,
      category: item.category,
    })),
  ]
    .filter(
      (entry) =>
        entry.item.active &&
        (category === "all" || entry.category === category),
    )
    .filter(({ item }) =>
      `${item.name} ${item.description}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(term),
    )
    .sort((a, b) => a.item.order - b.item.order);
}
