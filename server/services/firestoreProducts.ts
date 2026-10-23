import type { Product } from "../../src/types/index.ts";
import { defaultStoreCategories, validateCategories } from "../../src/lib/storeCategories.ts";
import { paymentDatabase } from "../payments/database.ts";
import { ProductCatalogError, type ProductRepository } from "./productCatalog.ts";

// The admin API uses the server's authenticated Firebase Admin connection.
// Browser Firebase credentials must never authorize catalogue writes.
export const firestoreProducts: ProductRepository = {
  async get(id) {
    const snapshot = await paymentDatabase().collection("products").doc(id).get();
    return snapshot.exists
      ? ({ ...snapshot.data(), id: snapshot.id } as Product)
      : null;
  },
  async categories() {
    const snapshot = await paymentDatabase().collection("settings").doc("storeCategories").get();
    if (!snapshot.exists) return defaultStoreCategories;
    const categories = snapshot.data()?.categories;
    validateCategories(categories);
    return categories;
  },
  async create(product) {
    const db = paymentDatabase();
    const ref = db.collection("products").doc(product.id);
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists)
        throw new ProductCatalogError("Este produto já existe. Atualize a lista.", 409);
      tx.create(ref, product);
    });
  },
  async update(product) {
    const db = paymentDatabase();
    const ref = db.collection("products").doc(product.id);
    await db.runTransaction(async (tx) => {
      if (!(await tx.get(ref)).exists)
        throw new ProductCatalogError("O produto foi excluído. Atualize a lista.", 404);
      tx.set(ref, product, { merge: true });
    });
  },
  async remove(id) {
    const db = paymentDatabase();
    const ref = db.collection("products").doc(id);
    await db.runTransaction(async (tx) => {
      await tx.get(ref);
      tx.delete(ref);
    });
  },
};
