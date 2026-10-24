import React, { useState, useRef, useEffect } from "react";
import { useStoreCategoryState } from "../hooks/useStoreCategories.ts";
import { StoreCategory, validateCategories } from "../lib/storeCategories.ts";
import { useAdmin } from "../context/AdminContext.tsx";
import { useToast } from "../context/ToastContext.tsx";
import { api } from "../lib/api.ts";
import { compressImageFile } from "../lib/imageUtils.ts";
export function CategoryManager({
  onManageProducts,
}: {
  onManageProducts?: (category: string) => void;
}) {
  const { categories, loading, error: loadError, refresh } = useStoreCategoryState();
  const { adminToken } = useAdmin();
  const { showSuccess, showError } = useToast();
  const [editing, setEditing] = useState<StoreCategory | null>(null),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [deleting, setDeleting] = useState<StoreCategory | null>(null),
    [error, setError] = useState("");
  const editRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (editing)
      editRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [editing?.id]);
  async function upload(file?: File) {
    if (!file || !editing) return;
    setError("");
    try {
      if (
        !/^image\/(png|jpeg|webp|gif)$/.test(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw new Error("Escolha uma imagem de até 10 MB.");
      setUploading(true);
      const image = await compressImageFile(file, 480, 480, 0.65);
      if (image.length > 170000)
        throw new Error("Use uma imagem menor para esta categoria.");
      setEditing((previous) => (previous ? { ...previous, image } : null));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function save(next: StoreCategory[]) {
    try {
      setBusy(true);
      if (loading || loadError)
        throw new Error(
          "Aguarde o carregamento das categorias antes de editar.",
        );
      validateCategories(next);
      setError("");
      if (!adminToken) throw new Error("Entre no painel novamente.");
      await api.saveStoreCategories(next, adminToken);
      await refresh();
      setDeleting(null);
      setEditing(null);
      showSuccess("Categorias atualizadas.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao salvar.";
      setError(message);
      showError(message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="category-manager" aria-busy={busy || loading}>
      <div className="section-heading">
        <div>
          <h2>Categorias da loja</h2>
          <p>
            Organize os cartões da página inicial e a visibilidade de cada
            categoria.
          </p>
        </div>
        <button
          className="nc-button"
          disabled={busy || uploading || loading || !!loadError}
          onClick={() =>
            setEditing({
              id: `categoria-${Date.now()}`,
              title: "",
              description: "",
              image: "/hero_landscape.webp",
              order: categories.length + 1,
              active: true,
              showWhenEmpty: true,
            })
          }
        >
          Criar categoria
        </button>
      </div>
      {loading && <p role="status">Carregando categorias…</p>}
      {loadError && (
        <p role="alert" className="cart-error">
          {loadError}
        </p>
      )}
      <div className="manager-grid">
        {[...categories]
          .sort((a, b) => a.order - b.order)
          .map((c) => (
            <article key={c.id}>
              <img src={c.image} alt="" />
              <div>
                <h3>{c.title}</h3>
                <p>
                  {c.active
                    ? c.showWhenEmpty === false
                      ? "Visível quando houver produtos"
                      : "Visível"
                    : "Oculta"}{" "}
                  · Ordem {c.order}
                </p>
                {onManageProducts && (
                  <button
                    className="text-link"
                    disabled={busy || loading || !!loadError}
                    onClick={() => onManageProducts(c.id)}
                  >
                    Gerenciar produtos
                  </button>
                )}
                <button
                  className="text-link"
                  disabled={busy || uploading || loading || !!loadError}
                  onClick={() => {
                    setError("");
                    setEditing({ ...c });
                  }}
                >
                  Editar
                </button>
                <button
                  className="text-link"
                  disabled={busy || loading || !!loadError}
                  aria-label={`Excluir categoria ${c.title}`}
                  onClick={() => {
                    setError("");
                    setDeleting(c);
                  }}
                >
                  Remover
                </button>
              </div>
            </article>
          ))}
      </div>
      {error && (
        <p role="alert" className="cart-error">
          {error}
        </p>
      )}
      {deleting && (
        <div
          className="admin-delete-confirm"
          role="alertdialog"
          aria-label="Excluir categoria"
        >
          <h3>Excluir {deleting.title}?</h3>
          <p>
            Os produtos e pedidos serão preservados. Produtos desta categoria
            poderão ser reclassificados em Produtos → Todas as categorias.
          </p>
          <button
            className="nc-button"
            disabled={busy || loading || !!loadError}
            onClick={() => save(categories.filter((c) => c.id !== deleting.id))}
          >
            Confirmar exclusão da categoria
          </button>
          <button
            className="text-link"
            disabled={busy || loading || !!loadError}
            onClick={() => setDeleting(null)}
          >
            Cancelar exclusão
          </button>
        </div>
      )}
      {editing && (
        <form
          ref={editRef}
          className="category-edit"
          onSubmit={(e) => {
            e.preventDefault();
            save([...categories.filter((c) => c.id !== editing.id), editing]);
          }}
        >
          <h3>Editar categoria</h3>
          <fieldset disabled={busy || uploading || loading || !!loadError}>
            <label>
              Título
              <input
                required
                maxLength={80}
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </label>
            <label>
              Descrição
              <textarea
                maxLength={500}
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            <label>
              Imagem (HTTPS ou caminho local)
              <input
                value={editing.image.startsWith("data:") ? "" : editing.image}
                onChange={(e) =>
                  setEditing({ ...editing, image: e.target.value })
                }
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
            <img
              className="category-image-preview"
              src={editing.image}
              alt="Prévia da categoria"
            />
            {uploading && <p role="status">Preparando imagem…</p>}
            <label>
              Ordem
              <input
                type="number"
                step="any"
                required
                value={editing.order}
                onChange={(e) =>
                  setEditing({ ...editing, order: Number(e.target.value) })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) =>
                  setEditing({ ...editing, active: e.target.checked })
                }
              />{" "}
              Categoria ativa
            </label>
            <label>
              <input
                type="checkbox"
                checked={editing.showWhenEmpty !== false}
                onChange={(e) =>
                  setEditing({ ...editing, showWhenEmpty: e.target.checked })
                }
              />{" "}
              Mostrar também quando ainda não houver produtos
            </label>
          </fieldset>
          <div>
            <button
              className="nc-button"
              disabled={busy || uploading || loading || !!loadError}
            >
              Salvar categoria
            </button>
            <button
              className="text-link"
              type="button"
              disabled={busy || uploading || loading || !!loadError}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
