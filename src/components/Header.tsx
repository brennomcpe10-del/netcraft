import React, { useState } from 'react';
import { usePlayer } from '../context/PlayerContext.tsx';
import { useAdmin } from '../context/AdminContext.tsx';
import { NetcraftLogo } from './MinecraftLogo.tsx';
import { Menu, X, User, ShieldCheck, Shield, ChevronRight, Play, ExternalLink } from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenPlayModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, setCurrentTab, onOpenPlayModal }) => {
  const { player, openLoginModal } = usePlayer();
  const { isAdminLoggedIn, openAdminModal } = useAdmin();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const mainNav = [
    { id: 'home', label: 'INÍCIO' },
    { id: 'sobre', label: 'SOBRE' },
    { id: 'regras', label: 'REGRAS' },
    { id: 'store', label: 'LOJA' },
    { id: 'vip', label: 'VIP' },
    { id: 'discord', label: 'DISCORD', isExternal: true }
  ];

  const fullMenuItems = [
    { id: 'home', label: 'Início' },
    { id: 'server', label: 'Servidor & Sobre' },
    { id: 'vip', label: 'Planos VIP' },
    { id: 'store', label: 'Loja Oficial' },
    { id: 'events', label: 'Eventos' },
    { id: 'community', label: 'Comunidade & Discord' },
    { id: 'support', label: 'Suporte' }
  ];

  const handleSelectNav = (id: string) => {
    if (id === 'sobre' || id === 'regras') {
      setCurrentTab('server');
    } else if (id === 'discord') {
      setCurrentTab('community');
    } else {
      setCurrentTab(id);
    }
    setDrawerOpen(false);
  };

  const handleAdminClick = () => {
    setDrawerOpen(false);
    if (isAdminLoggedIn) {
      setCurrentTab('admin');
    } else {
      openAdminModal();
    }
  };

  return (
    <>
      {/* Top Halloween Seasonal Announcement Ribbon */}
      <div className="w-full bg-gradient-to-r from-[#7c2d12] via-[#ea580c] to-[#581c87] text-white text-[11px] font-bold font-heading py-1.5 px-4 text-center tracking-wider flex items-center justify-center gap-2 border-b border-[#ea580c]/40 shadow-sm relative z-50">
        <span className="halloween-flicker">🎃</span>
        <span>TEMPORADA DE HALLOWEEN • ARENAS DO TERROR E EVENTOS NOTURNOS NO BEDROCK!</span>
        <span className="hidden md:inline text-amber-200/80 font-mono text-[10px]">| IP: netcraftbr.srvmc.com:25673</span>
      </div>

      <header className="sticky top-0 z-40 w-full bg-[#08070d]/95 backdrop-blur-md border-b border-[#ea580c]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          {/* Left: 3D Jack-o'-Lantern + NETCRAFTBR */}
          <button
            type="button"
            onClick={() => handleSelectNav('home')}
            className="cursor-pointer focus:outline-none transition-transform hover:scale-[1.02]"
          >
            <NetcraftLogo size="md" />
          </button>

          {/* Center Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-bold tracking-wider font-heading">
            {mainNav.map(item => {
              const isActive =
                (item.id === 'home' && currentTab === 'home') ||
                (item.id === 'sobre' && currentTab === 'server') ||
                (item.id === 'regras' && currentTab === 'server') ||
                (item.id === 'store' && currentTab === 'store') ||
                (item.id === 'vip' && currentTab === 'vip') ||
                (item.id === 'discord' && currentTab === 'community');

              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => handleSelectNav(item.id)}
                  className={`relative py-2 transition-colors cursor-pointer ${
                    isActive ? 'text-[#ff9800] font-black' : 'text-zinc-400 hover:text-amber-200'
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#ff7a00] to-[#00e676] shadow-[0_0_8px_#ff7a00]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Player profile / login */}
            {player ? (
              <button
                type="button"
                onClick={() => handleSelectNav('profile')}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-2 ${
                  currentTab === 'profile'
                    ? 'border-[#ff7a00]/60 bg-[#ff7a00]/15 text-[#ff9800] font-medium'
                    : 'border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:text-white hover:border-[#ff7a00]/30'
                }`}
                title="Meu Perfil"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff7a00]" />
                <span className="font-medium max-w-[110px] truncate">{player.nickname}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={openLoginModal}
                className="hidden sm:flex text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 hover:text-white border border-white/[0.08] transition-all cursor-pointer items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5" />
                <span>Entrar</span>
              </button>
            )}

            {/* Admin Badge if staff is authenticated */}
            {isAdminLoggedIn && (
              <button
                type="button"
                onClick={() => handleSelectNav('admin')}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 font-bold font-heading ${
                  currentTab === 'admin'
                    ? 'border-[#ff7a00] bg-[#ff7a00]/20 text-[#ff9800]'
                    : 'border-[#ff7a00]/40 bg-[#ff7a00]/10 text-[#ff9800] hover:bg-[#ff7a00]/20'
                }`}
                title="Painel Administrativo"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#ff7a00]" />
                <span className="hidden sm:inline">ADMIN</span>
              </button>
            )}

            {/* Orange Halloween CTA Button: [ ▶ JOGAR ] */}
            <button
              type="button"
              onClick={() => {
                if (onOpenPlayModal) {
                  onOpenPlayModal();
                } else {
                  handleSelectNav('server');
                }
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ff7a00] to-[#ea580c] hover:from-[#ff9800] hover:to-[#f97316] text-black font-extrabold font-heading text-xs tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-[0_0_16px_rgba(255,122,0,0.4)] hover:shadow-[0_0_24px_rgba(255,122,0,0.7)] hover:scale-[1.02]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>JOGAR</span>
            </button>

            {/* Menu trigger (mobile & drawer) */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 text-zinc-300 hover:text-white transition-all cursor-pointer focus:outline-none"
              aria-label="Abrir Menu"
              title="Mais opções"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Slide-over Navigation Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm cursor-pointer"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-xs bg-[#080d12] border-l border-white/[0.08] p-6 sm:p-8 flex flex-col justify-between shadow-2xl z-10 overflow-y-auto">
            <div>
              {/* Header inside drawer */}
              <div className="flex items-center justify-between pb-5 border-b border-white/[0.08] mb-6">
                <NetcraftLogo size="sm" />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                  aria-label="Fechar Menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1.5">
                {fullMenuItems.map(item => {
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => handleSelectNav(item.id)}
                      className={`w-full text-left py-2.5 px-3.5 rounded-xl text-sm transition-all flex items-center justify-between group cursor-pointer ${
                        isActive
                          ? 'bg-[#00e676]/15 text-[#00e676] font-bold font-heading border border-[#00e676]/30'
                          : 'text-zinc-300 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="font-heading">{item.label}</span>
                      {isActive ? (
                        <span className="w-2 h-2 rounded-full bg-[#00e676] shadow-sm shadow-[#00e676]" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-transform group-hover:translate-x-0.5" />
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Staff / Admin Access Button */}
              <div className="mt-6 pt-5 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={handleAdminClick}
                  className={`w-full text-left py-2.5 px-3.5 rounded-xl text-xs transition-all flex items-center justify-between cursor-pointer border ${
                    isAdminLoggedIn
                      ? 'bg-[#00e676]/15 border-[#00e676]/40 text-[#00e676] font-medium hover:bg-[#00e676]/25'
                      : 'bg-white/[0.02] border-white/[0.08] text-zinc-400 hover:text-white hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {isAdminLoggedIn ? (
                      <ShieldCheck className="w-4 h-4 text-[#00e676]" />
                    ) : (
                      <Shield className="w-4 h-4 text-zinc-400" />
                    )}
                    <span className="font-heading font-bold tracking-wide">
                      {isAdminLoggedIn ? 'PAINEL ADMINISTRATIVO' : 'ACESSO STAFF / ADMIN'}
                    </span>
                  </span>
                  <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded ${
                    isAdminLoggedIn
                      ? 'bg-[#00e676]/25 text-[#00e676]'
                      : 'bg-white/[0.06] text-zinc-400'
                  }`}>
                    {isAdminLoggedIn ? 'Conectado' : 'Entrar'}
                  </span>
                </button>
              </div>
            </div>

            {/* Bottom info inside drawer */}
            <div className="pt-6 border-t border-white/[0.08] text-xs text-zinc-500 space-y-1">
              <div className="font-mono text-[#00e676]">netcraftbr.srvmc.com</div>
              <div>Minecraft Bedrock • Porta 25673</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
