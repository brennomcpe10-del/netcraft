import { Product } from "../types/index.ts";
import { StoreCategory } from "./storeCategories.ts";
import { validateRewardDraft } from "./rewardDraft.ts";
export function validateProductId(id: unknown): asserts id is string {
  if (
    typeof id !== "string" ||
    !/^[A-Za-z0-9_-]{2,128}$/.test(id)
  )
    throw new Error("Identificador de produto inválido.");
}
export function normalizeProduct(
  input: Partial<Product>,
  categories: StoreCategory[],
  existing?: Product,
): Product {
  if (!input || typeof input !== "object") throw new Error("Produto inválido.");
  const allowed = new Set([
    "id",
    "name",
    "category",
    "price",
    "description",
    "image",
    "active",
    "highlights",
    "order",
    "livepixUrl",
    "pixUrl",
    "rewardDraft",
    "featured",
    "allowQuantity",
    "maxQuantity",
  ]);
  const data = {
    ...existing,
    ...Object.fromEntries(
      Object.entries(input).filter(([key]) => allowed.has(key)),
    ),
  } as Partial<Product>;
  validateProductId(data.id);
  for (const field of ["active", "featured", "allowQuantity"] as const) {
    if (data[field] !== undefined && typeof data[field] !== "boolean")
      throw new Error(
        "Disponibilidade e opções devem ser verdadeiras ou falsas.",
      );
  }
  if (typeof data.name !== "string") throw new Error("Informe um nome válido.");
  const name = data.name.trim();
  if (!name || name.length > 120)
    throw new Error("Informe um nome de até 120 caracteres.");
  if (
    typeof data.category !== "string" ||
    (!categories.some((c) => c.id === data.category) &&
      data.category !== existing?.category)
  )
    throw new Error("Selecione uma categoria cadastrada.");
  if (
    typeof data.price !== "number" ||
    !Number.isFinite(data.price) ||
    data.price < 0 ||
    data.price > 1000000 ||
    Math.abs(data.price * 100 - Math.round(data.price * 100)) > 0.000001
  )
    throw new Error("Informe um preço válido, com até duas casas decimais.");
  if (data.active && data.price === 0)
    throw new Error("Defina um preço maior que zero antes de ativar.");
  const order = data.order ?? 1;
  if (!Number.isSafeInteger(order) || order < 0 || order > 1000000)
    throw new Error("Informe uma ordem inteira entre 0 e 1000000.");
  const description = data.description ?? "";
  if (typeof description !== "string" || description.length > 10000)
    throw new Error("A descrição pode ter até 10000 caracteres.");
  const image = data.image ?? "/categories/items.webp";
  if (
    typeof image !== "string" ||
    image.length > 850000 ||
    (!/^(https:\/\/|\/(?!\/)|data:image\/(png|jpeg|webp|gif);base64,)/.test(
      image,
    ) &&
      !["cube", "crown"].includes(image) &&
      image !== existing?.image)
  )
    throw new Error(
      "Use uma imagem HTTPS, um caminho local ou envie uma imagem.",
    );
  const highlights = data.highlights ?? [];
  if (
    !Array.isArray(highlights) ||
    highlights.length > 100 ||
    highlights.some((h) => typeof h !== "string" || h.length > 500)
  )
    throw new Error(
      "Use até 100 linhas de conteúdo, com até 500 caracteres cada.",
    );
  const max = data.maxQuantity ?? 64;
  if (!Number.isInteger(max) || max < 1 || max > 64)
    throw new Error("O limite de unidades deve ser entre 1 e 64.");
  for (const field of ["livepixUrl", "pixUrl"] as const) {
    const value = data[field];
    if (value !== undefined && (typeof value !== "string" || value.length > 2048))
      throw new Error("O link ou a chave de pagamento deve ter até 2048 caracteres.");
  }
  if (data.livepixUrl?.trim() && !/^https?:\/\//i.test(data.livepixUrl.trim()))
    throw new Error("O link LivePix deve começar com http:// ou https://.");
  validateRewardDraft(data.rewardDraft);
  const result: Product = {
    ...data,
    id: data.id,
    name,
    category: data.category,
    price: data.price,
    description,
    image,
    highlights: highlights.map((h) => h.trim()).filter(Boolean),
    order,
    active: data.active === true,
    featured: data.featured === true,
    allowQuantity: data.allowQuantity !== false,
    maxQuantity: data.allowQuantity === false ? 1 : max,
    livepixUrl:
      typeof data.livepixUrl === "string" ? data.livepixUrl.trim() : "",
    pixUrl: typeof data.pixUrl === "string" ? data.pixUrl.trim() : "",
  };
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined),
  ) as unknown as Product;
}
export function draftProduct(category: string, products: Product[]): Product {
  return {
    id: `prod-${crypto.randomUUID()}`,
    name: "",
    category,
    price: 0,
    description: "",
    image: "/categories/items.webp",
    active: false,
    highlights: [],
    order:
      Math.max(
        0,
        ...products
          .filter((p) => p.category === category)
          .map((p) => p.order || 0),
      ) + 1,
    allowQuantity: true,
    maxQuantity: 64,
    rewardDraft: { version: 1, items: [] },
  };
}
export function adminProductList(
  products: Product[],
  category: string,
  search: string,
) {
  const term = search
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return products
    .filter(
      (p) =>
        (category === "all" || p.category === category) &&
        `${p.name} ${p.description}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(term),
    )
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
}
