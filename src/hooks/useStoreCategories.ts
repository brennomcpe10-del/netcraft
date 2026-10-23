import { useCallback, useEffect, useState } from "react";
import {
  defaultStoreCategories,
  StoreCategory,
  validateCategories,
} from "../lib/storeCategories.ts";

// The backend publishes the category snapshot from the same Firestore database
// as Pix prices. Do not race against unauthenticated browser subscriptions.
export function useStoreCategoryState() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<StoreCategory[]>(defaultStoreCategories);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/storefront/catalog", { cache: "no-store" });
      if (!response.ok) throw new Error("Catálogo indisponível.");
      const result = await response.json();
      const value = result.categories ?? defaultStoreCategories;
      validateCategories(value);
      setCategories(value);
      setError("");
    } catch {
      setError("Não foi possível carregar as categorias oficiais. Recarregue antes de editar.");
      // Retain the last valid categories for display only. Editing is disabled.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { categories, loading, error, refresh };
}

export function useStoreCategories() {
  return useStoreCategoryState().categories;
}
