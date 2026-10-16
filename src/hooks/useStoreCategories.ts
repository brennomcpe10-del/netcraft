import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase.ts";
import {
  defaultStoreCategories,
  StoreCategory,
  validateCategories,
} from "../lib/storeCategories.ts";
export function useStoreCategories() {
  const [categories, setCategories] = useState<StoreCategory[]>(
    defaultStoreCategories,
  );
  useEffect(
    () =>
      onSnapshot(
        doc(db, "settings", "storeCategories"),
        (snapshot) => {
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
          }
        },
        () => {},
      ),
    [],
  );
  return categories;
}
