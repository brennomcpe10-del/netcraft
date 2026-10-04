import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Player } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { useToast } from './ToastContext.tsx';
import {
  getOrCreateUserFromFirestore,
  getUserByNicknameFromFirestore,
  saveUserToFirestore
} from '../lib/firestoreSync.ts';

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
const PROFILE_KEY = 'netcraftbr_player_profile';

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const { showSuccess } = useToast();

  const loadSavedPlayer = useCallback(async () => {
    try {
      const savedNick = localStorage.getItem(STORAGE_KEY);
      if (savedNick) {
        let p: Player | null = null;
        try {
          p = await api.getPlayer(savedNick);
        } catch {
          p = await getUserByNicknameFromFirestore(savedNick);
        }
        if (!p) {
          const cached = localStorage.getItem(PROFILE_KEY);
          if (cached) {
            try { p = JSON.parse(cached); } catch {}
          }
        }
        if (p) {
          setPlayer(p);
        } else {
          setPlayer({
            id: `player-${savedNick.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            nickname: savedNick,
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            activeVips: [],
            totalSpent: 0,
            ordersCount: 0
          });
        }
      } else {
        // If not logged in yet, prompt the user smoothly with the nickname modal
        setIsLoginModalOpen(true);
      }
    } catch (err) {
      console.warn('Could not restore saved player session:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSavedPlayer();
  }, [loadSavedPlayer]);

  const login = async (nickname: string): Promise<boolean> => {
    const cleanNick = nickname.trim();
    if (!cleanNick) return false;

    try {
      setLoading(true);
      let p: Player | null = null;

      // 1. Try server API login
      try {
        const res = await api.loginPlayer(cleanNick);
        p = res.player;
      } catch (apiErr) {
        console.warn('Backend API login unreachable, trying Firestore fallback:', apiErr);
      }

      // 2. If backend didn't respond, try Firestore directly
      if (!p) {
        try {
          p = await getOrCreateUserFromFirestore(cleanNick);
        } catch (fsErr) {
          console.warn('Firestore user query failed:', fsErr);
        }
      } else {
        // Background sync to Firestore
        saveUserToFirestore(p).catch(() => {});
      }

      // 3. Guaranteed fallback session if both remote sources are unavailable
      if (!p) {
        p = {
          id: `player-${cleanNick.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`,
          nickname: cleanNick,
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          activeVips: [],
          totalSpent: 0,
          ordersCount: 0
        };
      }

      setPlayer(p);
      localStorage.setItem(STORAGE_KEY, p.nickname);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      setIsLoginModalOpen(false);
      showSuccess(`Bem-vindo ao NetCraftBR, ${p.nickname}!`);
      return true;
    } catch (err: unknown) {
      console.error('Login error:', err);
      // Guarantee login succeeds so player is never locked out
      const fallback: Player = {
        id: `player-${cleanNick.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        nickname: cleanNick,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        activeVips: [],
        totalSpent: 0,
        ordersCount: 0
      };
      setPlayer(fallback);
      localStorage.setItem(STORAGE_KEY, fallback.nickname);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(fallback));
      setIsLoginModalOpen(false);
      showSuccess(`Bem-vindo ao NetCraftBR, ${fallback.nickname}!`);
      return true;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    if (player) {
      showSuccess(`Até logo, ${player.nickname}!`);
    }
    setPlayer(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROFILE_KEY);
  };

  const refreshPlayer = async () => {
    if (!player) return;
    try {
      const updated = await api.getPlayer(player.nickname);
      setPlayer(updated);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
    } catch {
      const fsUser = await getUserByNicknameFromFirestore(player.nickname);
      if (fsUser) {
        setPlayer(fsUser);
        localStorage.setItem(PROFILE_KEY, JSON.stringify(fsUser));
      }
    }
  };

  return (
    <PlayerContext.Provider
      value={{
        player,
        loading,
        login,
        logout,
        refreshPlayer,
        isLoginModalOpen,
        openLoginModal: () => setIsLoginModalOpen(true),
        closeLoginModal: () => setIsLoginModalOpen(false)
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};
