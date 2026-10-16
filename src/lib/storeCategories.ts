import { Product, VIP } from "../types/index.ts";
export interface StoreCategory {
  id: string;
  title: string;
  description: string;
  image: string;
  order: number;
  active: boolean;
  showWhenEmpty?: boolean;
}
export const defaultStoreCategories: StoreCategory[] = [
  {
    id: "vips",
    title: "PLANOS VIPS",
    description: "Escolha os benefícios para sua jornada.",
    image: "/categories/vips.webp",
    order: 1,
    active: true,
  },
  {
    id: "kits",
    title: "KITS PVP",
    description: "Prepare seu equipamento para a batalha.",
    image: "/categories/items.webp",
    order: 2,
    active: true,
  },
  {
    id: "temporarios",
    title: "KITS TEMPORÁRIOS",
    description: "Confira os kits disponíveis por tempo limitado.",
    image: "/categories/items.webp",
    order: 2.5,
    active: true,
  },
  {
    id: "farms",
    title: "KITS FARM",
    description: "Recursos para fazer sua base crescer.",
    image: "/harbor_explore.jpg",
    order: 3,
    active: true,
  },
  {
    id: "especiais",
    title: "KITS ESPECIAIS",
    description: "Encontre o kit da sua próxima aventura.",
    image: "/categories/items.webp",
    order: 4,
    active: true,
  },
  {
    id: "itens",
    title: "ITENS PERSONALIZADOS",
    description: "Explore os itens disponíveis na loja.",
    image: "/categories/items.webp",
    order: 5,
    active: true,
  },
  {
    id: "cosmeticos",
    title: "COSMÉTICOS",
    description: "Dê mais personalidade ao seu mundo.",
    image: "/hero_sunset.jpg",
    order: 6,
    active: true,
  },
  {
    id: "pacotes",
    title: "PACOTES",
    description: "Combinações para sua jornada.",
    image: "/categories/items.webp",
    order: 7,
    active: true,
  },
  {
    id: "outros",
    title: "ITENS AVULSOS",
    description: "Produtos individuais cadastrados na loja.",
    image: "/hero_landscape.webp",
    order: 8,
    active: true,
    showWhenEmpty: false,
  },
];
export const itemCategory = (item: VIP | Product, type: "vip" | "product") =>
  type === "vip"
    ? (item as VIP).categoryId || "vips"
    : (item as Product).category;
export function visibleCategories(
  categories: StoreCategory[],
  products: Product[],
  vips: VIP[],
) {
  const populated = new Set([
    ...products.filter((p) => p.active).map((p) => p.category),
    ...vips.filter((v) => v.active).map((v) => v.categoryId || "vips"),
  ]);
  return categories
    .filter(
      (c) => c.active && (c.showWhenEmpty !== false || populated.has(c.id)),
    )
    .sort((a, b) => a.order - b.order);
}
export function validateCategories(
  value: unknown,
): asserts value is StoreCategory[] {
  if (!Array.isArray(value) || value.length > 50)
    throw new Error("Use até 50 categorias.");
  const ids = new Set();
  for (const c of value) {
    if (
      !c ||
      typeof c.id !== "string" ||
      !/^[a-z0-9_-]{1,64}$/.test(c.id) ||
      ids.has(c.id)
    )
      throw new Error("Identificador de categoria inválido ou repetido.");
    ids.add(c.id);
    if (
      typeof c.title !== "string" ||
      !c.title.trim() ||
      c.title.length > 80 ||
      typeof c.description !== "string" ||
      c.description.length > 500 ||
      typeof c.image !== "string" ||
      c.image.length > 2000 ||
      !Number.isFinite(c.order) ||
      typeof c.active !== "boolean"
    )
      throw new Error("Dados da categoria inválidos.");
    if (c.showWhenEmpty !== undefined && typeof c.showWhenEmpty !== "boolean")
      throw new Error("Visibilidade da categoria inválida.");
    if (!/^(https:\/\/|\/(?!\/))/.test(c.image))
      throw new Error("Use imagem HTTPS ou caminho local.");
  }
}

export function storeCategoryTitle(category: StoreCategory) {
  return category.id === "outros" &&
    /^outros( produtos)?$/i.test(category.title.trim())
    ? "ITENS AVULSOS"
    : category.title;
}
