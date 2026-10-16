import { Product } from "../../src/types/index.ts";
import { StoreCategory } from "../../src/lib/storeCategories.ts";
import {
  normalizeProduct,
  validateProductId,
} from "../../src/lib/productAdmin.ts";
export class ProductCatalogError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export interface ProductRepository {
  get(id: string): Promise<Product | null>;
  categories(): Promise<StoreCategory[]>;
  create(product: Product): Promise<void>;
  update(product: Product): Promise<void>;
  remove(id: string): Promise<void>;
}
export function productCatalog(repository: ProductRepository) {
  return {
    async save(input: Partial<Product>, id?: string) {
      let existing: Product | undefined;
      try {
        validateProductId(id || input?.id);
      } catch (error) {
        throw new ProductCatalogError((error as Error).message, 400);
      }
      if (id) {
        existing = (await repository.get(id)) || undefined;
        if (!existing)
          throw new ProductCatalogError("Produto não encontrado.", 404);
        if (input.id && input.id !== id)
          throw new ProductCatalogError(
            "Não é possível trocar o identificador.",
            400,
          );
      }
      const categories = await repository.categories();
      let product: Product;
      try {
        product = normalizeProduct(
          { ...input, id: id || input.id },
          categories,
          existing,
        );
      } catch (error) {
        throw new ProductCatalogError((error as Error).message, 400);
      }
      if (existing) await repository.update(product);
      else await repository.create(product);
      return product;
    },
    async remove(id: string) {
      try {
        validateProductId(id);
      } catch (error) {
        throw new ProductCatalogError((error as Error).message, 400);
      }
      await repository.remove(id);
      return { success: true };
    },
  };
}
