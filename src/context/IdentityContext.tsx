import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { defaultIdentity, type SiteIdentity } from "../lib/identity.ts";
const Context = createContext({
  identity: defaultIdentity,
  refresh: async () => {},
});
export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<SiteIdentity>(defaultIdentity);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/identity", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const data = await response.json();
        setIdentity((previous) =>
          JSON.stringify(previous) === JSON.stringify(data) ? previous : data,
        );
      }
    } catch {
      /* Keep the current brand during a temporary outage. */
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("identity:updated", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("identity:updated", refresh);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ identity, refresh }}>
      {children}
    </Context.Provider>
  );
}
export const useIdentity = () => useContext(Context);
