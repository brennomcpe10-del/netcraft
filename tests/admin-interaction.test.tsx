import React, { act, useState } from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { Product } from "../src/types/index.ts";
import { ProductManager } from "../src/components/ProductManager.tsx";
import { StoreView } from "../src/views/StoreView.tsx";
import { defaultStoreCategories } from "../src/lib/storeCategories.ts";
import {
  productCatalog,
  ProductRepository,
} from "../server/services/productCatalog.ts";
test("admin creates, activates, edits, reclassifies, orders and deletes a product; storefront follows saved data", async () => {
  const browser = new Window({ url: "http://localhost" }),
    globals = globalThis as any;
  const previous = {
    window: globals.window,
    document: globals.document,
    HTMLElement: globals.HTMLElement,
    localStorage: globals.localStorage,
    IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globals, {
    window: browser,
    document: browser.document,
    HTMLElement: browser.HTMLElement,
    localStorage: browser.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const data = new Map<string, Product>();
  const repository: ProductRepository = {
    get: async (id) => data.get(id) || null,
    categories: async () => defaultStoreCategories,
    create: async (p) => {
      data.set(p.id, structuredClone(p));
    },
    update: async (p) => {
      data.set(p.id, structuredClone(p));
    },
    remove: async (id) => {
      data.delete(id);
    },
  };
  const service = productCatalog(repository);
  let rejectSave = false;
  function Harness() {
    const [products, setProducts] = useState<Product[]>([]);
    return (
      <>
        <ProductManager
          products={products}
          categories={defaultStoreCategories}
          initialCategory="farms"
          onSave={async (value) => {
            if (rejectSave) throw new Error("Falha de teste: não salvo");
            const saved = await service.save(
              value,
              data.has(value.id) ? value.id : undefined,
            );
            setProducts([...data.values()]);
            return saved;
          }}
          onDelete={async (id) => {
            await service.remove(id);
            setProducts([...data.values()]);
          }}
        />
        <div className="public-fixture">
          <StoreView
            products={products}
            vips={[]}
            initialCategory="farms"
            loading={false}
            onBuyItem={() => {}}
          />
        </div>
      </>
    );
  }
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const click = async (text: string) => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === text,
    );
    assert.ok(button, `Button ${text}`);
    await act(async () => {
      button.click();
    });
  };
  const field = async (labelText: string, value: string) => {
    const scope = container.querySelector(".product-editor") || container;
    const label = Array.from(scope.querySelectorAll("label")).find((l) =>
      l.textContent.trim().startsWith(labelText),
    );
    assert.ok(label, `Label ${labelText}`);
    const element = label.querySelector("input,textarea,select") as any;
    assert.ok(element);
    const prototype =
      element.tagName === "SELECT"
        ? browser.HTMLSelectElement.prototype
        : element.tagName === "TEXTAREA"
          ? browser.HTMLTextAreaElement.prototype
          : browser.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
        element,
        value,
      );
      element.dispatchEvent(
        new browser.Event(element.tagName === "SELECT" ? "change" : "input", {
          bubbles: true,
        }),
      );
    });
  };
  const submit = async () => {
    await act(async () => {
      container
        .querySelector(".product-editor form")!
        .dispatchEvent(
          new browser.Event("submit", { bubbles: true, cancelable: true }),
        );
    });
  };
  try {
    await act(async () => root.render(<Harness />));
    await click("Novo produto");
    await field("Nome do produto", "Farm de teste isolado");
    await field("Preço (R$)", "7.50");
    await field("Descrição", "Descrição da farm no teste");
    await field("Conteúdo do kit", "16 pedras de teste\n1 espada de teste");
    await submit();
    assert.equal(data.size, 1);
    let saved = [...data.values()][0];
    assert.equal(saved.category, "farms");
    assert.equal(saved.active, false);
    assert.deepEqual(saved.highlights, [
      "16 pedras de teste",
      "1 espada de teste",
    ]);
    assert.ok(
      !container
        .querySelector(".public-fixture")!
        .textContent.includes("Farm de teste isolado"),
    );
    await click("Ativar");
    assert.ok(
      container
        .querySelector(".public-fixture")!
        .textContent.includes("Farm de teste isolado"),
    );
    assert.ok(
      container.querySelector(".public-fixture")!.textContent.includes("7,50"),
    );
    await click("Editar");
    await field("Preço (R$)", "8.90");
    await field("Ordem na categoria", "0");
    await field("Categoria", "temporarios");
    await submit();
    saved = [...data.values()][0];
    assert.equal(saved.category, "temporarios");
    assert.equal(saved.order, 0);
    assert.equal(saved.price, 8.9);
    assert.ok(
      !container
        .querySelector(".public-fixture")!
        .textContent.includes("Farm de teste isolado"),
    );
    await field("Categoria", "temporarios");
    await click("Desativar");
    assert.equal([...data.values()][0].active, false);
    await click("Editar");
    rejectSave = true;
    await field("Preço (R$)", "99");
    await submit();
    assert.ok(
      container
        .querySelector('[role="alert"]')!
        .textContent.includes("não salvo"),
    );
    assert.ok(container.querySelector(".product-editor"));
    assert.equal([...data.values()][0].price, 8.9);
    await click("Cancelar");
    rejectSave = false;
    await click("Excluir");
    await click("Confirmar exclusão");
    assert.equal(data.size, 0);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globals, previous);
    await browser.happyDOM.close();
  }
});
