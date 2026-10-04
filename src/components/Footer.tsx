import React, { useState } from 'react';
import { ServerSettings } from '../types/index.ts';
import { useAdmin } from '../context/AdminContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { NetcraftLogo } from './MinecraftLogo.tsx';
import { Lock, Copy, Check, MessageSquare, Youtube } from 'lucide-react';

interface FooterProps {
  setCurrentTab: (tab: string) => void;
  settings: ServerSettings | null;
}

export const Footer: React.FC<FooterProps> = ({ setCurrentTab, settings }) => {
  const { isAdminLoggedIn, openAdminModal } = useAdmin();
  const { showSuccess } = useToast();
  const [copied, setCopied] = useState(false);

  const serverIp = settings?.ip || 'netcraftbr.srvmc.com';
  const serverPort = settings?.port || 25673;
  const fullAddress = `${serverIp}:${serverPort}`;

  const handleCopyIp = () => {
    navigator.clipboard.writeText(fullAddress);
    setCopied(true);
    showSuccess(`Endereço copiado: ${fullAddress}`);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleAdminClick = () => {
    if (isAdminLoggedIn) {
      setCurrentTab('admin');
    } else {
      openAdminModal();
    }
  };

  return (
    <footer className="w-full border-t border-[#00e676]/20 bg-[#05080c] relative overflow-hidden pt-14 pb-8 text-zinc-400 text-xs">
      {/* Subtle pixel block green decoration on left and right borders like the reference */}
      <div className="absolute top-0 left-0 w-32 h-32 bg-[#00e676]/[0.03] blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-48 h-48 bg-[#00e676]/[0.04] blur-3xl pointer-events-none" />

      {/* Minecraft pixel block corner accents */}
      <div className="absolute -top-1 -right-1 flex gap-1 pointer-events-none opacity-20">
        <div className="w-4 h-4 bg-[#00e676]" />
        <div className="w-4 h-4 bg-[#00e676]/60" />
      </div>
      <div className="absolute -top-1 -left-1 flex flex-col gap-1 pointer-events-none opacity-20">
        <div className="w-4 h-4 bg-[#00e676]" />
        <div className="w-4 h-4 bg-[#00e676]/40" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Column 1: Brand Logo & Tagline */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setCurrentTab('home')}
              className="text-left cursor-pointer focus:outline-none"
            >
              <NetcraftLogo size="md" showSubtitle />
            </button>
            <div className="pt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
              <span className="px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.05]">Bedrock Edition</span>
              <span className="px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.05]">Survival 1.20 - 1.21+</span>
            </div>
          </div>

          {/* Column 2: IP DO SERVIDOR */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-bold font-heading text-xs tracking-wider text-white">
              <span className="text-[#00e676]">⌨</span>
              <span>IP DO SERVIDOR</span>
            </div>

            {/* Copy address box */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#080d14] border border-[#00e676]/30 hover:border-[#00e676]/60 transition-colors group">
              <span className="font-mono text-xs text-white tracking-wide truncate">
                {fullAddress}
              </span>
              <button
                type="button"
                onClick={handleCopyIp}
                className="p-1 rounded text-zinc-400 group-hover:text-[#00e676] hover:bg-white/[0.05] transition-colors cursor-pointer shrink-0 ml-2"
                title="Copiar IP e Porta"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-[#00e676]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono">
              Bedrock 1.20.x - 1.21.x • Porta {serverPort}
            </p>
          </div>

          {/* Column 3: FALE CONOSCO */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-bold font-heading text-xs tracking-wider text-white">
              <MessageSquare className="w-3.5 h-3.5 text-[#00e676]" />
              <span>FALE CONOSCO</span>
            </div>
            <a
              href="https://discord.gg"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold font-heading text-[#00e676] hover:text-[#4ade80] transition-colors"
            >
              <span>Discord</span>
              <span className="text-[10px] font-sans font-normal text-zinc-500">(Comunidade Oficial)</span>
            </a>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Tire dúvidas e fique por dentro de tudo que acontece.
            </p>
          </div>

          {/* Column 4: SIGA-NOS & STAFF */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-bold font-heading text-xs tracking-wider text-white">
              <Youtube className="w-3.5 h-3.5 text-[#00e676]" />
              <span>SIGA-NOS</span>
            </div>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold font-heading text-[#00e676] hover:text-[#4ade80] transition-colors"
            >
              <span>YouTube</span>
              <span className="text-[10px] font-sans font-normal text-zinc-500">(NetCraftBR)</span>
            </a>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Vídeos, novidades e muito mais!
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleAdminClick}
                className="text-[11px] text-zinc-500 hover:text-[#00e676] transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Acesso Administrativo"
              >
                <Lock className="w-3 h-3 text-zinc-500" />
                <span>{isAdminLoggedIn ? 'Painel Staff (Conectado)' : 'Acesso Staff'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom divider with centered tagline */}
        <div className="pt-8 border-t border-white/[0.06] flex items-center justify-center gap-4 text-center">
          <div className="hidden sm:block h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.08]" />
          <p className="text-[11px] font-mono tracking-widest text-zinc-400 uppercase">
            NETCRAFTBR • JUNTOS FAZENDO UMA <span className="text-[#00e676] font-bold">COMUNIDADE</span> MELHOR
          </p>
          <div className="hidden sm:block h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.08]" />
        </div>
      </div>
    </footer>
  );
};
