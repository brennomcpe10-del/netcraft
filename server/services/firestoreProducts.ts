import type { Product } from "../../src/types/index.ts";
import { defaultStoreCategories, validateCategories } from "../../src/lib/storeCategories.ts";
import { paymentDatabase } from "../payments/database.ts";
import { ProductCatalogError, type ProductRepository } from "./productCatalog.ts";
import {
  catalogWriteReference,
  readCatalogItem,
  readStoreCategories,
} from "./previewCatalog.ts";
import { isPreviewEnvironment } from "./previewIsolation.ts";

// Production is unchanged. Preview edits are stored in previewProducts only.
// The public catalog, checkout quote and Pix all resolve the same overrides.
export const firestoreProducts: ProductRepository = {
  async get(id) {
    return await readCatalogItem("products",id) as Product|null;
  },
  async categories() {
    const categories=await readStoreCategories();
    if(categories === null)return defaultStoreCategories;
    validateCategories(categories);
    return categories;
  },
  async create(product) {
    const db=paymentDatabase(),ref=catalogWriteReference("products",product.id);
    await db.runTransaction(async tx=>{
      const existing=await readCatalogItem("products",product.id,tx);
      if(existing)throw new ProductCatalogError("Este produto já existe. Atualize a lista.",409);
      // A previously hidden item can be re-created without touching the base.
      tx.set(ref,product);
    });
  },
  async update(product) {
    const db=paymentDatabase(),ref=catalogWriteReference("products",product.id);
    await db.runTransaction(async tx=>{
      const existing=await readCatalogItem("products",product.id,tx);
      if(!existing)throw new ProductCatalogError("O produto foi excluído. Atualize a lista.",404);
      tx.set(ref,product);
    });
  },
  async remove(id) {
    const db=paymentDatabase(),ref=catalogWriteReference("products",id);
    await db.runTransaction(async tx=>{
      const existing=await readCatalogItem("products",id,tx);
      if(!existing)throw new ProductCatalogError("Produto não encontrado.",404);
      if(isPreviewEnvironment())tx.set(ref,{__previewDeleted:true,id});
      else tx.delete(ref);
    });
  },
};
