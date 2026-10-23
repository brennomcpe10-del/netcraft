import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Player } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { useToast } from './ToastContext.tsx';

interface PlayerContextType {
  player: Player | null;
  loading: boolean;
  login: (nickname: string) => Promise<boolean>;
  logout: () => void;
  refreshPlayer: () => Promise<void>;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);
const STORAGE_KEY = 'netcraftbr_player_nickname';
const LEGACY_PROFILE_KEY = 'netcraftbr_player_profile';

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const { showSuccess, showError } = useToast();

  const loadSavedPlayer = useCallback(async () => {
    try {
      const nickname = localStorage.getItem(STORAGE_KEY);
      // Never restore an unverified cached profile as though it were server data.
      localStorage.removeItem(LEGACY_PROFILE_KEY);
      if (!nickname) {
        setIsLoginModalOpen(true);
        return;
      }
      try {
        const response = await api.getPlayer(nickname);
        setPlayer(response);
      } catch {
        // Retain the nickname for retry, but no privileged offline profile.
        setPlayer(null);
        setIsLoginModalOpen(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedPlayer();
  }, [loadSavedPlayer]);

  const login = async (nickname: string): Promise<boolean> => {
    const cleaned = nickname.trim();
    if (cleaned.length < 3 || cleaned.length > 32) return false;
    setLoading(true);
    try {
      const result = await api.loginPlayer(cleaned);
      if (!result.success || !result.player) throw new Error('Perfil não confirmado pelo servidor.');
      // Nickname-only entry identifies a record but is not verified account ownership.
      setPlayer(result.player);
      localStorage.setItem(STORAGE_KEY, result.player.nickname);
      localStorage.removeItem(LEGACY_PROFILE_KEY);
      setIsLoginModalOpen(false);
      showSuccess(`Identificação registrada: ${result.player.nickname}`);
      return true;
    } catch {
      setPlayer(null);
      showError('Não foi possível consultar o servidor. Tente novamente.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setPlayer(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_PROFILE_KEY);
  };

  const refreshPlayer = async () => {
    if (!player) return;
    try {
      setPlayer(await api.getPlayer(player.nickname));
    } catch {
      // Keep the last server-confirmed public profile during a temporary outage.
    }
  };

  return (
    <PlayerContext.Provider
      value={{
        player, loading, login, logout, refreshPlayer, isLoginModalOpen,
        openLoginModal: () => setIsLoginModalOpen(true),
        closeLoginModal: () => setIsLoginModalOpen(false),
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within a PlayerProvider');
  return context;
};
