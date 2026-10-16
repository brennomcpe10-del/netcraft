import React, { useState, useCallback } from "react";
import { X } from "lucide-react";
import { Product } from "../types/index.ts";
import { StoreCategory, storeCategoryTitle } from "../lib/storeCategories.ts";
import { normalizeProduct } from "../lib/productAdmin.ts";
import { compressImageFile } from "../lib/imageUtils.ts";
import { useModalFocus } from "../hooks/useModalFocus.ts";
import { RewardEditor } from "./RewardEditor.tsx";
export function ProductEditor({
  product,
  categories,
  onSave,
  onClose,
}: {
  product: Product;
  categories: StoreCategory[];
  onSave: (value: Product) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(product),
    [price, setPrice] = useState(String(product.price)),
    [contents, setContents] = useState(product.highlights.join("\n")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false);
  const handleClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  const ref = useModalFocus(handleClose);
  const patch = (data: Partial<Product>) =>
    setValue((previous) => ({ ...previous, ...data }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!price.trim()) throw new Error("Informe o preço.");
      const data = normalizeProduct(
        { ...value, price: Number(price), highlights: contents.split("\n") },
        categories,
        product,
      );
      setBusy(true);
      await onSave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)
        throw new Error("Escolha uma imagem de até 10 MB.");
      setUploading(true);
      const image = await compressImageFile(file, 800, 800, 0.8);
      if (image.length > 850000)
        throw new Error("A imagem ficou muito grande. Use uma imagem menor.");
      patch({ image });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="product-editor-overlay">
      <div
        ref={ref}
        className="product-editor"
        role="dialog"
        aria-modal="true"
        aria-label="Editar produto"
      >
        <header>
          <div>
            <span className="eyebrow">CATÁLOGO DA LOJA</span>
            <h2>{product.name ? "Editar produto" : "Novo produto"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar editor"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <form onSubmit={submit}>
          <fieldset disabled={busy || uploading}>
            <div className="admin-form-grid">
              <label>
                Nome do produto
                <input
                  required
                  maxLength={120}
                  value={value.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <label>
                Categoria
                <select
                  value={value.category}
                  onChange={(e) => patch({ category: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {storeCategoryTitle(c)}
                      {!c.active ? " (oculta)" : ""}
                    </option>
                  ))}
                  {!categories.some((c) => c.id === value.category) && (
                    <option value={value.category}>
                      {value.category} (reclassificar)
                    </option>
                  )}
                </select>
              </label>
              <label>
                Preço (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
              <label>
                Ordem na categoria
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  step={1}
                  required
                  value={value.order}
                  onChange={(e) => patch({ order: Number(e.target.value) })}
                />
              </label>
            </div>
            <label>
              Descrição
              <textarea
                rows={3}
                maxLength={10000}
                value={value.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            <div className="admin-image-field">
              {value.image && (
                <img
                  src={
                    /^(https:|data:|\/)/.test(value.image)
                      ? value.image
                      : "/categories/items.webp"
                  }
                  alt="Prévia do produto"
                />
              )}
              <div>
                <label>
                  Imagem (URL ou caminho)
                  <input
                    value={value.image.startsWith("data:") ? "" : value.image}
                    placeholder="https://... ou /imagem.webp"
                    onChange={(e) => patch({ image: e.target.value })}
                  />
                </label>
                <label>
                  Ou enviar imagem
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
            <label>
              Conteúdo do kit / benefícios (um por linha)
              <textarea
                rows={4}
                value={contents}
                onChange={(e) => setContents(e.target.value)}
              />
            </label>
            <div className="admin-checkboxes">
              <label>
                <input
                  type="checkbox"
                  checked={value.active}
                  onChange={(e) => patch({ active: e.target.checked })}
                />
                Disponível para compra
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={value.featured === true}
                  onChange={(e) => patch({ featured: e.target.checked })}
                />
                Destacar na página inicial
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={value.allowQuantity !== false}
                  onChange={(e) => patch({ allowQuantity: e.target.checked })}
                />
                Permitir várias unidades no carrinho
              </label>
            </div>
            {value.allowQuantity !== false && (
              <label>
                Limite de unidades por carrinho
                <input
                  type="number"
                  min={1}
                  max={64}
                  required
                  value={value.maxQuantity ?? 64}
                  onChange={(e) =>
                    patch({ maxQuantity: Number(e.target.value) })
                  }
                />
              </label>
            )}
            <details className="admin-advanced">
              <summary>Configurar itens para futura entrega automática</summary>
              <RewardEditor
                value={value.rewardDraft}
                onChange={(rewardDraft) => patch({ rewardDraft })}
              />
            </details>
            <details className="admin-advanced">
              <summary>Links de pagamento atuais (opcional)</summary>
              <label>
                Link Pix ou chave cadastrada
                <input
                  value={value.pixUrl || ""}
                  onChange={(e) => patch({ pixUrl: e.target.value })}
                />
              </label>
              <label>
                Link LivePix
                <input
                  value={value.livepixUrl || ""}
                  onChange={(e) => patch({ livepixUrl: e.target.value })}
                />
              </label>
              <p>
                Os links atuais têm valor fixo. Pix dinâmico e entrega
                automática serão integrados depois.
              </p>
            </details>
          </fieldset>
          {error && (
            <p role="alert" className="cart-error">
              {error}
            </p>
          )}
          {uploading && <p role="status">Preparando imagem…</p>}
          <footer>
            <button
              className="text-link"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="nc-button" disabled={busy || uploading}>
              {busy ? "Salvando…" : "Salvar produto"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
