import React, { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Product } from "../types/index.ts";
import { StoreCategory, storeCategoryTitle } from "../lib/storeCategories.ts";
import { adminProductList, draftProduct } from "../lib/productAdmin.ts";
import { ProductEditor } from "./ProductEditor.tsx";
export function ProductManager({
  products,
  categories,
  initialCategory = "all",
  onSave,
  onDelete,
}: {
  products: Product[];
  categories: StoreCategory[];
  initialCategory?: string;
  onSave: (value: Product) => Promise<Product>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [category, setCategory] = useState(initialCategory),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Product | null>(null),
    [deleting, setDeleting] = useState<Product | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    setCategory(initialCategory);
    setSearch("");
  }, [initialCategory]);
  const list = adminProductList(products, category, search);
  async function save(product: Product) {
    setMessage("");
    setError("");
    await onSave(product);
    setEditing(null);
    setMessage("Produto salvo. A loja acompanha as alterações do catálogo.");
    setError("");
  }
  async function toggle(product: Product) {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      await onSave({ ...product, active: !product.active });
      setMessage(product.active ? "Produto desativado." : "Produto ativado.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    try {
      setBusy(true);
      setError("");
      setMessage("");
      await onDelete(deleting.id);
      setDeleting(null);
      setMessage("Produto excluído. Os pedidos anteriores foram preservados.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function create() {
    setMessage("");
    setError("");
    const id =
      category === "all" || !categories.some((c) => c.id === category)
        ? categories.find((c) => c.id === "kits")?.id || categories[0]?.id
        : category;
    if (!id) {
      setError("Crie uma categoria antes de cadastrar produtos.");
      return;
    }
    setEditing(draftProduct(id, products));
  }
  return (
    <section className="product-manager">
      <div className="section-heading">
        <div>
          <h2>Produtos por categoria</h2>
          <p>
            Cadastre cada kit ou item com seu próprio nome, imagem, preço e
            conteúdo.
          </p>
        </div>
        <button
          className="nc-button"
          onClick={create}
          disabled={busy || !categories.length}
        >
          <Plus size={17} />
          Novo produto
        </button>
      </div>
      <div className="product-admin-filters">
        <label>
          Categoria
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {storeCategoryTitle(c)}
              </option>
            ))}
            {category !== "all" &&
              !categories.some((c) => c.id === category) && (
                <option value={category}>
                  {category} (categoria removida)
                </option>
              )}
          </select>
        </label>
        <label>
          <span>Buscar produto</span>
          <span className="admin-search">
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou descrição"
            />
          </span>
        </label>
      </div>
      {message && (
        <p role="status" className="admin-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="cart-error">
          {error}
        </p>
      )}
      <div className="admin-products">
        {list.map((product) => (
          <article key={product.id}>
            <img
              src={
                /^(https:|data:|\/)/.test(product.image)
                  ? product.image
                  : "/categories/items.webp"
              }
              alt=""
            />
            <div className="admin-product-info">
              <span className="eyebrow">
                {categories.find((c) => c.id === product.category)?.title ||
                  product.category}{" "}
                · Ordem {product.order}
              </span>
              <h3>{product.name}</h3>
              <p>
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(product.price)}{" "}
                · {product.active ? "Ativo" : "Inativo"}
              </p>
              <p className="admin-product-description">{product.description}</p>
            </div>
            <div className="admin-product-actions">
              <button
                disabled={busy}
                onClick={() => setEditing({ ...product })}
                aria-label={`Editar ${product.name}`}
              >
                Editar
              </button>
              <button
                disabled={busy}
                onClick={() => toggle(product)}
                aria-label={`${product.active ? "Desativar" : "Ativar"} ${product.name}`}
              >
                {product.active ? "Desativar" : "Ativar"}
              </button>
              <button
                disabled={busy}
                onClick={() => setDeleting(product)}
                aria-label={`Excluir ${product.name}`}
              >
                Excluir
              </button>
            </div>
          </article>
        ))}
      </div>
      {!list.length && (
        <p className="empty-state">
          Nenhum produto nesta seleção. Use Novo produto para cadastrar.
        </p>
      )}
      {deleting && (
        <div
          className="admin-delete-confirm"
          role="alertdialog"
          aria-label="Confirmar exclusão"
        >
          <h3>Excluir {deleting.name}?</h3>
          <p>
            O produto sairá do catálogo. Pedidos anteriores e outros produtos
            serão preservados.
          </p>
          <button disabled={busy} className="nc-button" onClick={remove}>
            Confirmar exclusão
          </button>
          <button
            disabled={busy}
            className="text-link"
            onClick={() => setDeleting(null)}
          >
            Cancelar exclusão
          </button>
        </div>
      )}
      {editing && (
        <ProductEditor
          product={editing}
          categories={categories}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
