import React, { useState } from "react";
import { useStoreCategories } from "../hooks/useStoreCategories.ts";
import { StoreCategory, validateCategories } from "../lib/storeCategories.ts";
import { useAdmin } from "../context/AdminContext.tsx";
import { useToast } from "../context/ToastContext.tsx";
export function CategoryManager({
  onManageProducts,
}: {
  onManageProducts?: (category: string) => void;
}) {
  const categories = useStoreCategories();
  const { adminToken } = useAdmin();
  const { showSuccess, showError } = useToast();
  const [editing, setEditing] = useState<StoreCategory | null>(null),
    [busy, setBusy] = useState(false);
  async function save(next: StoreCategory[]) {
    try {
      setBusy(true);
      validateCategories(next);
      const res = await fetch("/api/admin/store-categories", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ categories: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setEditing(null);
      showSuccess("Categorias atualizadas.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="category-manager">
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
                    onClick={() => onManageProducts(c.id)}
                  >
                    Gerenciar produtos
                  </button>
                )}
                <button
                  className="text-link"
                  onClick={() => setEditing({ ...c })}
                >
                  Editar
                </button>
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remover esta categoria? Os produtos serão preservados e poderão ser reclassificados no painel.",
                      )
                    )
                      save(categories.filter((x) => x.id !== c.id));
                  }}
                >
                  Remover
                </button>
              </div>
            </article>
          ))}
      </div>
      {editing && (
        <form
          className="category-edit"
          onSubmit={(e) => {
            e.preventDefault();
            save([...categories.filter((c) => c.id !== editing.id), editing]);
          }}
        >
          <h3>Editar categoria</h3>
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
              required
              value={editing.image}
              onChange={(e) =>
                setEditing({ ...editing, image: e.target.value })
              }
            />
          </label>
          <label>
            Ordem
            <input
              type="number"
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
          <div>
            <button className="nc-button" disabled={busy}>
              Salvar categoria
            </button>
            <button
              className="text-link"
              type="button"
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
