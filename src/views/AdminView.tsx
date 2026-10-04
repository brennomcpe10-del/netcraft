import React, { useState, useEffect } from 'react';
import { useAdmin } from '../context/AdminContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { api } from '../lib/api.ts';
import {
  DashboardStats,
  VIP,
  Product,
  ProductCategory,
  Order,
  Player,
  ServerEvent,
  EventStatus,
  NewsArticle,
  NewsCategory,
  ServerSettings,
  SocialLink
} from '../types/index.ts';
import { Plus, Edit2, Trash2, ArrowLeft, Search, ExternalLink, Check, Upload, Image as ImageIcon } from 'lucide-react';
import { compressImageFile } from '../lib/imageUtils.ts';
import {
  saveVipToFirestore,
  deleteVipFromFirestore,
  getVipsFromFirestore,
  saveProductToFirestore,
  deleteProductFromFirestore,
  getProductsFromFirestore,
  saveSettingsToFirestore,
  getSettingsFromFirestore,
  saveEventToFirestore,
  deleteEventFromFirestore,
  getEventsFromFirestore,
  saveNewsToFirestore,
  deleteNewsFromFirestore,
  getNewsFromFirestore,
  saveCommunityLinkToFirestore,
  deleteCommunityLinkFromFirestore,
  getCommunityFromFirestore,
  saveOrderToFirestore,
  deleteOrderFromFirestore,
  deleteOrdersBulkFromFirestore,
  getOrdersFromFirestore,
  deletePlayerFromFirestore,
  getPlayersFromFirestore,
  savePlayerToFirestore,
  getStatsFromFirestore
} from '../lib/firestoreSync.ts';

interface AdminViewProps {
  onExit: () => void;
  onRefreshGlobalData: () => Promise<void>;
}

export const AdminView: React.FC<AdminViewProps> = ({ onExit, onRefreshGlobalData }) => {
  const { adminToken, logoutAdmin } = useAdmin();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'vips' | 'orders' | 'players' | 'store' | 'events' | 'news' | 'community' | 'server' | 'settings'
  >('dashboard');

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [vips, setVips] = useState<VIP[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [serverSettings, setServerSettings] = useState<ServerSettings | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Modals for editing / creating
  const [editingVip, setEditingVip] = useState<Partial<VIP> | null>(null);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [editingEvent, setEditingEvent] = useState<Partial<ServerEvent> | null>(null);
  const [editingNews, setEditingNews] = useState<Partial<NewsArticle> | null>(null);
  const [editingSocial, setEditingSocial] = useState<Partial<SocialLink> | null>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'vip' | 'product' | 'order' | 'player' | 'event' | 'news' | 'community';
    id: string;
    name: string;
    extraNickname?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk order deletion modal
  const [isBulkDeleteOrdersOpen, setIsBulkDeleteOrdersOpen] = useState(false);
  const [bulkOrderFilter, setBulkOrderFilter] = useState<'all' | 'concluidos' | 'pendentes' | 'cancelados'>('all');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Manual player creation modal
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newPlayerNick, setNewPlayerNick] = useState('');
  const [newPlayerVipId, setNewPlayerVipId] = useState('');
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);

  useEffect(() => {
    if (adminToken) {
      loadData();
    }
  }, [adminToken]);

  const loadData = async () => {
    if (!adminToken) return;
    try {
      const [
        dashResult,
        vipsResult,
        prodsResult,
        ordersResult,
        playersResult,
        eventsResult,
        newsResult,
        socialResult,
        settingsResult
      ] = await Promise.allSettled([
        getStatsFromFirestore(),
        getVipsFromFirestore(),
        getProductsFromFirestore(),
        getOrdersFromFirestore(),
        getPlayersFromFirestore(),
        getEventsFromFirestore(),
        getNewsFromFirestore(),
        getCommunityFromFirestore(),
        getSettingsFromFirestore()
      ]);

      const loadedOrders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
      const loadedPlayers = playersResult.status === 'fulfilled' ? playersResult.value : [];

      if (vipsResult.status === 'fulfilled') setVips(vipsResult.value);
      if (prodsResult.status === 'fulfilled') setProducts(prodsResult.value);
      if (ordersResult.status === 'fulfilled') setOrders(loadedOrders);
      if (playersResult.status === 'fulfilled') setPlayers(loadedPlayers);
      if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value);
      if (newsResult.status === 'fulfilled') setNews(newsResult.value);
      if (socialResult.status === 'fulfilled') setSocialLinks(socialResult.value);
      if (settingsResult.status === 'fulfilled' && settingsResult.value) setServerSettings(settingsResult.value);

      if (dashResult.status === 'fulfilled') {
        setStats(dashResult.value);
      } else {
        // Fallback: calculate stats from orders & players so dashboard never crashes
        const paid = loadedOrders.filter(o => o.status === 'Pago' || o.status === 'Entregue');
        const rev = paid.reduce((sum, o) => sum + (o.amount || 0), 0);
        setStats({
          playersCount: loadedPlayers.length,
          ordersCount: loadedOrders.length,
          pendingOrdersCount: loadedOrders.filter(o => o.status === 'Pendente').length,
          paidOrdersCount: paid.length,
          vipsSoldCount: paid.filter(o => o.productType === 'vip').length,
          totalRevenue: Number(rev.toFixed(2)),
          recentOrders: loadedOrders.slice(-10).reverse(),
          recentPlayers: loadedPlayers.slice(-10).reverse()
        });
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao carregar dados do painel');
    }
  };

  // -------------------------------------------------------------
  // SAVE HANDLERS
  // -------------------------------------------------------------
  const handleSaveVip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVip || !adminToken) return;
    try {
      let savedVip: VIP;
      if (editingVip.id) {
        savedVip = await api.updateVip(editingVip.id, editingVip, adminToken);
        showSuccess('VIP atualizado com sucesso');
        setVips(prev => prev.map(v => v.id === savedVip.id ? savedVip : v));
      } else {
        savedVip = await api.createVip(editingVip, adminToken);
        showSuccess('VIP criado com sucesso');
        setVips(prev => [...prev.filter(v => v.id !== savedVip.id), savedVip]);
      }
      await saveVipToFirestore(savedVip).catch(() => {});
      setEditingVip(null);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao salvar VIP');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !adminToken) return;
    try {
      let savedProd: Product;
      if (editingProduct.id) {
        savedProd = await api.updateProduct(editingProduct.id, editingProduct, adminToken);
        showSuccess('Item da loja atualizado');
        setProducts(prev => prev.map(p => p.id === savedProd.id ? savedProd : p));
      } else {
        savedProd = await api.createProduct(editingProduct, adminToken);
        showSuccess('Item criado na loja');
        setProducts(prev => [...prev.filter(p => p.id !== savedProd.id), savedProd]);
      }
      await saveProductToFirestore(savedProd).catch(() => {});
      setEditingProduct(null);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao salvar item');
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !adminToken) return;
    try {
      let savedEv: ServerEvent;
      if (editingEvent.id) {
        savedEv = await api.updateEvent(editingEvent.id, editingEvent, adminToken);
        showSuccess('Evento atualizado');
        setEvents(prev => prev.map(ev => ev.id === savedEv.id ? savedEv : ev));
      } else {
        savedEv = await api.createEvent(editingEvent, adminToken);
        showSuccess('Evento criado');
        setEvents(prev => [...prev.filter(ev => ev.id !== savedEv.id), savedEv]);
      }
      await saveEventToFirestore(savedEv).catch(() => {});
      setEditingEvent(null);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao salvar evento');
    }
  };

  const handleSaveNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNews || !adminToken) return;
    try {
      let savedN: NewsArticle;
      if (editingNews.id) {
        savedN = await api.updateNews(editingNews.id, editingNews, adminToken);
        showSuccess('Notícia atualizada');
        setNews(prev => prev.map(n => n.id === savedN.id ? savedN : n));
      } else {
        savedN = await api.createNews(editingNews, adminToken);
        showSuccess('Notícia publicada');
        setNews(prev => [...prev.filter(n => n.id !== savedN.id), savedN]);
      }
      await saveNewsToFirestore(savedN).catch(() => {});
      setEditingNews(null);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao salvar notícia');
    }
  };

  const handleSaveSocial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSocial || !adminToken) return;
    try {
      let savedSoc: SocialLink;
      if (editingSocial.id) {
        savedSoc = await api.updateSocialLink(editingSocial.id, editingSocial, adminToken);
        showSuccess('Rede social atualizada');
        setSocialLinks(prev => prev.map(s => s.id === savedSoc.id ? savedSoc : s));
      } else {
        savedSoc = await api.createSocialLink(editingSocial, adminToken);
        showSuccess('Rede social adicionada');
        setSocialLinks(prev => [...prev.filter(s => s.id !== savedSoc.id), savedSoc]);
      }
      await saveSocialLinkToFirestore(savedSoc).catch(() => {});
      setEditingSocial(null);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao salvar rede social');
    }
  };

  const handleUpdateOrderStatus = async (id: string, status: Order['status']) => {
    if (!adminToken) return;
    try {
      const updated = await api.updateOrderStatus(id, status, adminToken);
      await saveOrderToFirestore(updated).catch(() => {});
      showSuccess(`Status alterado para ${status}`);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao atualizar pedido');
    }
  };

  const handleBulkDeleteOrders = async () => {
    if (!adminToken || isBulkDeleting) return;
    try {
      setIsBulkDeleting(true);
      const res = await api.deleteOrdersBulk(bulkOrderFilter, adminToken);
      await deleteOrdersBulkFromFirestore(bulkOrderFilter).catch(() => {});

      if (bulkOrderFilter === 'all') {
        setOrders([]);
      } else if (bulkOrderFilter === 'concluidos') {
        setOrders(prev => prev.filter(o => o.status !== 'Entregue' && o.status !== 'Pago'));
      } else if (bulkOrderFilter === 'pendentes') {
        setOrders(prev => prev.filter(o => o.status !== 'Pendente'));
      } else if (bulkOrderFilter === 'cancelados') {
        setOrders(prev => prev.filter(o => o.status !== 'Cancelado'));
      }

      showSuccess(`${res.deletedCount} pedidos excluídos com sucesso!`);
      setIsBulkDeleteOrdersOpen(false);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Falha ao excluir pedidos em massa.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || isSavingPlayer) return;
    const clean = newPlayerNick.trim();
    if (!clean) {
      showError('Informe o nickname do jogador.');
      return;
    }
    if (clean.length < 3 || clean.length > 32) {
      showError('O nickname deve ter entre 3 e 32 caracteres.');
      return;
    }

    try {
      setIsSavingPlayer(true);
      const created = await api.createAdminPlayer(
        { nickname: clean, vipId: newPlayerVipId || undefined },
        adminToken
      );
      showSuccess(`Jogador ${created.nickname} registrado com sucesso!`);
      setIsAddingPlayer(false);
      setNewPlayerNick('');
      setNewPlayerVipId('');
      await loadData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Falha ao registrar jogador.');
    } finally {
      setIsSavingPlayer(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverSettings || !adminToken) return;
    try {
      await api.updateSettings(serverSettings, adminToken);
      await saveSettingsToFirestore(serverSettings).catch(() => {});
      showSuccess('Configurações atualizadas');
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  };

  // -------------------------------------------------------------
  // UNIFIED DELETE CONFIRMATION HANDLER
  // -------------------------------------------------------------
  const handleConfirmDelete = async () => {
    if (!deleteConfirm || !adminToken || isDeleting) return;
    const { type, id, name, extraNickname } = deleteConfirm;
    setIsDeleting(true);

    const lowerId = id.trim().toLowerCase();
    const cleanName = name.trim().toLowerCase();
    const cleanNick = (extraNickname || name).trim().toLowerCase();

    // 1. OPTIMISTIC UI: Instantly remove item from view so user never sees lag
    switch (type) {
      case 'vip':
        setVips(prev => prev.filter(v => v.id !== id && v.id.toLowerCase() !== lowerId && v.name.trim().toLowerCase() !== cleanName));
        break;
      case 'product':
        setProducts(prev => prev.filter(p => p.id !== id && p.id.toLowerCase() !== lowerId && p.name.trim().toLowerCase() !== cleanName));
        break;
      case 'order':
        setOrders(prev => prev.filter(o => o.id !== id && o.id.toLowerCase() !== lowerId && o.id.toLowerCase().replace(/^#/, '') !== lowerId.replace(/^#/, '')));
        break;
      case 'player':
        setPlayers(prev => prev.filter(p => p.id !== id && p.id.toLowerCase() !== lowerId && p.nickname.toLowerCase() !== cleanNick));
        break;
      case 'event':
        setEvents(prev => prev.filter(e => e.id !== id && e.id.toLowerCase() !== lowerId && e.name.trim().toLowerCase() !== cleanName));
        break;
      case 'news':
        setNews(prev => prev.filter(n => n.id !== id && n.id.toLowerCase() !== lowerId && n.title.trim().toLowerCase() !== cleanName));
        break;
      case 'community':
        setSocialLinks(prev => prev.filter(s => s.id !== id && s.id.toLowerCase() !== lowerId && s.name.trim().toLowerCase() !== cleanName));
        break;
    }

    try {
      // 2. Perform deletions concurrently on server & Firestore
      switch (type) {
        case 'vip':
          await Promise.allSettled([
            api.deleteVip(id, adminToken, name),
            deleteVipFromFirestore(id, name)
          ]);
          showSuccess(`VIP ${name} excluído com sucesso`);
          break;
        case 'product':
          await Promise.allSettled([
            api.deleteProduct(id, adminToken, name),
            deleteProductFromFirestore(id, name)
          ]);
          showSuccess(`Item ${name} excluído com sucesso`);
          break;
        case 'order':
          await Promise.allSettled([
            api.deleteOrder(id, adminToken),
            deleteOrderFromFirestore(id)
          ]);
          showSuccess(`Pedido #${id} excluído com sucesso`);
          break;
        case 'player':
          await Promise.allSettled([
            api.deletePlayer(id, adminToken, extraNickname || name),
            deleteUserFromFirestore(id, extraNickname || name)
          ]);
          showSuccess(`Jogador ${name} removido do sistema`);
          break;
        case 'event':
          await Promise.allSettled([
            api.deleteEvent(id, adminToken, name),
            deleteEventFromFirestore(id, name)
          ]);
          showSuccess(`Evento ${name} excluído com sucesso`);
          break;
        case 'news':
          await Promise.allSettled([
            api.deleteNews(id, adminToken, name),
            deleteNewsFromFirestore(id, name)
          ]);
          showSuccess(`Notícia ${name} excluída com sucesso`);
          break;
        case 'community':
          await Promise.allSettled([
            api.deleteSocialLink(id, adminToken, name),
            deleteSocialLinkFromFirestore(id, name)
          ]);
          showSuccess(`Comunidade ${name} excluída com sucesso`);
          break;
      }
      setDeleteConfirm(null);
      // Synchronize global application state so the public site immediately reflects the deletion
      await onRefreshGlobalData();
      // Reload admin stats and data so all lists and metrics are 100% updated
      await loadData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao processar exclusão');
      await loadData();
    } finally {
      setIsDeleting(false);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'vips', label: 'VIPs' },
    { id: 'orders', label: 'Pedidos' },
    { id: 'players', label: 'Jogadores' },
    { id: 'store', label: 'Loja' },
    { id: 'events', label: 'Eventos' },
    { id: 'news', label: 'Notícias' },
    { id: 'community', label: 'Comunidade' },
    { id: 'server', label: 'Servidor' },
    { id: 'settings', label: 'Configurações' }
  ] as const;

  return (
    <div className="min-h-screen bg-[#07090d] text-zinc-200 text-xs">
      {/* Top Header */}
      <header className="border-b border-white/[0.06] bg-[#090b10] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao site</span>
          </button>
          <span className="text-zinc-600">|</span>
          <span className="font-bold text-white font-heading text-sm">
            Painel Administrativo NetCraftBR
          </span>
        </div>

        <button
          onClick={() => {
            logoutAdmin();
            onExit();
          }}
          className="text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer font-medium"
        >
          Sair
        </button>
      </header>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-white/[0.06] pb-3 overflow-x-auto scrollbar-none">
          {navItems.map(item => {
            const isSelected = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setSearchQuery('');
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-white text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* ============================================================== */}
        {/* 1. DASHBOARD */}
        {/* ============================================================== */}
        {activeTab === 'dashboard' && stats && (
          <div className="space-y-10">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl border border-white/[0.06] bg-white/[0.01]">
                <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
                  Jogadores Cadastrados
                </span>
                <span className="text-2xl font-bold text-white font-heading">
                  {stats.playersCount}
                </span>
              </div>

              <div className="p-5 rounded-xl border border-white/[0.06] bg-white/[0.01]">
                <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
                  VIPs Vendidos
                </span>
                <span className="text-2xl font-bold text-white font-heading">
                  {stats.vipsSoldCount}
                </span>
              </div>

              <div className="p-5 rounded-xl border border-white/[0.06] bg-white/[0.01]">
                <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
                  Pedidos Pendentes
                </span>
                <span className="text-2xl font-bold text-amber-400 font-heading">
                  {stats.pendingOrdersCount}
                </span>
              </div>

              <div className="p-5 rounded-xl border border-white/[0.06] bg-white/[0.01]">
                <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
                  Receita Total
                </span>
                <span className="text-2xl font-bold text-emerald-400 font-heading">
                  R$ {stats.totalRevenue.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>

            {/* Últimos Pedidos */}
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white font-heading">
                Últimos Pedidos
              </h2>
              <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {stats.recentOrders.slice(0, 8).map(o => (
                  <div key={o.id} className="py-3.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white">
                        {o.recipientNickname} • {o.productName}
                      </div>
                      <div className="text-zinc-500 text-[11px] font-mono mt-0.5">
                        #{o.id} • {new Date(o.createdAt).toLocaleDateString('pt-BR')} via {o.paymentMethod}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white">
                        R$ {o.amount.toFixed(2).replace('.', ',')}
                      </div>
                      <span className="text-[10px] uppercase font-mono text-zinc-400">
                        {o.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 2. VIPS */}
        {/* ============================================================== */}
        {activeTab === 'vips' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Pacotes VIP</h2>
                <p className="text-zinc-500 text-[11px]">Gerencie pacotes, preços, duração e benefícios dos VIPs</p>
              </div>
              <button
                onClick={() =>
                  setEditingVip({
                    name: '',
                    price: 29.9,
                    duration: '30 dias',
                    description: '',
                    benefits: ['Tag no chat', 'Kit diário exclusivo'],
                    color: 'emerald',
                    image: 'crown',
                    order: vips.length + 1,
                    active: true
                  })
                }
                className="px-3 py-1.5 bg-white text-zinc-950 rounded-lg text-xs font-semibold hover:bg-zinc-200 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo VIP</span>
              </button>
            </div>

            <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {vips.map(vip => (
                <div key={vip.id} className="py-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-sm flex items-center gap-2">
                      <span>{vip.name}</span>
                      <span className="text-zinc-500 font-mono text-xs font-normal">
                        ({vip.duration})
                      </span>
                      {!vip.active && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] uppercase font-mono">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-emerald-400 font-mono">
                        R$ {vip.price.toFixed(2).replace('.', ',')}
                      </span>
                      {vip.pixUrl && vip.pixUrl.trim().length > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-[10px] flex items-center gap-1">
                          💠 PIX: {vip.pixUrl}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-zinc-800/80 border border-white/[0.06] text-zinc-500 font-mono text-[10px]">
                          Sem PIX
                        </span>
                      )}
                      {vip.livepixUrl && vip.livepixUrl.trim().length > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-[#00e676]/10 border border-[#00e676]/30 text-[#00e676] font-mono text-[10px] flex items-center gap-1">
                          ⚡ LivePix: {vip.livepixUrl}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-zinc-800/80 border border-white/[0.06] text-zinc-500 font-mono text-[10px]">
                          Sem LivePix
                        </span>
                      )}
                    </div>
                    {vip.benefits && vip.benefits.length > 0 && (
                      <div className="text-zinc-500 text-[11px] mt-1 line-clamp-1">
                        {vip.benefits.join(' • ')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingVip({ ...vip })}
                      title="Editar VIP"
                      className="text-zinc-400 hover:text-white p-1.5 rounded hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ type: 'vip', id: vip.id, name: vip.name })}
                      title="Excluir VIP"
                      className="text-zinc-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 3. PEDIDOS (COM OPÇÃO DE APAGAR) */}
        {/* ============================================================== */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">Todos os Pedidos</h2>
                <p className="text-zinc-500 text-[11px]">Altere status de entrega ou exclua pedidos cancelados/duplicados</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteOrdersOpen(true)}
                  disabled={orders.length === 0}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir em Massa...</span>
                </button>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Filtrar por nick ou #ID..."
                    className="px-3 py-1.5 pl-8 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none w-56 sm:w-64"
                  />
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>

            <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {orders
                .filter(o => {
                  if (!searchQuery) return true;
                  const s = searchQuery.toLowerCase();
                  return (
                    o.id.toLowerCase().includes(s) ||
                    o.recipientNickname.toLowerCase().includes(s) ||
                    o.buyerNickname.toLowerCase().includes(s) ||
                    o.productName.toLowerCase().includes(s)
                  );
                })
                .map(order => (
                  <div key={order.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-white">
                        {order.recipientNickname} • {order.productName}
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px] mt-0.5">
                        #{order.id} • Comprador: {order.buyerNickname} • {new Date(order.createdAt).toLocaleDateString('pt-BR')} • {order.paymentMethod}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="text-right">
                        <div className="font-bold text-white">
                          R$ {order.amount.toFixed(2).replace('.', ',')}
                        </div>
                      </div>

                      <select
                        value={order.status}
                        onChange={e => handleUpdateOrderStatus(order.id, e.target.value as Order['status'])}
                        className={`px-2 py-1 rounded border text-xs font-mono outline-none cursor-pointer ${
                          order.status === 'Entregue' || order.status === 'Pago'
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                            : order.status === 'Cancelado'
                            ? 'bg-rose-950/40 border-rose-500/30 text-rose-400'
                            : 'bg-zinc-900 border-white/[0.08] text-amber-300'
                        }`}
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Pago">Pago</option>
                        <option value="Entregue">Entregue</option>
                        <option value="Cancelado">Cancelado</option>
                      </select>

                      {/* Botão de Excluir Pedido */}
                      <button
                        onClick={() =>
                          setDeleteConfirm({
                            type: 'order',
                            id: order.id,
                            name: `Pedido #${order.id} (${order.recipientNickname})`
                          })
                        }
                        title="Apagar Pedido"
                        className="text-zinc-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              {orders.length === 0 && (
                <div className="py-8 text-center text-zinc-500">
                  Nenhum pedido registrado até o momento.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 4. JOGADORES (COM BUSCA E OPÇÃO DE APAGAR) */}
        {/* ============================================================== */}
        {activeTab === 'players' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">Jogadores Registrados</h2>
                <p className="text-zinc-500 text-[11px]">
                  {players.length} jogador{players.length === 1 ? '' : 'es'} registrado{players.length === 1 ? '' : 's'} no ecossistema
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingPlayer(true)}
                  className="px-3 py-1.5 bg-[#00e676]/15 hover:bg-[#00e676]/25 border border-[#00e676]/40 text-[#00e676] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Jogador</span>
                </button>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar nickname..."
                    className="px-3 py-1.5 pl-8 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none w-52 sm:w-64"
                  />
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>

            <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {players
                .filter(p => {
                  if (!searchQuery) return true;
                  return p.nickname.toLowerCase().includes(searchQuery.toLowerCase());
                })
                .map(p => (
                  <div key={p.id} className="py-4 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-bold text-emerald-400 text-xs">
                        {p.nickname.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{p.nickname}</span>
                          {p.activeVips && p.activeVips.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                              {p.activeVips[0].vipName}
                            </span>
                          )}
                        </div>
                        <div className="text-zinc-500 text-[11px] font-mono mt-0.5">
                          Cadastrado em: {new Date(p.createdAt).toLocaleDateString('pt-BR')} • {p.ordersCount || 0} pedidos
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-emerald-400 font-mono font-semibold block">
                          R$ {(p.totalSpent || 0).toFixed(2).replace('.', ',')}
                        </span>
                        <span className="text-zinc-500 text-[10px] font-mono">Gasto total</span>
                      </div>

                      {/* Botão de Excluir Jogador */}
                      <button
                        onClick={() =>
                          setDeleteConfirm({
                            type: 'player',
                            id: p.id,
                            name: p.nickname,
                            extraNickname: p.nickname
                          })
                        }
                        title="Apagar Jogador"
                        className="text-zinc-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              {players.length === 0 && (
                <div className="py-8 text-center text-zinc-500">
                  Nenhum jogador encontrado.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 5. LOJA (ITENS DA LOJA: EDITAR, APAGAR, CRIAR) */}
        {/* ============================================================== */}
        {activeTab === 'store' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Itens da Loja</h2>
                <p className="text-zinc-500 text-[11px]">Gerencie kits, itens, chaves, moedas, spawners e cosméticos</p>
              </div>
              <button
                onClick={() =>
                  setEditingProduct({
                    name: '',
                    category: 'kits',
                    price: 9.90,
                    description: '',
                    image: 'cube',
                    active: true,
                    highlights: ['Item exclusivo para sua aventura'],
                    order: products.length + 1
                  })
                }
                className="px-3 py-1.5 bg-white text-zinc-950 rounded-lg text-xs font-semibold hover:bg-zinc-200 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Item</span>
              </button>
            </div>

            <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {products.map(prod => (
                <div key={prod.id} className="py-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{prod.name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 font-mono text-[10px] uppercase">
                        {prod.category}
                      </span>
                      {!prod.active && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px] uppercase">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-emerald-400 font-mono">
                        R$ {prod.price.toFixed(2).replace('.', ',')}
                      </span>
                      {prod.pixUrl && prod.pixUrl.trim().length > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-[10px] flex items-center gap-1">
                          💠 PIX: {prod.pixUrl}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-zinc-800/80 border border-white/[0.06] text-zinc-500 font-mono text-[10px]">
                          Sem PIX
                        </span>
                      )}
                      {prod.livepixUrl && prod.livepixUrl.trim().length > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-[#00e676]/10 border border-[#00e676]/30 text-[#00e676] font-mono text-[10px] flex items-center gap-1">
                          ⚡ LivePix: {prod.livepixUrl}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-zinc-800/80 border border-white/[0.06] text-zinc-500 font-mono text-[10px]">
                          Sem LivePix
                        </span>
                      )}
                    </div>
                    {prod.description && (
                      <div className="text-zinc-500 text-[11px] mt-1 line-clamp-1">
                        {prod.description}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingProduct({ ...prod })}
                      title="Editar Item da Loja"
                      className="text-zinc-400 hover:text-white p-1.5 rounded hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        setDeleteConfirm({
                          type: 'product',
                          id: prod.id,
                          name: prod.name
                        })
                      }
                      title="Apagar Item da Loja"
                      className="text-zinc-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {products.length === 0 && (
                <div className="py-8 text-center text-zinc-500">
                  Nenhum produto cadastrado na loja.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 6. EVENTOS (EDITAR, APAGAR, CRIAR) */}
        {/* ============================================================== */}
        {activeTab === 'events' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Eventos do Servidor</h2>
                <p className="text-zinc-500 text-[11px]">Crie, edite e remova torneios, gladiadores e eventos especiais</p>
              </div>
              <button
                onClick={() =>
                  setEditingEvent({
                    name: '',
                    description: '',
                    date: new Date().toISOString().split('T')[0],
                    time: '19:00',
                    status: 'Próximo',
                    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
                    rewards: ['VIP Bronze 7 dias', '50.000 Coins'],
                    published: true,
                    location: '/warp eventos'
                  })
                }
                className="px-3 py-1.5 bg-white text-zinc-950 rounded-lg text-xs font-semibold hover:bg-zinc-200 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Evento</span>
              </button>
            </div>

            <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {events.map(ev => (
                <div key={ev.id} className="py-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{ev.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${
                        ev.status === 'Em andamento'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : ev.status === 'Encerrado'
                          ? 'bg-zinc-800 text-zinc-400'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {ev.status}
                      </span>
                      {!ev.published && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] uppercase font-mono">
                          Oculto
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-400 font-mono text-[11px] mt-0.5">
                      {ev.date} às {ev.time} • Local: {ev.location || '/warp eventos'}
                    </div>
                    {ev.description && (
                      <div className="text-zinc-500 text-[11px] mt-1 line-clamp-1">
                        {ev.description}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingEvent({ ...ev })}
                      title="Editar Evento"
                      className="text-zinc-400 hover:text-white p-1.5 rounded hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        setDeleteConfirm({
                          type: 'event',
                          id: ev.id,
                          name: ev.name
                        })
                      }
                      title="Apagar Evento"
                      className="text-zinc-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div className="py-8 text-center text-zinc-500">
                  Nenhum evento registrado.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 7. NOTÍCIAS (EDITAR, APAGAR, CRIAR) */}
        {/* ============================================================== */}
        {activeTab === 'news' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Notícias & Changelogs</h2>
                <p className="text-zinc-500 text-[11px]">Publique avisos, notas de atualização e novidades do NetCraftBR</p>
              </div>
              <button
                onClick={() =>
                  setEditingNews({
                    title: '',
                    category: 'Atualização',
                    author: 'Equipe NetCraftBR',
                    date: new Date().toISOString().split('T')[0],
                    summary: '',
                    content: '',
                    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
                    published: true
                  })
                }
                className="px-3 py-1.5 bg-white text-zinc-950 rounded-lg text-xs font-semibold hover:bg-zinc-200 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Notícia</span>
              </button>
            </div>

            <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {news.map(n => (
                <div key={n.id} className="py-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{n.title}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 font-mono text-[10px] uppercase">
                        {n.category}
                      </span>
                      {!n.published && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px] uppercase">
                          Oculto
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-500 font-mono text-[11px] mt-0.5">
                      Por {n.author} • {n.date}
                    </div>
                    {n.summary && (
                      <div className="text-zinc-400 text-[11px] mt-1 line-clamp-1">
                        {n.summary}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingNews({ ...n })}
                      title="Editar Notícia"
                      className="text-zinc-400 hover:text-white p-1.5 rounded hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        setDeleteConfirm({
                          type: 'news',
                          id: n.id,
                          name: n.title
                        })
                      }
                      title="Apagar Notícia"
                      className="text-zinc-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {news.length === 0 && (
                <div className="py-8 text-center text-zinc-500">
                  Nenhuma notícia cadastrada.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 8. COMUNIDADE (EDITAR, APAGAR, CRIAR) */}
        {/* ============================================================== */}
        {activeTab === 'community' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Redes Sociais & Comunidades</h2>
                <p className="text-zinc-500 text-[11px]">Gerencie os links do Discord, YouTube, TikTok, WhatsApp e redes</p>
              </div>
              <button
                onClick={() =>
                  setEditingSocial({
                    name: '',
                    platform: 'discord',
                    url: '',
                    icon: 'message-square',
                    description: '',
                    memberCount: '',
                    active: true,
                    order: socialLinks.length + 1
                  })
                }
                className="px-3 py-1.5 bg-white text-zinc-950 rounded-lg text-xs font-semibold hover:bg-zinc-200 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Comunidade</span>
              </button>
            </div>

            <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {socialLinks.map(s => (
                <div key={s.id} className="py-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{s.name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 font-mono text-[10px] uppercase">
                        {s.platform}
                      </span>
                      {!s.active && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px] uppercase">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-400 font-mono text-[11px] mt-0.5 flex items-center gap-2">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline flex items-center gap-1 text-emerald-400 truncate max-w-xs"
                      >
                        <span>{s.url}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      {s.memberCount && (
                        <span className="text-zinc-500">({s.memberCount})</span>
                      )}
                    </div>
                    {s.description && (
                      <div className="text-zinc-500 text-[11px] mt-1 line-clamp-1">
                        {s.description}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingSocial({ ...s })}
                      title="Editar Rede Social"
                      className="text-zinc-400 hover:text-white p-1.5 rounded hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        setDeleteConfirm({
                          type: 'community',
                          id: s.id,
                          name: s.name
                        })
                      }
                      title="Apagar Rede Social"
                      className="text-zinc-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {socialLinks.length === 0 && (
                <div className="py-8 text-center text-zinc-500">
                  Nenhuma rede social configurada.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 9. SERVIDOR & CONFIGURAÇÕES GERAIS */}
        {/* ============================================================== */}
        {(activeTab === 'server' || activeTab === 'settings') && serverSettings && (
          <form onSubmit={handleSaveSettings} className="space-y-6 max-w-xl">
            <div>
              <h2 className="text-base font-bold text-white">Configurações Gerais do Servidor</h2>
              <p className="text-zinc-500 text-[11px]">IP de conexão, porta Bedrock, versão e textos do servidor</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Nome do Servidor</label>
                <input
                  type="text"
                  value={serverSettings.serverName}
                  onChange={e => setServerSettings({ ...serverSettings, serverName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Tagline</label>
                <input
                  type="text"
                  value={serverSettings.tagline}
                  onChange={e => setServerSettings({ ...serverSettings, tagline: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">IP do Servidor</label>
                  <input
                    type="text"
                    value={serverSettings.ip}
                    onChange={e => setServerSettings({ ...serverSettings, ip: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs font-mono text-white outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Porta Bedrock</label>
                  <input
                    type="number"
                    value={serverSettings.port}
                    onChange={e => setServerSettings({ ...serverSettings, port: parseInt(e.target.value) || 25673 })}
                    className="w-full px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs font-mono text-white outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Versão Compatível</label>
                <input
                  type="text"
                  value={serverSettings.version}
                  onChange={e => setServerSettings({ ...serverSettings, version: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Mensagem do Dia (MOTD)</label>
                <textarea
                  rows={2}
                  value={serverSettings.motd}
                  onChange={e => setServerSettings({ ...serverSettings, motd: e.target.value })}
                  className="w-full px-3.5 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* Foto da Seção "O QUE TE ESPERA?" */}
              <div className="pt-4 border-t border-white/[0.08] space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-[#00e676] rounded-full shadow-[0_0_8px_#00e676]" />
                  <label className="block text-xs font-black font-heading text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-[#00e676]" />
                    <span>Foto da Seção &quot;O QUE TE ESPERA?&quot;</span>
                  </label>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Defina a imagem principal exibida ao lado dos recursos e sistemas do servidor na página inicial (onde aparece o distintivo &quot;EXPLORE CONSTRUA EVOLUA&quot;).
                </p>

                {/* Preview em tamanho proporcional */}
                <div className="relative rounded-xl overflow-hidden border border-[#00e676]/40 bg-[#070b10] max-w-sm aspect-[4/3] group shadow-xl">
                  <img
                    src={serverSettings.whatToExpectImage || '/harbor_explore.jpg'}
                    alt="Preview O Que Te Espera"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#06090e] via-transparent to-transparent opacity-85" />
                  <div className="absolute bottom-3 left-3 select-none -rotate-6 transform pointer-events-none">
                    <div className="leading-tight font-black font-heading text-base drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                      <div className="text-white">EXPLORE</div>
                      <div className="text-[#00e676]">CONSTRUA</div>
                      <div className="text-[#00e676]">EVOLUA</div>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-mono text-[#00e676] border border-[#00e676]/30 font-bold">
                    PREVIEW EM TEMPO REAL
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] text-zinc-400">
                    URL ou Link Direto da Imagem
                  </label>
                  <input
                    type="text"
                    value={serverSettings.whatToExpectImage || ''}
                    onChange={e => setServerSettings({ ...serverSettings, whatToExpectImage: e.target.value })}
                    placeholder="https://exemplo.com/sua-foto.jpg ou /harbor_explore.jpg"
                    className="w-full px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] focus:border-[#00e676] rounded-lg text-xs font-mono text-white outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {/* File Upload Button */}
                  <label className="px-3.5 py-2 rounded-lg bg-[#00e676]/15 hover:bg-[#00e676]/25 border border-[#00e676]/40 text-[#00e676] text-xs font-bold font-heading tracking-wide cursor-pointer transition-colors flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" />
                    <span>ENVIAR DO COMPUTADOR / CELULAR</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const compressed = await compressImageFile(file, 1280, 960, 0.82);
                            setServerSettings({
                              ...serverSettings,
                              whatToExpectImage: compressed
                            });
                            showSuccess('Nova foto carregada e otimizada! Clique em Salvar Alterações para publicar.');
                          } catch (err: unknown) {
                            showError(err instanceof Error ? err.message : 'Erro ao processar imagem.');
                          }
                        }
                      }}
                    />
                  </label>

                  {/* Reset to default */}
                  <button
                    type="button"
                    onClick={() => {
                      setServerSettings({
                        ...serverSettings,
                        whatToExpectImage: '/harbor_explore.jpg'
                      });
                      showSuccess('Imagem padrão restaurada no preview.');
                    }}
                    className="px-3.5 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Restaurar Imagem Padrão
                  </button>
                </div>
              </div>

              {/* Link Padrão do LivePix */}
              <div className="pt-4 border-t border-white/[0.08] space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-[#00e676] rounded-full shadow-[0_0_8px_#00e676]" />
                  <label className="block text-xs font-black font-heading text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span className="text-[#00e676]">⚡</span>
                    <span>Link Padrão do LivePix do Servidor</span>
                  </label>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Link principal do LivePix da sua conta/servidor (ex: <code className="text-[#00e676] font-mono">https://livepix.gg/netcraftbr</code>). Usado automaticamente no checkout quando um VIP ou item não tiver um link individual cadastrado.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={serverSettings.livePixUrl || ''}
                    onChange={e => setServerSettings({ ...serverSettings, livePixUrl: e.target.value })}
                    placeholder="https://livepix.gg/seunick"
                    className="flex-1 px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] focus:border-[#00e676] rounded-lg text-xs font-mono text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!adminToken) return;
                      try {
                        const clean = (serverSettings.livePixUrl || '').trim();
                        await api.updateLivePixUrl(clean, adminToken);
                        await saveSettingsToFirestore({ ...serverSettings, livePixUrl: clean }).catch(() => {});
                        showSuccess('Link do LivePix salvo com sucesso!');
                        await onRefreshGlobalData();
                      } catch (err: unknown) {
                        showError(err instanceof Error ? err.message : 'Erro ao salvar link do LivePix.');
                      }
                    }}
                    className="px-4 py-2.5 bg-[#00e676] hover:bg-[#00c853] text-black font-bold font-heading text-xs rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    Salvar LivePix
                  </button>
                </div>
              </div>

              {/* Link ou Chave Padrão de Cobrança PIX */}
              <div className="pt-4 border-t border-white/[0.08] space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
                  <label className="block text-xs font-black font-heading text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span className="text-cyan-400">💠</span>
                    <span>Link ou Chave Padrão de Cobrança PIX</span>
                  </label>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Link ou chave PIX principal do servidor (ex: link de cobrança do Mercado Pago, Nubank, PicPay ou chave Pix). Usado no checkout para quem escolher pagar via PIX direto caso o item não tenha um link individual.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={serverSettings.pixUrl || ''}
                    onChange={e => setServerSettings({ ...serverSettings, pixUrl: e.target.value })}
                    placeholder="https://link.mercadopago.com.br/... ou sua chave PIX"
                    className="flex-1 px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] focus:border-cyan-400 rounded-lg text-xs font-mono text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!adminToken) return;
                      try {
                        const clean = (serverSettings.pixUrl || '').trim();
                        await api.updatePixUrl(clean, adminToken);
                        await saveSettingsToFirestore({ ...serverSettings, pixUrl: clean }).catch(() => {});
                        showSuccess('Link de cobrança PIX padrão salvo com sucesso!');
                        await onRefreshGlobalData();
                      } catch (err: unknown) {
                        showError(err instanceof Error ? err.message : 'Erro ao salvar link do PIX.');
                      }
                    }}
                    className="px-4 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-black font-bold font-heading text-xs rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    Salvar PIX
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
            >
              Salvar Alterações
            </button>
          </form>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL: EDIT VIP */}
      {/* ============================================================== */}
      {editingVip && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1017] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white font-heading">
              {editingVip.id ? `Editar VIP: ${editingVip.name}` : 'Criar Novo VIP'}
            </h3>

            <form onSubmit={handleSaveVip} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Nome do VIP</label>
                  <input
                    type="text"
                    required
                    value={editingVip.name || ''}
                    onChange={e => setEditingVip({ ...editingVip, name: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                    placeholder="Ex: Diamante"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Preço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingVip.price ?? 0}
                    onChange={e => setEditingVip({ ...editingVip, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Duração</label>
                <input
                  type="text"
                  required
                  value={editingVip.duration || ''}
                  onChange={e => setEditingVip({ ...editingVip, duration: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="Ex: 30 dias ou Vitalício"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-300 font-bold mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-white">
                    <span className="text-[#00e676]">⚡</span> Link do LivePix deste VIP
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">https://livepix.gg/...</span>
                </label>
                <input
                  type="url"
                  value={editingVip.livepixUrl || ''}
                  onChange={e => setEditingVip({ ...editingVip, livepixUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] focus:border-[#00e676] rounded-lg text-xs font-mono text-white outline-none placeholder-zinc-600"
                  placeholder="https://livepix.gg/SEU_LINK_VIP"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Cole o link do LivePix específico para este plano VIP. Ao escolher LivePix no checkout, o jogador será direcionado para cá.
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-300 font-bold mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-white">
                    <span className="text-cyan-400">💠</span> Link de Cobrança PIX deste VIP
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">Mercado Pago / Nubank / etc.</span>
                </label>
                <input
                  type="text"
                  value={editingVip.pixUrl || ''}
                  onChange={e => setEditingVip({ ...editingVip, pixUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] focus:border-cyan-400 rounded-lg text-xs font-mono text-white outline-none placeholder-zinc-600"
                  placeholder="https://link.mercadopago.com.br/... ou sua chave PIX"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Cole o link de cobrança PIX específico deste VIP (Mercado Pago, Nubank, PicPay ou chave). Ao escolher PIX no checkout, o jogador será direcionado para este link.
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Benefícios (um por linha)</label>
                <textarea
                  rows={4}
                  value={editingVip.benefits?.join('\n') || ''}
                  onChange={e =>
                    setEditingVip({
                      ...editingVip,
                      benefits: e.target.value.split('\n').filter(b => b.trim())
                    })
                  }
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="Tag [VIP] exclusiva&#10;/fly em todas as áreas&#10;Kit diário com armadura"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="vip-active"
                  checked={editingVip.active !== false}
                  onChange={e => setEditingVip({ ...editingVip, active: e.target.checked })}
                  className="rounded accent-emerald-500 cursor-pointer"
                />
                <label htmlFor="vip-active" className="text-xs text-zinc-300 cursor-pointer">
                  VIP ativo e visível na loja
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEditingVip(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.03] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
                >
                  Salvar VIP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDIT PRODUCT (ITEM DA LOJA) */}
      {/* ============================================================== */}
      {editingProduct && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1017] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white font-heading">
              {editingProduct.id ? `Editar Item: ${editingProduct.name}` : 'Criar Novo Item da Loja'}
            </h3>

            <form onSubmit={handleSaveProduct} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Nome do Item</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name || ''}
                    onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                    placeholder="Ex: Kit Gladiador"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Preço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingProduct.price ?? 0}
                    onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Categoria</label>
                  <select
                    value={editingProduct.category || 'kits'}
                    onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value as ProductCategory })}
                    className="w-full px-3 py-2 bg-[#090b10] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  >
                    <option value="kits">Kits</option>
                    <option value="itens">Itens</option>
                    <option value="cosmeticos">Cosméticos</option>
                    <option value="vips">VIPs</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Ordem de exibição</label>
                  <input
                    type="number"
                    value={editingProduct.order || 1}
                    onChange={e => setEditingProduct({ ...editingProduct, order: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Descrição</label>
                <textarea
                  rows={3}
                  value={editingProduct.description || ''}
                  onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="Detalhes sobre o item entregue no servidor"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Destaques / Itens inclusos (um por linha)</label>
                <textarea
                  rows={2}
                  value={editingProduct.highlights?.join('\n') || ''}
                  onChange={e =>
                    setEditingProduct({
                      ...editingProduct,
                      highlights: e.target.value.split('\n').filter(h => h.trim())
                    })
                  }
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="Espada de Netherite Sharpness V&#10;32 Maçãs Douradas"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-300 font-bold mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-white">
                    <span className="text-[#00e676]">⚡</span> Link do LivePix deste Item
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">https://livepix.gg/...</span>
                </label>
                <input
                  type="url"
                  value={editingProduct.livepixUrl || ''}
                  onChange={e => setEditingProduct({ ...editingProduct, livepixUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] focus:border-[#00e676] rounded-lg text-xs font-mono text-white outline-none placeholder-zinc-600"
                  placeholder="https://livepix.gg/SEU_LINK_ITEM"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Cole o link do LivePix específico para este item da loja. Ao escolher LivePix no checkout, o jogador será direcionado para cá.
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-300 font-bold mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-white">
                    <span className="text-cyan-400">💠</span> Link de Cobrança PIX deste Item
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">Mercado Pago / Nubank / etc.</span>
                </label>
                <input
                  type="text"
                  value={editingProduct.pixUrl || ''}
                  onChange={e => setEditingProduct({ ...editingProduct, pixUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] focus:border-cyan-400 rounded-lg text-xs font-mono text-white outline-none placeholder-zinc-600"
                  placeholder="https://link.mercadopago.com.br/... ou sua chave PIX"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Cole o link de cobrança PIX específico para este item (Mercado Pago, Nubank, PicPay ou chave). Ao escolher PIX no checkout, o jogador será direcionado para cá.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="prod-active"
                  checked={editingProduct.active !== false}
                  onChange={e => setEditingProduct({ ...editingProduct, active: e.target.checked })}
                  className="rounded accent-emerald-500 cursor-pointer"
                />
                <label htmlFor="prod-active" className="text-xs text-zinc-300 cursor-pointer">
                  Item ativo na loja
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.03] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
                >
                  Salvar Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDIT EVENT */}
      {/* ============================================================== */}
      {editingEvent && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1017] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white font-heading">
              {editingEvent.id ? `Editar Evento: ${editingEvent.name}` : 'Criar Novo Evento'}
            </h3>

            <form onSubmit={handleSaveEvent} className="space-y-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Nome do Evento</label>
                <input
                  type="text"
                  required
                  value={editingEvent.name || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="Ex: Torneio Gladiador Semanal"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Data</label>
                  <input
                    type="date"
                    required
                    value={editingEvent.date || ''}
                    onChange={e => setEditingEvent({ ...editingEvent, date: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Horário</label>
                  <input
                    type="text"
                    required
                    value={editingEvent.time || ''}
                    onChange={e => setEditingEvent({ ...editingEvent, time: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                    placeholder="Ex: 19:30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Status</label>
                  <select
                    value={editingEvent.status || 'Próximo'}
                    onChange={e => setEditingEvent({ ...editingEvent, status: e.target.value as EventStatus })}
                    className="w-full px-3 py-2 bg-[#090b10] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  >
                    <option value="Próximo">Próximo</option>
                    <option value="Em andamento">Em andamento</option>
                    <option value="Encerrado">Encerrado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Local / Warp</label>
                  <input
                    type="text"
                    value={editingEvent.location || ''}
                    onChange={e => setEditingEvent({ ...editingEvent, location: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                    placeholder="/warp arena"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={editingEvent.description || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, description: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="Regras do evento, formato de batalha, etc."
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Premiações (uma por linha)</label>
                <textarea
                  rows={2}
                  value={editingEvent.rewards?.join('\n') || ''}
                  onChange={e =>
                    setEditingEvent({
                      ...editingEvent,
                      rewards: e.target.value.split('\n').filter(r => r.trim())
                    })
                  }
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="1º Lugar: VIP Bronze 7 dias&#10;2º Lugar: 50.000 Coins"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ev-published"
                  checked={editingEvent.published !== false}
                  onChange={e => setEditingEvent({ ...editingEvent, published: e.target.checked })}
                  className="rounded accent-emerald-500 cursor-pointer"
                />
                <label htmlFor="ev-published" className="text-xs text-zinc-300 cursor-pointer">
                  Evento publicado e visível para jogadores
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.03] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
                >
                  Salvar Evento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDIT NEWS */}
      {/* ============================================================== */}
      {editingNews && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1017] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white font-heading">
              {editingNews.id ? `Editar Notícia: ${editingNews.title}` : 'Criar Nova Notícia'}
            </h3>

            <form onSubmit={handleSaveNews} className="space-y-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Título</label>
                <input
                  type="text"
                  required
                  value={editingNews.title || ''}
                  onChange={e => setEditingNews({ ...editingNews, title: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="Ex: Atualização do Nether e Novas Arenas"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Categoria</label>
                  <select
                    value={editingNews.category || 'Atualização'}
                    onChange={e => setEditingNews({ ...editingNews, category: e.target.value as NewsCategory })}
                    className="w-full px-3 py-2 bg-[#090b10] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  >
                    <option value="Atualização">Atualização</option>
                    <option value="Evento">Evento</option>
                    <option value="Manutenção">Manutenção</option>
                    <option value="Novidade">Novidade</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Autor</label>
                  <input
                    type="text"
                    value={editingNews.author || 'Equipe NetCraftBR'}
                    onChange={e => setEditingNews({ ...editingNews, author: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Resumo (linha curta)</label>
                <input
                  type="text"
                  value={editingNews.summary || ''}
                  onChange={e => setEditingNews({ ...editingNews, summary: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="Breve resumo para exibição na página inicial"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Conteúdo da Notícia</label>
                <textarea
                  rows={4}
                  required
                  value={editingNews.content || ''}
                  onChange={e => setEditingNews({ ...editingNews, content: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="Texto completo com novidades e detalhes"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="news-published"
                  checked={editingNews.published !== false}
                  onChange={e => setEditingNews({ ...editingNews, published: e.target.checked })}
                  className="rounded accent-emerald-500 cursor-pointer"
                />
                <label htmlFor="news-published" className="text-xs text-zinc-300 cursor-pointer">
                  Publicado no site
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEditingNews(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.03] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
                >
                  Salvar Notícia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDIT COMMUNITY / REDE SOCIAL */}
      {/* ============================================================== */}
      {editingSocial && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1017] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white font-heading">
              {editingSocial.id ? `Editar Comunidade: ${editingSocial.name}` : 'Adicionar Nova Rede Social'}
            </h3>

            <form onSubmit={handleSaveSocial} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Nome da Rede / Comunidade</label>
                  <input
                    type="text"
                    required
                    value={editingSocial.name || ''}
                    onChange={e => setEditingSocial({ ...editingSocial, name: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                    placeholder="Ex: Discord Oficial"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Plataforma</label>
                  <select
                    value={editingSocial.platform || 'discord'}
                    onChange={e => setEditingSocial({ ...editingSocial, platform: e.target.value as SocialLink['platform'] })}
                    className="w-full px-3 py-2 bg-[#090b10] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  >
                    <option value="discord">Discord</option>
                    <option value="youtube">YouTube</option>
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Instagram</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="twitter">Twitter / X</option>
                    <option value="site">Site</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Link / URL</label>
                <input
                  type="url"
                  required
                  value={editingSocial.url || ''}
                  onChange={e => setEditingSocial({ ...editingSocial, url: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="https://discord.gg/exemplo"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Membros / Seguidores</label>
                  <input
                    type="text"
                    value={editingSocial.memberCount || ''}
                    onChange={e => setEditingSocial({ ...editingSocial, memberCount: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                    placeholder="Ex: +5.000 membros"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Ordem</label>
                  <input
                    type="number"
                    value={editingSocial.order || 1}
                    onChange={e => setEditingSocial({ ...editingSocial, order: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={editingSocial.description || ''}
                  onChange={e => setEditingSocial({ ...editingSocial, description: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none"
                  placeholder="Breve chamada para a comunidade"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="soc-active"
                  checked={editingSocial.active !== false}
                  onChange={e => setEditingSocial({ ...editingSocial, active: e.target.checked })}
                  className="rounded accent-emerald-500 cursor-pointer"
                />
                <label htmlFor="soc-active" className="text-xs text-zinc-300 cursor-pointer">
                  Comunidade ativa e visível no site
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEditingSocial(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.03] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
                >
                  Salvar Rede
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* UNIFIED CONFIRM DELETE MODAL */}
      {/* ============================================================== */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#0d1017] border border-rose-500/20 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white font-heading">Confirmar Exclusão</h3>
              <p className="text-xs text-zinc-400">
                Tem certeza que deseja apagar permanentemente{' '}
                <strong className="text-white font-semibold">{deleteConfirm.name}</strong>?
              </p>
              <p className="text-[11px] text-zinc-500">
                Esta ação remove o registro do servidor e sincroniza com o banco de dados.
              </p>
            </div>

            <div className="flex gap-2 justify-center pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.05] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-rose-950/50 transition-colors cursor-pointer flex items-center justify-center gap-1.5 min-w-[100px]"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <span>Sim, Excluir</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* BULK DELETE ORDERS MODAL */}
      {/* ============================================================== */}
      {isBulkDeleteOrdersOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#0d1017] border border-rose-500/30 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-heading">Excluir Pedidos em Massa</h3>
                <p className="text-xs text-zinc-400">Escolha quais pedidos deseja apagar permanentemente</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-zinc-300 block">Selecione o filtro de exclusão:</label>

              {/* Opção 1: Todos */}
              <div
                onClick={() => setBulkOrderFilter('all')}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  bulkOrderFilter === 'all'
                    ? 'border-rose-500/80 bg-rose-500/10 text-white'
                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-white">Todos os Pedidos</div>
                  <div className="text-[11px] text-zinc-400">Apaga absolutamente todos os pedidos do sistema</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/[0.08] text-white">
                  {orders.length}
                </span>
              </div>

              {/* Opção 2: Concluídos */}
              <div
                onClick={() => setBulkOrderFilter('concluidos')}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  bulkOrderFilter === 'concluidos'
                    ? 'border-rose-500/80 bg-rose-500/10 text-white'
                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-white">Somente Concluídos</div>
                  <div className="text-[11px] text-zinc-400">Pedidos com status 'Entregue' ou 'Pago'</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400">
                  {orders.filter(o => o.status === 'Entregue' || o.status === 'Pago').length}
                </span>
              </div>

              {/* Opção 3: Pendentes */}
              <div
                onClick={() => setBulkOrderFilter('pendentes')}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  bulkOrderFilter === 'pendentes'
                    ? 'border-rose-500/80 bg-rose-500/10 text-white'
                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-white">Somente Pendentes</div>
                  <div className="text-[11px] text-zinc-400">Pedidos aguardando pagamento</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-400">
                  {orders.filter(o => o.status === 'Pendente').length}
                </span>
              </div>

              {/* Opção 4: Cancelados */}
              <div
                onClick={() => setBulkOrderFilter('cancelados')}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  bulkOrderFilter === 'cancelados'
                    ? 'border-rose-500/80 bg-rose-500/10 text-white'
                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-white">Somente Cancelados</div>
                  <div className="text-[11px] text-zinc-400">Pedidos marcados como cancelados</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-400">
                  {orders.filter(o => o.status === 'Cancelado').length}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 pt-1">
              Esta ação é permanente e removerá os pedidos selecionados do servidor e da base de dados.
            </p>

            <div className="flex gap-2 justify-end pt-3">
              <button
                type="button"
                disabled={isBulkDeleting}
                onClick={() => setIsBulkDeleteOrdersOpen(false)}
                className="px-4 py-2 rounded-lg border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.05] disabled:opacity-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  isBulkDeleting ||
                  (bulkOrderFilter === 'all' && orders.length === 0) ||
                  (bulkOrderFilter === 'concluidos' && orders.filter(o => o.status === 'Entregue' || o.status === 'Pago').length === 0) ||
                  (bulkOrderFilter === 'pendentes' && orders.filter(o => o.status === 'Pendente').length === 0) ||
                  (bulkOrderFilter === 'cancelados' && orders.filter(o => o.status === 'Cancelado').length === 0)
                }
                onClick={handleBulkDeleteOrders}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-950/50 transition-colors cursor-pointer"
              >
                {isBulkDeleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar e Excluir</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MANUAL ADD PLAYER MODAL */}
      {/* ============================================================== */}
      {isAddingPlayer && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#0d1017] border border-white/[0.1] rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00e676]/15 border border-[#00e676]/30 flex items-center justify-center text-[#00e676] shrink-0">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-heading">Novo Jogador</h3>
                <p className="text-xs text-zinc-400">Cadastre manualmente um jogador no ecossistema</p>
              </div>
            </div>

            <form onSubmit={handleCreatePlayer} className="space-y-4 pt-1">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Nickname do Minecraft <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newPlayerNick}
                  onChange={e => setNewPlayerNick(e.target.value)}
                  placeholder="Ex: Steve_BR"
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] focus:border-[#00e676] rounded-xl text-xs text-white placeholder-zinc-500 outline-none"
                  autoFocus
                  maxLength={32}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Vincular Plano VIP (Opcional)
                </label>
                <select
                  value={newPlayerVipId}
                  onChange={e => setNewPlayerVipId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c1017] border border-white/[0.08] focus:border-[#00e676] rounded-xl text-xs text-white outline-none cursor-pointer"
                >
                  <option value="">Nenhum (Jogador Padrão)</option>
                  {vips.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.duration}) - R$ {v.price.toFixed(2).replace('.', ',')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  disabled={isSavingPlayer}
                  onClick={() => {
                    setIsAddingPlayer(false);
                    setNewPlayerNick('');
                    setNewPlayerVipId('');
                  }}
                  className="px-4 py-2 rounded-lg border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.05] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingPlayer || !newPlayerNick.trim()}
                  className="px-4 py-2 rounded-lg bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-[#00e676]/20 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isSavingPlayer ? (
                    <>
                      <span className="w-3 h-3 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin inline-block" />
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <span>Cadastrar Jogador</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
