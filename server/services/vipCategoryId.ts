import { ProductCatalogError } from "./productCatalog.ts";
import type { StoreCategory } from "../../src/lib/storeCategories.ts";

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

// Only registered categories may be assigned to new or moved VIPs.
// Keep unchanged historical associations so existing VIPs remain editable.
export function assertVipCategoryExists(
  categoryId: string,
  categories: readonly Pick<StoreCategory, "id">[],
  previousCategoryId?: string,
): void {
  if (previousCategoryId !== undefined && categoryId === previousCategoryId) return;
  if (!categories.some(category => category.id === categoryId))
    throw new ProductCatalogError("Selecione uma categoria cadastrada para o VIP.", 400);
}
