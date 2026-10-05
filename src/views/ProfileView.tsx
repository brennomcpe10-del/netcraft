import React, { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext.tsx';
import { Order } from '../types/index.ts';
import { api } from '../lib/api.ts';

interface ProfileViewProps {
  setCurrentTab: (tab: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ setCurrentTab }) => {
  const { player, logout, openLoginModal } = usePlayer();
  const [activeMenu, setActiveMenu] = useState<'profile' | 'orders' | 'vips' | 'gifts' | 'settings'>('profile');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    if (player) {
      loadOrders();
    }
  }, [player]);

  const loadOrders = async () => {
    if (!player) return;
    try {
      setLoadingOrders(true);
      const data = await api.getPlayerOrders(player.nickname);
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingOrders(false);
    }
  };

  if (!player) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center space-y-4">
        <h1 className="text-2xl font-bold text-white font-heading">
          Identificação de Jogador
        </h1>
        <p className="text-xs text-zinc-400">
          Informe seu nickname do Minecraft Bedrock para acessar suas compras e benefícios.
        </p>
        <button
          onClick={openLoginModal}
          className="px-6 py-2.5 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
        >
          Entrar com Nickname
        </button>
      </div>
    );
  }

  const myPurchases = orders.filter(
    o => o.buyerNickname.toLowerCase() === player.nickname.toLowerCase() &&
         o.recipientNickname.toLowerCase() === player.nickname.toLowerCase()
  );

  const sentGifts = orders.filter(
    o => o.buyerNickname.toLowerCase() === player.nickname.toLowerCase() &&
         o.recipientNickname.toLowerCase() !== player.nickname.toLowerCase()
  );

  const activeVips = player.activeVips || [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-16 space-y-8 sm:space-y-12">
      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 sm:gap-4 border-b border-white/[0.06] pb-4 sm:pb-6">
        <div>
          <span className="text-[11px] font-mono uppercase text-emerald-400">
            {activeVips.length > 0 ? `VIP ${activeVips[0].vipName}` : 'Jogador'}
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-white mt-1">
            {player.nickname}
          </h1>
        </div>

        <span className="text-xs text-zinc-400 font-mono">
          Membro desde {new Date(player.createdAt).toLocaleDateString('pt-BR')}
        </span>
      </div>

      {/* Menu & Content */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8">
        {/* Navigation (Horizontally scrollable on mobile, sidebar on desktop) */}
        <nav className="flex md:flex-col items-center md:items-stretch gap-1.5 md:gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none md:col-span-1 w-full">
          <button
            onClick={() => setActiveMenu('profile')}
            className={`px-3 py-1.5 md:py-2 rounded-lg text-xs transition-colors cursor-pointer shrink-0 text-center md:text-left ${
              activeMenu === 'profile' ? 'bg-white/[0.08] text-white font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Meu perfil
          </button>
          <button
            onClick={() => setActiveMenu('orders')}
            className={`px-3 py-1.5 md:py-2 rounded-lg text-xs transition-colors cursor-pointer shrink-0 text-center md:text-left ${
              activeMenu === 'orders' ? 'bg-white/[0.08] text-white font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Minhas compras
          </button>
          <button
            onClick={() => setActiveMenu('vips')}
            className={`px-3 py-1.5 md:py-2 rounded-lg text-xs transition-colors cursor-pointer shrink-0 text-center md:text-left ${
              activeMenu === 'vips' ? 'bg-white/[0.08] text-white font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Meus VIPs
          </button>
          <button
            onClick={() => setActiveMenu('gifts')}
            className={`px-3 py-1.5 md:py-2 rounded-lg text-xs transition-colors cursor-pointer shrink-0 text-center md:text-left ${
              activeMenu === 'gifts' ? 'bg-white/[0.08] text-white font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Presentes enviados
          </button>
          <button
            onClick={() => setActiveMenu('settings')}
            className={`px-3 py-1.5 md:py-2 rounded-lg text-xs transition-colors cursor-pointer shrink-0 text-center md:text-left ${
              activeMenu === 'settings' ? 'bg-white/[0.08] text-white font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Configurações
          </button>
          <button
            onClick={logout}
            className="px-3 py-1.5 md:py-2 rounded-lg text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer shrink-0 text-center md:text-left md:pt-4"
          >
            Sair da conta
          </button>
        </nav>

        {/* Tab content */}
        <div className="md:col-span-3">
          {/* MEU PERFIL */}
          {activeMenu === 'profile' && (
            <div className="p-6 rounded-2xl border border-white/[0.06] bg-white/[0.01] space-y-4">
              <h2 className="text-base font-bold text-white">Dados da Conta</h2>
              <div className="space-y-3 text-xs text-zinc-300">
                <div className="flex justify-between py-2 border-b border-white/[0.04]">
                  <span className="text-zinc-400">Nickname Bedrock:</span>
                  <span className="font-mono text-white">{player.nickname}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.04]">
                  <span className="text-zinc-400">Total de compras:</span>
                  <span className="font-mono text-white">{orders.length} pedidos</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.04]">
                  <span className="text-zinc-400">Total investido:</span>
                  <span className="font-mono text-emerald-400">R$ {(player.totalSpent || 0).toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-zinc-400">Status VIP:</span>
                  <span className="text-white">{activeVips.length > 0 ? activeVips[0].vipName : 'Nenhum ativo'}</span>
                </div>
              </div>
            </div>
          )}

          {/* MINHAS COMPRAS */}
          {activeMenu === 'orders' && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white">Histórico de Compras</h2>
              {loadingOrders ? (
                <p className="text-xs text-zinc-400">Carregando compras...</p>
              ) : myPurchases.length === 0 ? (
                <p className="text-xs text-zinc-400 py-6 border border-white/[0.06] rounded-xl text-center">
                  Nenhuma compra realizada ainda.
                </p>
              ) : (
                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                  {myPurchases.map(o => (
                    <div key={o.id} className="py-4 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white">{o.productName}</div>
                        <div className="text-zinc-400 text-[11px] font-mono mt-0.5">
                          #{o.id} • {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-400">
                          R$ {o.amount.toFixed(2).replace('.', ',')}
                        </div>
                        <span className="text-[10px] text-zinc-400 uppercase font-mono">{o.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MEUS VIPS */}
          {activeMenu === 'vips' && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white">VIPs Ativos</h2>
              {activeVips.length === 0 ? (
                <div className="py-8 border border-white/[0.06] rounded-xl text-center space-y-3">
                  <p className="text-xs text-zinc-400">Você não possui nenhum plano VIP ativo.</p>
                  <button
                    onClick={() => setCurrentTab('vip')}
                    className="text-xs text-emerald-400 underline underline-offset-4 cursor-pointer font-medium"
                  >
                    Ver planos disponíveis
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeVips.map((v, i) => (
                    <div key={i} className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.01] flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-white text-sm">VIP {v.vipName}</div>
                        <div className="text-zinc-400 mt-0.5">
                          Ativado em {new Date(v.activatedAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <span className="text-emerald-400 font-mono">
                        {v.expiresAt ? `Expira em ${new Date(v.expiresAt).toLocaleDateString('pt-BR')}` : 'Vitalício'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PRESENTES ENVIADOS */}
          {activeMenu === 'gifts' && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white">Presentes Enviados</h2>
              {sentGifts.length === 0 ? (
                <p className="text-xs text-zinc-400 py-6 border border-white/[0.06] rounded-xl text-center">
                  Nenhum presente enviado para outros jogadores.
                </p>
              ) : (
                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                  {sentGifts.map(o => (
                    <div key={o.id} className="py-4 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white">{o.productName}</div>
                        <div className="text-zinc-400 text-[11px] mt-0.5">
                          Para: <strong className="text-zinc-200">{o.recipientNickname}</strong> • #{o.id}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-white">
                          R$ {o.amount.toFixed(2).replace('.', ',')}
                        </div>
                        <span className="text-[10px] text-zinc-400 uppercase font-mono">{o.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CONFIGURAÇÕES */}
          {activeMenu === 'settings' && (
            <div className="p-6 rounded-2xl border border-white/[0.06] bg-white/[0.01] space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-white">Sessão no Navegador</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Seu nickname fica armazenado localmente neste dispositivo para agilizar compras e consultas de pedidos.
                </p>
              </div>

              <div className="border-t border-white/[0.06] pt-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-zinc-300 font-medium">Desconectar nickname</span>
                  <p className="text-[11px] text-zinc-500">Limpa a identificação salva neste navegador.</p>
                </div>
                <button
                  onClick={logout}
                  className="px-4 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
