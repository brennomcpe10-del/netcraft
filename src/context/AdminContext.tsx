import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.ts';
import { useToast } from './ToastContext.tsx';

interface AdminContextType {
  adminToken: string | null;
  isAdminLoggedIn: boolean;
  isAdminModalOpen: boolean;
  openAdminModal: () => void;
  closeAdminModal: () => void;
  loginAdmin: (password: string) => Promise<boolean>;
  logoutAdmin: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

const ADMIN_TOKEN_KEY = 'netcraftbr_adm_session';

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const { showSuccess, showError } = useToast();

  const verifySavedSession = useCallback(async () => {
    const savedToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (savedToken) {
      const isValid = await api.verifyAdmin(savedToken);
      if (isValid) {
        setAdminToken(savedToken);
        setIsAdminLoggedIn(true);
      } else {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        setAdminToken(null);
        setIsAdminLoggedIn(false);
      }
    }
  }, []);

  useEffect(() => {
    verifySavedSession();
  }, [verifySavedSession]);

  const loginAdmin = async (password: string): Promise<boolean> => {
    try {
      const res = await api.loginAdmin(password);
      if (res.success && res.token) {
        setAdminToken(res.token);
        setIsAdminLoggedIn(true);
        sessionStorage.setItem(ADMIN_TOKEN_KEY, res.token);
        setIsAdminModalOpen(false);
        showSuccess('Acesso concedido ao Painel Administrativo NetCraftBR.');
        return true;
      }
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Credencial administrativa inválida.';
      showError(msg);
      return false;
    }
  };

  const logoutAdmin = async () => {
    if (adminToken) {
      await api.logoutAdmin(adminToken);
    }
    setAdminToken(null);
    setIsAdminLoggedIn(false);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    showSuccess('Desconectado do Painel Administrativo.');
  };

  return (
    <AdminContext.Provider
      value={{
        adminToken,
        isAdminLoggedIn,
        isAdminModalOpen,
        openAdminModal: () => setIsAdminModalOpen(true),
        closeAdminModal: () => setIsAdminModalOpen(false),
        loginAdmin,
        logoutAdmin
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};
