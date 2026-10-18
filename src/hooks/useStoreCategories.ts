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
          setLoading(false);
          setError(
            "Não foi possível carregar as categorias do Firebase. Recarregue antes de editar.",
          );
        },
      ),
    [],
  );
  return { categories, loading, error };
}

export function useStoreCategories() {
  return useStoreCategoryState().categories;
}
