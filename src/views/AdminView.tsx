import {IdentityManager} from "../components/IdentityManager.tsx";
import {RevenuePanel} from "../components/RevenuePanel.tsx";
import {revenueReport,brasiliaPeriod} from "../lib/revenue.ts";
import {formatStoredMoney} from '../lib/adminDisplay.ts';
import {ProductManager} from "../components/ProductManager.tsx";
import {CategoryManager} from "../components/CategoryManager.tsx";
import {useStoreCategories} from "../hooks/useStoreCategories.ts";
import React, { useState, useEffect } from 'react';
import { useAdmin } from '../context/AdminContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { api } from '../lib/api.ts';
import {
  DashboardStats,
  VIP,
  Product,
  Order,
  PixTestOrderSummary,
  Player,
  ServerEvent,
  EventStatus,
  NewsArticle,
  NewsCategory,
  ServerSettings,
  SocialLink,
  SupportTicket,
  Coupon
} from '../types/index.ts';
import { Plus, Edit2, Trash2, ArrowLeft, Search, ExternalLink, Check, Upload, Image as ImageIcon, Ticket, Tag, Percent, Copy, ToggleLeft, ToggleRight } from 'lucide-react';
import { compressImageFile } from '../lib/imageUtils.ts';
import {
  saveVipToFirestore,
  deleteVipFromFirestore,
  getVipsFromFirestore,
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
  saveSocialLinkToFirestore,
  deleteCommunityLinkFromFirestore,
  deleteSocialLinkFromFirestore,
  getCommunityFromFirestore,
  saveOrderToFirestore,
  updateOrderStatusInFirestore,
  deleteOrderFromFirestore,
  deleteOrdersBulkFromFirestore,
  getOrdersFromFirestore,
  getCouponsFromFirestore,
  saveCouponToFirestore,
  deleteCouponFromFirestore,
  deletePlayerFromFirestore,
  deleteUserFromFirestore,
  getPlayersFromFirestore,
  savePlayerToFirestore,
  getStatsFromFirestore
} from '../lib/firestoreSync.ts';

function pixTestStateLabel(order: PixTestOrderSummary, now = Date.now()): string {
  // A reservation may be left in "creating" after a sandbox gateway error.
  // This is display-only: never infer a payment, refund or change Firestore state.
  if (order.state === 'creating' && !order.providerOrderId &&
      order.expiresAt && Date.parse(order.expiresAt) <= now)
    return 'Criação não confirmada (teste)';
  const labels: Record<PixTestOrderSummary['state'], string> = {
    creating: 'Criando cobrança (teste)',
    pending: 'Aguardando teste',
    processing: 'Processando teste',
    approved: 'Aprovado (simulado)',
    expired: 'Expirado (teste)',
    cancelled: 'Cancelado (teste)',
    refunded: 'Devolvido (teste)',
    unknown: 'Status não identificado',
  };
  return labels[order.state];
}

interface AdminViewProps {
  onExit: () => void;
  onRefreshGlobalData: () => Promise<void>;
}

export const AdminView: React.FC<AdminViewProps> = ({ onExit, onRefreshGlobalData }) => {
  const managedCategories=useStoreCategories();
  const [adminProductCategory,setAdminProductCategory]=useState("all");
  const { adminToken, logoutAdmin } = useAdmin();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<
    'identity' | 'categories' | 'dashboard' | 'vips' | 'orders' | 'coupons' | 'tickets' | 'players' | 'store' | 'events' | 'news' | 'community' | 'server' | 'settings'
  >('dashboard');

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [vips, setVips] = useState<VIP[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pixTestOrders, setPixTestOrders] = useState<PixTestOrderSummary[]>([]);
  const [pixTestLoading, setPixTestLoading] = useState(false);
  const [pixTestError, setPixTestError] = useState('');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsError, setTicketsError] = useState('');
  const [ticketReplies, setTicketReplies] = useState<Record<string,string>>({});
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [serverSettings, setServerSettings] = useState<ServerSettings | null>(null);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [couponFilter, setCouponFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [copiedCouponCode, setCopiedCouponCode] = useState<string | null>(null);

  // Modals for editing / creating
  const [editingVip, setEditingVip] = useState<Partial<VIP> | null>(null);
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> | null>(null);
  const [editingEvent, setEditingEvent] = useState<Partial<ServerEvent> | null>(null);
  const [editingNews, setEditingNews] = useState<Partial<NewsArticle> | null>(null);
  const [editingSocial, setEditingSocial] = useState<Partial<SocialLink> | null>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'vip' | 'order' | 'player' | 'event' | 'news' | 'community' | 'coupon';
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

  const loadPixTestOrders = async () => {
    if (!adminToken) return;
    setPixTestLoading(true);
    setPixTestError('');
    try {
      setPixTestOrders(await api.getPixTestOrders(adminToken));
    } catch (error) {
      setPixTestError(error instanceof Error ? error.message : 'Não foi possível consultar as simulações.');
    } finally {
      setPixTestLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken && activeTab === 'orders') {
      void loadPixTestOrders();
    }
  }, [adminToken, activeTab]);

  useEffect(() => {
    if (adminToken) {
      loadData();
    }
  }, [adminToken]);

  const loadData = async () => {
    if (!adminToken) return;
    try {
      const [
        vipsResult,
        prodsResult,
        ordersResult,
        couponsResult,
        playersResult,
        ticketsResult,
        eventsResult,
        newsResult,
        socialResult,
        settingsResult
      ] = await Promise.allSettled([
        api.getVips(true, adminToken),
        api.getProducts(true, undefined, adminToken),
        api.getAllOrders(adminToken),
        api.getCoupons(adminToken),
        api.getAdminPlayers(adminToken),
        api.getTickets(adminToken),
        api.getEvents(true, adminToken),
        api.getNews(true, adminToken),
        api.getCommunity(true, adminToken),
        api.getSettings()
      ]);

      const loadedOrders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
      const loadedPlayers = playersResult.status === 'fulfilled' ? playersResult.value : [];
      let loadedCoupons = couponsResult.status === 'fulfilled' ? couponsResult.value : [];

      // Coupon data is private. The authenticated API is its sole read source.
      if (vipsResult.status === 'fulfilled') setVips(vipsResult.value);
      if (prodsResult.status === 'fulfilled') setProducts(prodsResult.value);
      if (ordersResult.status === 'fulfilled') setOrders(loadedOrders);
      setCoupons(loadedCoupons);
      if (playersResult.status === 'fulfilled') setPlayers(loadedPlayers);
      if (ticketsResult.status === 'fulfilled') {
        setTickets(ticketsResult.value);
        setTicketsError('');
      } else {
        setTicketsError('Não foi possível carregar os chamados do backend. Não foi feita nenhuma alteração.');
      }
      if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value);
      if (newsResult.status === 'fulfilled') setNews(newsResult.value);
      if (socialResult.status === 'fulfilled') setSocialLinks(socialResult.value);
      if (settingsResult.status === 'fulfilled' && settingsResult.value) setServerSettings(settingsResult.value);

      // All order history is retrieved via the authenticated Admin API.
      // Never use public Firestore order reads or fabricated zero revenue.
      if (ordersResult.status === 'fulfilled') {
        const paid = loadedOrders.filter(o => o.status === 'Pago' || o.status === 'Entregue');
        const rev = revenueReport(loadedOrders,brasiliaPeriod(new Date())!).totalCents / 100;
        setStats({
          playersCount: loadedPlayers.length,
          ordersCount: loadedOrders.length,
          pendingOrdersCount: loadedOrders.filter(o => o.status === 'Pendente').length,
          paidOrdersCount: paid.length,
          vipsSoldCount: paid.filter(o => o.productType === 'vip').length,
          totalRevenue: Number(rev.toFixed(2)),
          recentOrders: loadedOrders.slice(0,10),
          recentPlayers: loadedPlayers.slice(-10).reverse()
        });
      } else {
        showError('Não foi possível consultar o histórico de pedidos no servidor.');
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao carregar dados do painel');
    }
  };

  // -------------------------------------------------------------
  // SAVE HANDLERS (GUARANTEES STABLE IDs & DIRECT FIRESTORE FIRST)
  // -------------------------------------------------------------
  const handleSaveVip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVip || !adminToken) return;
    try {
      const isEditing = !!editingVip.id;
      const vipId = editingVip.id ? String(editingVip.id).trim() : `vip-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const savedVip: VIP = {
        ...editingVip,
        id: vipId,
        name: editingVip.name || 'VIP Novo',
        price: Number(editingVip.price) || 0,
        duration: editingVip.duration || '30 dias',
        description: editingVip.description || '',
        benefits: Array.isArray(editingVip.benefits) ? editingVip.benefits : [],
        color: editingVip.color || 'emerald',
        image: editingVip.image || 'crown',
        order: Number(editingVip.order) || 1,
        active: editingVip.active !== false,
        isPopular: !!editingVip.isPopular,
        livepixUrl: editingVip.livepixUrl ? String(editingVip.livepixUrl).trim() : '',
        pixUrl: editingVip.pixUrl ? String(editingVip.pixUrl).trim() : ''
      };

      // The authenticated backend owns VIP catalogue mutations and prices.
      const persisted = isEditing
        ? await api.updateVip(vipId, savedVip, adminToken)
        : await api.createVip(savedVip, adminToken);
      setVips(prev => [...prev.filter(v => v.id !== persisted.id), persisted]);
      showSuccess(isEditing ? 'VIP atualizado com sucesso' : 'VIP criado com sucesso');

      setEditingVip(null);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao salvar VIP');
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
      const rawId = String(id).trim();
      // 1. Optimistic UI update so user doesn't wait
      setOrders(prev =>
        prev.map(o => (o.id === rawId || o.id.replace(/^#/, '') === rawId.replace(/^#/, '')) ? { ...o, status } : o)
      );

      await api.updateOrderStatus(rawId, status, adminToken);

      showSuccess(`Status do pedido alterado para "${status}" com sucesso!`);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      console.error('Erro ao atualizar status do pedido:', err);
      await loadData();
      showError(err instanceof Error ? err.message : 'Erro ao atualizar status do pedido.');
    }
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoupon || !adminToken) return;

    const rawCode = (editingCoupon.code || '').trim().toUpperCase();
    if (!rawCode) {
      showError('O código do cupom é obrigatório.');
      return;
    }
    const discountVal = Number(editingCoupon.discountValue) || 0;
    if (discountVal <= 0) {
      showError('Informe um valor de desconto maior que zero.');
      return;
    }
    if (editingCoupon.discountType === 'percentage' && discountVal > 100) {
      showError('O desconto percentual não pode ser maior que 100%.');
      return;
    }

    const isEditing = !!editingCoupon.id;
    const duplicate = coupons.find(c =>
      (!isEditing || c.id !== editingCoupon.id) &&
      c.code.trim().toUpperCase() === rawCode
    );
    if (duplicate) {
      showError(`Já existe um cupom cadastrado com o código "${rawCode}".`);
      return;
    }

    try {
      const couponId = editingCoupon.id || `cupom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const payload: Coupon = {
        id: couponId,
        code: rawCode,
        discountType: editingCoupon.discountType || 'percentage',
        discountValue: discountVal,
        minOrderValue: editingCoupon.minOrderValue ? Number(editingCoupon.minOrderValue) : 0,
        maxUses: editingCoupon.maxUses ? Number(editingCoupon.maxUses) : null,
        usedCount: editingCoupon.usedCount || 0,
        expiresAt: editingCoupon.expiresAt || null,
        active: editingCoupon.active !== false,
        description: editingCoupon.description ? String(editingCoupon.description).trim() : '',
        createdAt: editingCoupon.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Coupon rules and usage are persisted by the authenticated backend.
      if (isEditing) {
        await api.updateCoupon(couponId, payload, adminToken);
      } else {
        await api.createCoupon(payload, adminToken);
      }

      showSuccess(isEditing ? `Cupom "${rawCode}" atualizado com sucesso!` : `Cupom "${rawCode}" criado com sucesso!`);
      setEditingCoupon(null);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao salvar cupom de desconto');
    }
  };

  const handleToggleCouponActive = async (coupon: Coupon) => {
    if (!adminToken) return;
    try {
      const nextActive = !coupon.active;
      const updated: Coupon = {
        ...coupon,
        active: nextActive,
        updatedAt: new Date().toISOString()
      };
      setCoupons(prev => prev.map(c => c.id === coupon.id ? updated : c));

      await api.updateCoupon(coupon.id, { active: nextActive }, adminToken);

      showSuccess(`Cupom "${coupon.code}" ${nextActive ? 'ativado' : 'desativado'} com sucesso!`);
      await loadData();
      await onRefreshGlobalData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao alterar status do cupom');
      await loadData();
    }
  };

  const handleBulkDeleteOrders = async () => {
    if (!adminToken || isBulkDeleting) return;
    try {
      setIsBulkDeleting(true);
      const res = await api.deleteOrdersBulk(bulkOrderFilter, adminToken);
      // The admin API is responsible for all Firestore order changes.

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

  const saveTicket = async (id:string, update:Pick<Partial<SupportTicket>,'status'|'reply'>) => {
    if (!adminToken || savingTicketId) return;
    setSavingTicketId(id);
    try {
      const persisted = await api.updateTicket(id, update, adminToken);
      setTickets(previous => previous.map(t => t.id === persisted.id ? persisted : t));
      showSuccess('Chamado atualizado com sucesso.');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Não foi possível atualizar o chamado.');
    } finally {
      setSavingTicketId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverSettings || !adminToken) return;
    try {
      await api.updateSettings(serverSettings, adminToken);
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
      case 'coupon':
        setCoupons(prev => prev.filter(c => c.id !== id && c.id.toLowerCase() !== lowerId && c.code.toLowerCase() !== cleanName));
        break;
    }

    try {
      // 2. Perform deletions concurrently on server & Firestore
      switch (type) {
        case 'vip':
          await api.deleteVip(id, adminToken, name);
          showSuccess(`VIP ${name} excluído com sucesso`);
          break;
        case 'order':
          await api.deleteOrder(id, adminToken);
          showSuccess(`Pedido #${id} excluído com sucesso`);
          break;
        case 'player':
          await api.deletePlayer(id, adminToken, extraNickname || name);
          showSuccess(`Jogador ${name} removido do sistema`);
          break;
        case 'event':
          await api.deleteEvent(id, adminToken, name);
          showSuccess(`Evento ${name} excluído com sucesso`);
          break;
        case 'news':
          await api.deleteNews(id, adminToken, name);
          showSuccess(`Notícia ${name} excluída com sucesso`);
          break;
        case 'community':
          await api.deleteSocialLink(id, adminToken, name);
          showSuccess(`Comunidade ${name} excluída com sucesso`);
          break;
        case 'coupon':
          await api.deleteCoupon(id, adminToken);
          showSuccess(`Cupom "${name}" excluído com sucesso`);
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
    { id: 'coupons', label: 'Cupons' },
    { id: 'players', label: 'Jogadores' },
    { id: 'tickets', label: 'Chamados' },
    { id: 'store', label: 'Loja' },
    { id: 'categories', label: 'Categorias' },
    { id: 'identity', label: 'Identidade Visual' },
    { id: 'events', label: 'Eventos' },
    { id: 'news', label: 'Notícias' },
    { id: 'community', label: 'Comunidade' },
    { id: 'server', label: 'Servidor' },
    { id: 'settings', label: 'Configurações' }
  ] as const;

  return (
    <div className="min-h-screen bg-[#07090d] text-zinc-200 text-xs">
      {/* Top Header */}
      <header className="border-b border-white/[0.06] bg-[#090b10] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar ao site</span>
            <span className="sm:hidden">Voltar</span>
          </button>
          <span className="text-zinc-600 shrink-0">|</span>
          <span className="font-bold text-white font-heading text-xs sm:text-sm truncate">
            Painel Administrativo NetCraftBR
          </span>
        </div>

        <button
          onClick={() => {
            logoutAdmin();
            onExit();
          }}
          className="text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer font-medium shrink-0 ml-2"
        >
          Sair
        </button>
      </header>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
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

        {activeTab === 'identity' && <IdentityManager />}
        {activeTab === 'categories' && <CategoryManager onManageProducts={id=>{setAdminProductCategory(id);setActiveTab('store');}}/>}
        {/* ============================================================== */}
        {/* 1. DASHBOARD */}
        {/* ============================================================== */}
        {activeTab === 'dashboard' && stats && (
          <div className="space-y-10">
            <RevenuePanel />
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
                        {formatStoredMoney(o.amount)}
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

            <section className="rounded-xl border border-emerald-500/20 bg-white/[0.02] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Pix de teste · Mercado Pago Orders API</h3>
                  <p className="text-zinc-400 text-[11px] mt-1">
                    Últimas 50 simulações, somente leitura. Não são vendas reais,
                    não entram no faturamento e não geram entregas Minecraft.
                    Tentativas interrompidas não são pagamentos aprovados.
                  </p>
                </div>
                <button type="button" onClick={() => void loadPixTestOrders()} disabled={pixTestLoading}
                  className="text-xs border border-white/10 rounded-lg px-3 py-2 text-emerald-300 disabled:opacity-50">
                  {pixTestLoading ? 'Consultando…' : 'Atualizar testes Pix'}
                </button>
              </div>
              {pixTestError ? (
                <p role="alert" className="text-amber-300 text-xs">{pixTestError}</p>
              ) : pixTestLoading && pixTestOrders.length === 0 ? (
                <p role="status" className="text-zinc-400 text-xs">Consultando pedidos de teste…</p>
              ) : pixTestOrders.length === 0 ? (
                <p className="text-zinc-400 text-xs">Nenhum pedido de teste encontrado no banco.</p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {pixTestOrders.map(testOrder => (
                    <div key={testOrder.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-white text-xs">
                          {testOrder.gamertag} · {testOrder.linesCount} item(ns)
                        </div>
                        <div className="font-mono text-[10px] text-zinc-500 mt-1 break-all">
                          Teste #{testOrder.id.slice(0, 12)} · {testOrder.createdAt
                            ? new Date(testOrder.createdAt).toLocaleString('pt-BR')
                            : 'Data não disponível'}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="font-semibold text-white">
                          {(testOrder.totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                        <div className={testOrder.state === 'approved' ? 'text-emerald-400' : 'text-amber-300'}>
                          {pixTestStateLabel(testOrder)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

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
                      <div className="font-semibold text-white flex items-center gap-2 flex-wrap">
                        <span>{order.recipientNickname} • {order.productName}</span>
                        {order.couponCode && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                            <Ticket className="w-2.5 h-2.5" />
                            <span>{order.couponCode}</span>
                            {order.discountAmount ? (
                              <span>(-R$ {order.discountAmount.toFixed(2).replace('.', ',')})</span>
                            ) : null}
                          </span>
                        )}
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px] mt-0.5">
                        #{order.id} • Comprador: {order.buyerNickname} • {new Date(order.createdAt).toLocaleDateString('pt-BR')} • {order.paymentMethod}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="text-right">
                        <div className="font-bold text-white font-mono">
                          {formatStoredMoney(order.amount)}
                        </div>
                        {order.originalAmount && order.originalAmount > order.amount && (
                          <div className="text-[10px] text-zinc-500 line-through font-mono">
                            R$ {order.originalAmount.toFixed(2).replace('.', ',')}
                          </div>
                        )}
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
                        <option value="Reembolsado">Reembolsado</option>
                        <option value="Estornado">Estornado</option>
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
        {/* 3.1 CUPONS DE DESCONTO */}
        {/* ============================================================== */}
        {activeTab === 'coupons' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-emerald-400" />
                  <span>Cupons de Desconto</span>
                </h2>
                <p className="text-zinc-500 text-[11px]">
                  Crie, gerencie, ative ou desative cupons promocionais para seus jogadores
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditingCoupon({
                    code: '',
                    discountType: 'percentage',
                    discountValue: 10,
                    minOrderValue: 0,
                    maxUses: null,
                    expiresAt: null,
                    active: true,
                    description: ''
                  })
                }
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Cupom</span>
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Total de Cupons</span>
                <div className="text-xl font-bold text-white font-mono">{coupons.length}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/20 space-y-1">
                <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-mono">Cupons Ativos</span>
                <div className="text-xl font-bold text-emerald-400 font-mono">
                  {coupons.filter(c => c.active).length}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-cyan-500/[0.03] border border-cyan-500/20 space-y-1">
                <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-mono">Total de Usos</span>
                <div className="text-xl font-bold text-cyan-400 font-mono">
                  {coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0)}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-rose-500/[0.03] border border-rose-500/20 space-y-1">
                <span className="text-[10px] text-rose-400 uppercase tracking-wider font-mono">Expirados</span>
                <div className="text-xl font-bold text-rose-400 font-mono">
                  {coupons.filter(c => c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()).length}
                </div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {(['all', 'active', 'inactive', 'expired'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setCouponFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors shrink-0 ${
                      couponFilter === f
                        ? 'bg-white text-zinc-950 font-bold'
                        : 'text-zinc-400 hover:text-white bg-white/[0.03] border border-white/[0.06]'
                    }`}
                  >
                    {f === 'all' && 'Todos'}
                    {f === 'active' && 'Ativos'}
                    {f === 'inactive' && 'Inativos'}
                    {f === 'expired' && 'Expirados'}
                  </button>
                ))}
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar código ou descrição..."
                  className="w-full sm:w-64 px-3 py-1.5 pl-8 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none focus:border-emerald-500/50"
                />
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
              </div>
            </div>

            {/* Coupons List */}
            <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {coupons
                .filter(c => {
                  if (couponFilter === 'active' && !c.active) return false;
                  if (couponFilter === 'inactive' && c.active) return false;
                  if (couponFilter === 'expired') {
                    if (!c.expiresAt || new Date(c.expiresAt).getTime() >= Date.now()) return false;
                  }
                  if (!searchQuery) return true;
                  const s = searchQuery.toLowerCase();
                  return (
                    c.code.toLowerCase().includes(s) ||
                    (c.description && c.description.toLowerCase().includes(s))
                  );
                })
                .map(coupon => {
                  const isExpired = coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now();
                  const isLimitReached = coupon.maxUses && Number(coupon.usedCount || 0) >= Number(coupon.maxUses);

                  return (
                    <div
                      key={coupon.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-black text-white tracking-wider px-2 py-0.5 rounded bg-white/[0.06] border border-white/[0.1]">
                            {coupon.code}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(coupon.code);
                              setCopiedCouponCode(coupon.code);
                              setTimeout(() => setCopiedCouponCode(null), 2000);
                            }}
                            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                            title="Copiar código"
                          >
                            {copiedCouponCode === coupon.code ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <span className="px-2 py-0.5 rounded-full font-mono text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                            {coupon.discountType === 'percentage'
                              ? `${coupon.discountValue}% OFF`
                              : `R$ ${coupon.discountValue.toFixed(2).replace('.', ',')} OFF`}
                          </span>

                          {coupon.active ? (
                            <span className="px-2 py-0.5 rounded-full font-mono text-[10px] bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
                              Ativo
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full font-mono text-[10px] bg-zinc-800 border border-white/[0.08] text-zinc-400">
                              Inativo
                            </span>
                          )}

                          {isExpired && (
                            <span className="px-2 py-0.5 rounded-full font-mono text-[10px] bg-rose-950/60 border border-rose-500/40 text-rose-400">
                              Expirado
                            </span>
                          )}

                          {isLimitReached && (
                            <span className="px-2 py-0.5 rounded-full font-mono text-[10px] bg-amber-950/60 border border-amber-500/40 text-amber-400">
                              Esgotado
                            </span>
                          )}
                        </div>

                        {coupon.description && (
                          <p className="text-zinc-400 text-[11px]">{coupon.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-500 font-mono text-[11px] pt-0.5">
                          <span>
                            Usos:{' '}
                            <strong className="text-zinc-300">
                              {coupon.usedCount || 0}
                              {coupon.maxUses ? ` / ${coupon.maxUses}` : ' (ilimitado)'}
                            </strong>
                          </span>
                          {coupon.minOrderValue && coupon.minOrderValue > 0 ? (
                            <span>
                              Mínimo:{' '}
                              <strong className="text-zinc-300">
                                R$ {coupon.minOrderValue.toFixed(2).replace('.', ',')}
                              </strong>
                            </span>
                          ) : (
                            <span>Sem valor mínimo</span>
                          )}
                          <span>
                            Validade:{' '}
                            <strong className="text-zinc-300">
                              {coupon.expiresAt
                                ? new Date(coupon.expiresAt).toLocaleDateString('pt-BR')
                                : 'Indeterminada'}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {/* Toggle Ativo/Inativo Rápido */}
                        <button
                          type="button"
                          onClick={() => handleToggleCouponActive(coupon)}
                          title={coupon.active ? 'Desativar cupom' : 'Ativar cupom'}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                            coupon.active
                              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-white/[0.08]'
                          }`}
                        >
                          {coupon.active ? (
                            <>
                              <ToggleRight className="w-4 h-4 text-emerald-400" />
                              <span>Ativo</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-4 h-4 text-zinc-500" />
                              <span>Inativo</span>
                            </>
                          )}
                        </button>

                        {/* Editar */}
                        <button
                          type="button"
                          onClick={() => setEditingCoupon({ ...coupon })}
                          title="Editar Cupom"
                          className="text-zinc-400 hover:text-white p-1.5 rounded hover:bg-white/[0.05] transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Excluir */}
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteConfirm({
                              type: 'coupon',
                              id: coupon.id,
                              name: `Cupom ${coupon.code}`
                            })
                          }
                          title="Excluir Cupom"
                          className="text-zinc-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

              {coupons.length === 0 && (
                <div className="py-12 text-center space-y-2">
                  <Ticket className="w-8 h-8 text-zinc-600 mx-auto" />
                  <div className="text-zinc-400 font-semibold">Nenhum cupom cadastrado</div>
                  <p className="text-zinc-600 text-[11px]">
                    Clique em "Novo Cupom" acima para criar códigos promocionais de desconto para a loja.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CHAMADOS PRIVADOS - ACESSO EXCLUSIVO DO ADMINISTRADOR */}
        {activeTab === 'tickets' && (
          <section className="space-y-5">
            <div>
              <h2 className="font-bold text-base text-white">Chamados de suporte</h2>
              <p className="text-zinc-400 mt-1 text-xs">
                Mensagens privadas, consultadas pelo backend. Não compartilhe conteúdo de chamados publicamente.
              </p>
            </div>
            {ticketsError ? (
              <p role="alert" className="text-amber-300 py-5">{ticketsError}</p>
            ) : tickets.length === 0 ? (
              <p className="text-zinc-400 py-5">Nenhum chamado registrado.</p>
            ) : (
              <div className="space-y-4">
                {tickets.map(ticket => (
                  <article key={ticket.id} className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
                    <div className="flex flex-wrap gap-3 items-center justify-between">
                      <div>
                        <h3 className="font-bold text-white">{ticket.subject}</h3>
                        <p className="text-xs text-zinc-400 mt-1">
                          {ticket.nickname} · {ticket.category} · #{ticket.id}
                          {' · '}{new Date(ticket.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <select aria-label={`Status do chamado ${ticket.id}`}
                        value={ticket.status}
                        disabled={savingTicketId === ticket.id}
                        onChange={e=>void saveTicket(ticket.id,{status:e.target.value as SupportTicket['status']})}
                        className="bg-zinc-900 border border-white/20 text-zinc-100 rounded-lg p-2 text-xs">
                        <option value="Aberto">Aberto</option>
                        <option value="Em andamento">Em andamento</option>
                        <option value="Resolvido">Resolvido</option>
                        <option value="Fechado">Fechado</option>
                      </select>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words text-zinc-200">{ticket.message}</p>
                    <label className="block text-xs text-zinc-400">
                      Resposta da equipe
                      <textarea className="w-full mt-2 p-3 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100"
                        rows={3} maxLength={8000} value={ticketReplies[ticket.id] ?? ticket.reply ?? ''}
                        onChange={e=>setTicketReplies(prev=>({...prev,[ticket.id]:e.target.value}))}/>
                    </label>
                    <button type="button"
                      disabled={savingTicketId === ticket.id || (ticketReplies[ticket.id] ?? ticket.reply ?? '') === (ticket.reply ?? '')}
                      onClick={()=>void saveTicket(ticket.id,{reply:ticketReplies[ticket.id] ?? ticket.reply ?? ''})}
                      className="border border-emerald-500/40 px-3 py-2 rounded-lg text-emerald-300 disabled:opacity-40">
                      {savingTicketId === ticket.id ? 'Salvando…' : 'Salvar resposta'}
                    </button>
                    <p className="text-[11px] text-zinc-500">
                      Resposta registrada para a equipe. Não há envio automático ao jogador por nickname.
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
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
        {activeTab === 'store' && <ProductManager products={products} categories={managedCategories} initialCategory={adminProductCategory} onSave={async product=>{if(!adminToken)throw new Error('Entre no painel novamente.');const saved=products.some(p=>p.id===product.id)?await api.updateProduct(product.id,product,adminToken):await api.createProduct(product,adminToken);setProducts(previous=>[...previous.filter(p=>p.id!==saved.id),saved]);onRefreshGlobalData().catch(()=>{});return saved;}} onDelete={async id=>{if(!adminToken)throw new Error('Entre no painel novamente.');await api.deleteProduct(id,adminToken);setProducts(previous=>previous.filter(p=>p.id!==id));onRefreshGlobalData().catch(()=>{});}}/>}

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
              <label className="block">Categoria na loja<select value={editingVip.categoryId||'vips'} onChange={e=>setEditingVip({...editingVip,categoryId:e.target.value})} className="w-full px-3 py-2 bg-[#090b10] border border-white/10 rounded-lg">{managedCategories.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
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
      {editingCoupon && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#0d1017] border border-white/[0.08] rounded-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-heading">
                  {editingCoupon.id ? `Editar Cupom: ${editingCoupon.code}` : 'Criar Novo Cupom'}
                </h3>
                <p className="text-xs text-zinc-400">Configure as regras e descontos do cupom</p>
              </div>
            </div>

            <form onSubmit={handleSaveCoupon} className="space-y-3.5 pt-1">
              {/* Código */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Código do Cupom <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={editingCoupon.code || ''}
                    onChange={e =>
                      setEditingCoupon({
                        ...editingCoupon,
                        code: e.target.value.toUpperCase().replace(/\s+/g, '')
                      })
                    }
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs font-mono font-bold text-white outline-none focus:border-emerald-500/50 uppercase tracking-wider"
                    placeholder="Ex: RESET10, NETCRAFT20, CARNAVAL"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  O código é padronizado em maiúsculas sem espaços.
                </p>
              </div>

              {/* Tipo de Desconto */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Tipo de Desconto
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCoupon({ ...editingCoupon, discountType: 'percentage' })}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                      editingCoupon.discountType !== 'fixed'
                        ? 'border-emerald-500/80 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <Percent className="w-3.5 h-3.5" />
                    <span>Porcentagem (%)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCoupon({ ...editingCoupon, discountType: 'fixed' })}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                      editingCoupon.discountType === 'fixed'
                        ? 'border-emerald-500/80 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>Valor Fixo (R$)</span>
                  </button>
                </div>
              </div>

              {/* Valor do Desconto */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Valor do Desconto{' '}
                  <span className="text-zinc-500 font-normal">
                    {editingCoupon.discountType === 'fixed' ? '(em Reais R$)' : '(em %)'}
                  </span>
                  <span className="text-rose-400"> *</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={editingCoupon.discountType === 'fixed' ? '0.01' : '1'}
                    min="0.01"
                    max={editingCoupon.discountType === 'fixed' ? undefined : 100}
                    required
                    value={editingCoupon.discountValue ?? 10}
                    onChange={e =>
                      setEditingCoupon({
                        ...editingCoupon,
                        discountValue: parseFloat(e.target.value) || 0
                      })
                    }
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs font-mono text-white outline-none focus:border-emerald-500/50"
                    placeholder={editingCoupon.discountType === 'fixed' ? '15.00' : '10'}
                  />
                  <span className="absolute right-3 top-2 text-xs font-mono text-zinc-500">
                    {editingCoupon.discountType === 'fixed' ? 'R$' : '%'}
                  </span>
                </div>
              </div>

              {/* Valor Mínimo e Limite de Usos */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                    Valor Mínimo (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingCoupon.minOrderValue ?? 0}
                    onChange={e =>
                      setEditingCoupon({
                        ...editingCoupon,
                        minOrderValue: parseFloat(e.target.value) || 0
                      })
                    }
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs font-mono text-white outline-none focus:border-emerald-500/50"
                    placeholder="0.00 (sem mínimo)"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                    Limite de Usos
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editingCoupon.maxUses ?? ''}
                    onChange={e =>
                      setEditingCoupon({
                        ...editingCoupon,
                        maxUses: e.target.value ? parseInt(e.target.value) : null
                      })
                    }
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs font-mono text-white outline-none focus:border-emerald-500/50"
                    placeholder="Vazio = ilimitado"
                  />
                </div>
              </div>

              {/* Data de Expiração */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Data de Expiração (Opcional)
                </label>
                <input
                  type="date"
                  value={
                    editingCoupon.expiresAt
                      ? editingCoupon.expiresAt.split('T')[0]
                      : ''
                  }
                  onChange={e =>
                    setEditingCoupon({
                      ...editingCoupon,
                      expiresAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null
                    })
                  }
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none focus:border-emerald-500/50"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Deixe em branco para o cupom não ter prazo de validade.
                </p>
              </div>

              {/* Descrição / Campanha */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Descrição ou Campanha (Opcional)
                </label>
                <input
                  type="text"
                  value={editingCoupon.description || ''}
                  onChange={e =>
                    setEditingCoupon({ ...editingCoupon, description: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-white outline-none focus:border-emerald-500/50"
                  placeholder="Ex: Cupom de boas-vindas da nova temporada"
                />
              </div>

              {/* Status Ativo */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="coupon-active-checkbox"
                  checked={editingCoupon.active !== false}
                  onChange={e =>
                    setEditingCoupon({ ...editingCoupon, active: e.target.checked })
                  }
                  className="rounded accent-emerald-500 cursor-pointer w-4 h-4"
                />
                <label
                  htmlFor="coupon-active-checkbox"
                  className="text-xs font-medium text-zinc-300 cursor-pointer"
                >
                  Cupom Ativo para uso imediato pelos jogadores
                </label>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEditingCoupon(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.03] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold cursor-pointer transition-colors shadow-lg shadow-emerald-950/40"
                >
                  Salvar Cupom
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
                    <option value="pacotes">Pacotes</option>
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
