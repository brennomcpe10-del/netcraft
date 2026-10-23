import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase.ts";
import {
  defaultStoreCategories,
  StoreCategory,
  validateCategories,
} from "../lib/storeCategories.ts";
export function useStoreCategoryState() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<StoreCategory[]>(
    defaultStoreCategories,
  );
  useEffect(
    () =>
      onSnapshot(
        doc(db, "settings", "storeCategories"),
        (snapshot) => {
          setLoading(false);
          setError("");
          if (!snapshot.exists()) {
            setCategories(defaultStoreCategories);
            return;
          }
          try {
            const value = snapshot.data().categories;
            validateCategories(value);
            setCategories(value);
          } catch {
            setCategories([]);
            setError(
              "As categorias salvas são inválidas. Nenhum dado foi alterado.",
            );
          }
        },
        () => {
          // Browser subscriptions sometimes fail on Preview. Recover with the
          // authenticated server database's read-only storefront snapshot.
          fetch("/api/storefront/catalog", { cache: "no-store" })
            .then(async response => {
              if (!response.ok) throw new Error("Catálogo indisponível.");
              const result = await response.json();
              const value = result.categories ?? defaultStoreCategories;
              validateCategories(value);
              setCategories(value);
              setError("");
            })
            .catch(() => setError(
              "Não foi possível carregar as categorias. Recarregue antes de editar.",
            ))
            .finally(() => setLoading(false));
        },
      ),
    [],
  );
  return { categories, loading, error };
}

export function useStoreCategories() {
  return useStoreCategoryState().categories;
}
