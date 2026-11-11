import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { api } from "../lib/api.ts";
import { useToast } from "./ToastContext.tsx";

interface AdminContextType {
  adminToken: string | null;
  isAdminLoggedIn: boolean;
  isAdminChecking: boolean;
  isAdminModalOpen: boolean;
  openAdminModal: () => void;
  closeAdminModal: () => void;
  loginAdmin: (password: string) => Promise<boolean>;
  logoutAdmin: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

const ADMIN_TOKEN_KEY = "netcraftbr_adm_session";

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const sessionVersion = useRef(0);
  const [isAdminChecking, setIsAdminChecking] = useState(true);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const { showSuccess, showError } = useToast();

  const verifySavedSession = useCallback(async () => {
    const version = sessionVersion.current;
    try {
      const savedToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
      if (savedToken) {
        const isValid = await api.verifyAdmin(savedToken);
        if (version !== sessionVersion.current) return;
        if (isValid) {
          setAdminToken(savedToken);
          setIsAdminLoggedIn(true);
        } else {
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
          setAdminToken(null);
          setIsAdminLoggedIn(false);
        }
      }
    } catch (err) {
      // A network failure must not destroy a potentially valid saved session.
      if (version === sessionVersion.current)
        showError(
          err instanceof Error
            ? err.message
            : "Não foi possível verificar sua sessão.",
        );
    } finally {
      if (version === sessionVersion.current) setIsAdminChecking(false);
    }
  }, [showError]);
  const openAdminModal = useCallback(() => setIsAdminModalOpen(true), []);
  const closeAdminModal = useCallback(() => setIsAdminModalOpen(false), []);

  useEffect(() => {
    verifySavedSession();

    const handleExpired = () => {
      sessionVersion.current++;
      setIsAdminChecking(false);
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      setAdminToken(null);
      setIsAdminLoggedIn(false);
      setIsAdminModalOpen(true);
      showError(
        "Sua sessão de administrador expirou. Digite a credencial para continuar.",
      );
    };

    window.addEventListener("admin:session_expired", handleExpired);
    return () => {
      window.removeEventListener("admin:session_expired", handleExpired);
    };
  }, [verifySavedSession, showError]);

  const loginAdmin = async (password: string): Promise<boolean> => {
    try {
      const res = await api.loginAdmin(password);
      if (res.success && res.token) {
        sessionVersion.current++;
        setIsAdminChecking(false);
        setAdminToken(res.token);
        setIsAdminLoggedIn(true);
        sessionStorage.setItem(ADMIN_TOKEN_KEY, res.token);
        setIsAdminModalOpen(false);
        showSuccess("Acesso concedido ao Painel Administrativo NetCraftBR.");
        return true;
      }
      throw new Error("Resposta de login inválida. Tente novamente.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Credencial administrativa inválida.";
      throw new Error(msg);
    }
  };

  const logoutAdmin = async () => {
    sessionVersion.current++;
    const token = adminToken;
    setAdminToken(null);
    setIsAdminLoggedIn(false);
    setIsAdminChecking(false);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    if (token) await api.logoutAdmin(token).catch(() => {});
    showSuccess("Desconectado do Painel Administrativo.");
  };

  return (
    <AdminContext.Provider
      value={{
        adminToken,
        isAdminLoggedIn,
        isAdminChecking,
        isAdminModalOpen,
        openAdminModal,
        closeAdminModal,
        loginAdmin,
        logoutAdmin,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
};
