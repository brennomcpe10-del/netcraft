import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import crypto from "node:crypto";

test(
  "isolated Firestore: authenticated category/product CRUD, realtime publication, exact deletion and historical orders",
  { skip: process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085" },
  async () => {
    // This suite refuses to run against the real Firebase project.
    process.env.NODE_ENV = "test";
    process.env.ADMIN_KEYWORD = crypto.randomBytes(24).toString("hex");
    const { db } = await import("../src/lib/firebase.ts");
    assert.equal(db.app.options.projectId, "demo-netcraft-admin-test");
    const { doc, setDoc, getDoc, onSnapshot, terminate } = await import(
      "firebase/firestore"
    );
    const { defaultStoreCategories } = await import(
      "../src/lib/storeCategories.ts"
    );
    const { default: app } = await import("../api/index.ts");
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
    const call = (
      path: string,
      method: string,
      body?: unknown,
      token?: string,
    ) =>
      fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    let unsubscribe = () => {};
    try {
      let response = await call("/admin/login", "POST", {
        password: process.env.ADMIN_KEYWORD,
      });
      assert.equal(response.status, 200);
      const { token } = await response.json();
      await setDoc(doc(db, "settings", "storeCategories"), {
        categories: defaultStoreCategories,
        legacyMetadata: "preserve",
      });
      const custom = {
        id: "test-only",
        title: "Categoria apenas de teste",
        description: "Ambiente isolado",
        image: "/categories/items.webp",
        order: 15,
        active: true,
      };
      response = await call(
        "/admin/store-categories",
        "PUT",
        { categories: [...defaultStoreCategories, custom] },
        token,
      );
      assert.equal(response.status, 200, await response.text());
      assert.equal(
        (await getDoc(doc(db, "settings", "storeCategories"))).data()
          ?.legacyMetadata,
        "preserve",
      );
      const product = {
        id: "test-farm",
        name: "Farm de Creeper — teste isolado",
        category: "test-only",
        price: 12.35,
        description: "Nunca publicada na loja real",
        image: "/categories/items.webp",
        active: false,
        order: 3,
        highlights: ["2 itens de teste"],
        allowQuantity: true,
        maxQuantity: 3,
      };
      await setDoc(doc(db, "orders", "historical-test"), {
        productId: product.id,
        productName: product.name,
        total: 12.35,
        status: "Pago",
      });
      const historical = (
        await getDoc(doc(db, "orders", "historical-test"))
      ).data();
      await setDoc(doc(db, "products", "similar-name"), {
        ...product,
        id: "similar-name",
      });
      assert.equal(
        (await call("/admin/products", "POST", product)).status,
        401,
      );
      response = await call("/admin/products", "POST", product, token);
      assert.equal(response.status, 201, await response.text());
      assert.equal(
        (await getDoc(doc(db, "products", product.id))).data()?.price,
        12.35,
      );
      const published = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Realtime update not received")),
          10000,
        );
        unsubscribe = onSnapshot(
          doc(db, "products", product.id),
          (snap) => {
            if (snap.data()?.active === true) {
              clearTimeout(timer);
              resolve();
            }
          },
          reject,
        );
      });
      response = await call(
        `/admin/products/${product.id}`,
        "PUT",
        { ...product, active: true, price: 15.9, order: 1 },
        token,
      );
      assert.equal(response.status, 200, await response.text());
      await published;
      unsubscribe();
      response = await call("/cart/quote", "POST", {
        lines: [{ productId: product.id, productType: "product", quantity: 3 }],
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).totalCents, 4770);
      response = await call(
        "/admin/store-categories",
        "PUT",
        { categories: defaultStoreCategories },
        token,
      );
      assert.equal(response.status, 200);
      assert.equal(
        (await getDoc(doc(db, "products", product.id))).exists(),
        true,
      );
      response = await call(
        `/admin/products/${product.id}`,
        "DELETE",
        undefined,
        token,
      );
      assert.equal(response.status, 200, await response.text());
      assert.equal(
        (await getDoc(doc(db, "products", product.id))).exists(),
        false,
      );
      assert.equal(
        (await getDoc(doc(db, "products", "similar-name"))).exists(),
        true,
      );
      assert.deepEqual(
        (await getDoc(doc(db, "orders", "historical-test"))).data(),
        historical,
      );
    } finally {
      unsubscribe();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await terminate(db);
    }
  },
);
