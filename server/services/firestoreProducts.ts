import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "../../src/lib/firebase.ts";
import { Product } from "../../src/types/index.ts";
import {
  defaultStoreCategories,
  validateCategories,
} from "../../src/lib/storeCategories.ts";
import { ProductCatalogError, ProductRepository } from "./productCatalog.ts";
export const firestoreProducts: ProductRepository = {
  async get(id) {
    const snapshot = await getDoc(doc(db, "products", id));
    return snapshot.exists()
      ? ({ ...snapshot.data(), id: snapshot.id } as Product)
      : null;
  },
  async categories() {
    const snapshot = await getDoc(doc(db, "settings", "storeCategories"));
    if (!snapshot.exists()) return defaultStoreCategories;
    const categories = snapshot.data().categories;
    validateCategories(categories);
    return categories;
  },
  async create(product) {
    const ref = doc(db, "products", product.id);
    await runTransaction(db, async (tx) => {
      if ((await tx.get(ref)).exists())
        throw new ProductCatalogError(
          "Este produto já existe. Atualize a lista.",
          409,
        );
      tx.set(ref, product);
    });
  },
  async update(product) {
    const ref = doc(db, "products", product.id);
    await runTransaction(db, async (tx) => {
      if (!(await tx.get(ref)).exists())
        throw new ProductCatalogError(
          "O produto foi excluído. Atualize a lista.",
          404,
        );
      tx.set(ref, product, { merge: true });
    });
  },
  async remove(id) {
    const ref = doc(db, "products", id);
    await runTransaction(db, async (tx) => {
      await tx.get(ref);
      tx.delete(ref);
    });
  },
};
