import { ProductCatalogError } from "./productCatalog.ts";

// Keep existing category identifiers intact on unrelated VIP edits.
// New or changed identifiers must match the public store category ID format.
export function validateVipCategoryId(value: unknown, existing?: string): string {
  if (value === undefined) return existing ?? "vips";
  if (typeof value === "string" && /^[a-z0-9_-]{1,64}$/.test(value))
    return value;
  if (typeof existing === "string" && value === existing)
    return existing;
  throw new ProductCatalogError(
    "Selecione uma categoria válida para o VIP.",
    400,
  );
}
