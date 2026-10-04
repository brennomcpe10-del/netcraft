import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  VIP,
  Product,
  Order,
  ServerEvent,
  NewsArticle,
  ServerSettings,
  SocialLink,
  Player,
  SupportTicket,
  DashboardStats
} from '../../src/types/index.ts';
import {
  initialSettings,
  initialVips,
  initialProducts,
  initialEvents,
  initialNews,
  initialSocialLinks,
  initialPlayers,
  initialOrders
} from './initialData.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'database.json');

interface DatabaseSchema {
  settings: ServerSettings;
  vips: VIP[];
  products: Product[];
  orders: Order[];
  events: ServerEvent[];
  news: NewsArticle[];
  socialLinks: SocialLink[];
  players: Player[];
  tickets: SupportTicket[];
}

class Store {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadDatabase();
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent);
        return {
          settings: parsed.settings || initialSettings,
          vips: Array.isArray(parsed.vips) ? parsed.vips : initialVips,
          products: Array.isArray(parsed.products) ? parsed.products : initialProducts,
          orders: Array.isArray(parsed.orders) ? parsed.orders : initialOrders,
          events: Array.isArray(parsed.events) ? parsed.events : initialEvents,
          news: Array.isArray(parsed.news) ? parsed.news : initialNews,
          socialLinks: Array.isArray(parsed.socialLinks) ? parsed.socialLinks : initialSocialLinks,
          players: Array.isArray(parsed.players) ? parsed.players : initialPlayers,
          tickets: Array.isArray(parsed.tickets) ? parsed.tickets : []
        };
      }
    } catch (err) {
      console.error('Error reading database file, using fallback initial data:', err);
    }

    const defaultData: DatabaseSchema = {
      settings: initialSettings,
      vips: initialVips,
      products: initialProducts,
      orders: initialOrders,
      events: initialEvents,
      news: initialNews,
      socialLinks: initialSocialLinks,
      players: initialPlayers,
      tickets: []
    };

    this.saveDatabase(defaultData);
    return defaultData;
  }

  private saveDatabase(dataToSave: DatabaseSchema = this.data) {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write database file:', err);
    }
  }

  // --- SETTINGS ---
  getSettings(): ServerSettings {
    return this.data.settings;
  }

  updateSettings(partial: Partial<ServerSettings>): ServerSettings {
    this.data.settings = { ...this.data.settings, ...partial };
    this.saveDatabase();
    return this.data.settings;
  }

  // --- PLAYERS ---
  getPlayers(): Player[] {
    return this.data.players;
  }

  getPlayerByNickname(nickname: string): Player | undefined {
    return this.data.players.find(
      p => p.nickname.trim().toLowerCase() === nickname.trim().toLowerCase()
    );
  }

  getOrCreatePlayer(nickname: string): Player {
    const cleanNick = nickname.trim();
    let player = this.getPlayerByNickname(cleanNick);
    if (!player) {
      player = {
        id: `player-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        nickname: cleanNick,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        activeVips: [],
        totalSpent: 0,
        ordersCount: 0
      };
      this.data.players.push(player);
      this.saveDatabase();
    } else {
      player.lastActive = new Date().toISOString();
      this.saveDatabase();
    }
    return player;
  }

  updatePlayer(id: string, partial: Partial<Player>): Player | null {
    const index = this.data.players.findIndex(p => p.id === id);
    if (index === -1) return null;
    this.data.players[index] = { ...this.data.players[index], ...partial };
    this.saveDatabase();
    return this.data.players[index];
  }

  deletePlayer(id: string, nickname?: string): boolean {
    const cleanId = id.trim().toLowerCase();
    const cleanNick = (nickname || '').trim().toLowerCase();
    const prevLen = this.data.players.length;
    this.data.players = this.data.players.filter(p => {
      const matchId = p.id === id || p.id.toLowerCase() === cleanId;
      const matchNick = (cleanNick && p.nickname.toLowerCase() === cleanNick) || p.nickname.toLowerCase() === cleanId;
      return !matchId && !matchNick;
    });
    if (this.data.players.length !== prevLen) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  // --- VIPS ---
  getVips(includeInactive = false): VIP[] {
    let list = this.data.vips;
    if (!includeInactive) {
      list = list.filter(v => v.active);
    }
    return list.sort((a, b) => a.order - b.order);
  }

  getVipById(id: string): VIP | undefined {
    return this.data.vips.find(v => v.id === id);
  }

  createVip(vip: Omit<VIP, 'id'>): VIP {
    const newVip: VIP = {
      ...vip,
      id: `vip-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    this.data.vips.push(newVip);
    this.saveDatabase();
    return newVip;
  }

  updateVip(id: string, partial: Partial<VIP>): VIP | null {
    const index = this.data.vips.findIndex(v => v.id === id);
    if (index === -1) return null;
    this.data.vips[index] = { ...this.data.vips[index], ...partial };
    this.saveDatabase();
    return this.data.vips[index];
  }

  deleteVip(id: string, name?: string): boolean {
    const cleanId = id.trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();
    const prevLen = this.data.vips.length;
    this.data.vips = this.data.vips.filter(v => {
      const matchId = v.id === id || v.id.toLowerCase() === cleanId;
      const matchName = cleanName && v.name.trim().toLowerCase() === cleanName;
      return !matchId && !matchName;
    });
    if (this.data.vips.length !== prevLen) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  // --- PRODUCTS ---
  getProducts(includeInactive = false, category?: string): Product[] {
    let list = this.data.products;
    if (!includeInactive) {
      list = list.filter(p => p.active);
    }
    if (category && category !== 'all') {
      list = list.filter(p => p.category === category);
    }
    return list.sort((a, b) => a.order - b.order);
  }

  getProductById(id: string): Product | undefined {
    return this.data.products.find(p => p.id === id);
  }

  createProduct(prod: Omit<Product, 'id'>): Product {
    const newProduct: Product = {
      ...prod,
      id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    this.data.products.push(newProduct);
    this.saveDatabase();
    return newProduct;
  }

  updateProduct(id: string, partial: Partial<Product>): Product | null {
    const index = this.data.products.findIndex(p => p.id === id);
    if (index === -1) return null;
    this.data.products[index] = { ...this.data.products[index], ...partial };
    this.saveDatabase();
    return this.data.products[index];
  }

  deleteProduct(id: string, name?: string): boolean {
    const cleanId = id.trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();
    const prevLen = this.data.products.length;
    this.data.products = this.data.products.filter(p => {
      const matchId = p.id === id || p.id.toLowerCase() === cleanId;
      const matchName = cleanName && p.name.trim().toLowerCase() === cleanName;
      return !matchId && !matchName;
    });
    if (this.data.products.length !== prevLen) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  // --- ORDERS ---
  getOrders(): Order[] {
    return [...this.data.orders].reverse();
  }

  getOrderById(id: string): Order | undefined {
    return this.data.orders.find(o => o.id === id);
  }

  getOrdersByNickname(nickname: string): Order[] {
    const cleanNick = nickname.trim().toLowerCase();
    return this.data.orders
      .filter(o => o.buyerNickname.toLowerCase() === cleanNick || o.recipientNickname.toLowerCase() === cleanNick)
      .reverse();
  }

  createOrder(orderData: {
    buyerNickname: string;
    recipientNickname: string;
    productId: string;
    productName: string;
    productType: 'vip' | 'product';
    amount: number;
    paymentMethod: 'PIX' | 'Cartao' | 'Boleto';
  }): Order {
    const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const txId = `TX-${orderData.paymentMethod}-${Date.now().toString().slice(-6)}`;
    
    // Mock PIX payload
    const pixCode = `00020126580014BR.GOV.BCB.PIX0136netcraftbr-pagamentos-pix@srvmc.com520400005303986540${orderData.amount.toFixed(2)}5802BR5910NETCRAFTBR6009SAO PAULO62070503***6304${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const newOrder: Order = {
      id: orderId,
      buyerNickname: orderData.buyerNickname.trim(),
      recipientNickname: orderData.recipientNickname.trim(),
      productId: orderData.productId,
      productName: orderData.productName,
      productType: orderData.productType,
      amount: orderData.amount,
      createdAt: new Date().toISOString(),
      status: 'Pendente',
      transactionId: txId,
      paymentMethod: orderData.paymentMethod,
      pixCode,
      pixQrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixCode)}`
    };

    this.data.orders.push(newOrder);
    this.saveDatabase();
    return newOrder;
  }

  updateOrderStatus(orderId: string, status: Order['status']): Order | null {
    const order = this.data.orders.find(o => o.id === orderId);
    if (!order) return null;

    order.status = status;
    const now = new Date().toISOString();

    if (status === 'Pago' && !order.paidAt) {
      order.paidAt = now;
    }

    if (status === 'Pago' || status === 'Entregue') {
      if (!order.deliveredAt) {
        order.deliveredAt = now;
      }
      order.status = 'Entregue';

      // Deliver VIP/Product to recipient
      this.deliverOrderItems(order);
    }

    this.saveDatabase();
    return order;
  }

  private deliverOrderItems(order: Order) {
    const recipient = this.getOrCreatePlayer(order.recipientNickname);
    const buyer = this.getPlayerByNickname(order.buyerNickname);

    if (buyer) {
      buyer.totalSpent = Number(((buyer.totalSpent || 0) + order.amount).toFixed(2));
      buyer.ordersCount = (buyer.ordersCount || 0) + 1;
    }

    if (order.productType === 'vip') {
      const vip = this.getVipById(order.productId);
      const isLifetime = vip ? vip.duration.toLowerCase().includes('vitalício') : false;
      const now = new Date();
      let expiresAt: string | null = null;

      if (!isLifetime) {
        const expDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        expiresAt = expDate.toISOString();
      }

      // Check if user already has this VIP, update or push
      const existingIdx = recipient.activeVips.findIndex(v => v.vipId === order.productId);
      if (existingIdx >= 0) {
        recipient.activeVips[existingIdx].expiresAt = expiresAt;
        recipient.activeVips[existingIdx].activatedAt = now.toISOString();
      } else {
        recipient.activeVips.push({
          vipId: order.productId,
          vipName: order.productName,
          activatedAt: now.toISOString(),
          expiresAt
        });
      }
    }
  }

  deleteOrder(id: string): boolean {
    const clean = id.trim().toLowerCase().replace(/^#/, '');
    const prevLen = this.data.orders.length;
    this.data.orders = this.data.orders.filter(o => 
      o.id !== id && 
      o.id.toLowerCase() !== id.toLowerCase() &&
      o.id.toLowerCase().replace(/^#/, '') !== clean
    );
    if (this.data.orders.length !== prevLen) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  // --- EVENTS ---
  getEvents(includeUnpublished = false): ServerEvent[] {
    let list = this.data.events;
    if (!includeUnpublished) {
      list = list.filter(e => e.published);
    }
    return list;
  }

  createEvent(ev: Omit<ServerEvent, 'id'>): ServerEvent {
    const newEvent: ServerEvent = {
      ...ev,
      id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    this.data.events.push(newEvent);
    this.saveDatabase();
    return newEvent;
  }

  updateEvent(id: string, partial: Partial<ServerEvent>): ServerEvent | null {
    const index = this.data.events.findIndex(e => e.id === id);
    if (index === -1) return null;
    this.data.events[index] = { ...this.data.events[index], ...partial };
    this.saveDatabase();
    return this.data.events[index];
  }

  deleteEvent(id: string, name?: string): boolean {
    const cleanId = id.trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();
    const prevLen = this.data.events.length;
    this.data.events = this.data.events.filter(e => {
      const matchId = e.id === id || e.id.toLowerCase() === cleanId;
      const matchName = cleanName && e.name.trim().toLowerCase() === cleanName;
      return !matchId && !matchName;
    });
    if (this.data.events.length !== prevLen) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  // --- NEWS ---
  getNews(includeUnpublished = false): NewsArticle[] {
    let list = this.data.news;
    if (!includeUnpublished) {
      list = list.filter(n => n.published);
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  createNews(article: Omit<NewsArticle, 'id'>): NewsArticle {
    const newArticle: NewsArticle = {
      ...article,
      id: `news-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    this.data.news.push(newArticle);
    this.saveDatabase();
    return newArticle;
  }

  updateNews(id: string, partial: Partial<NewsArticle>): NewsArticle | null {
    const index = this.data.news.findIndex(n => n.id === id);
    if (index === -1) return null;
    this.data.news[index] = { ...this.data.news[index], ...partial };
    this.saveDatabase();
    return this.data.news[index];
  }

  deleteNews(id: string, title?: string): boolean {
    const cleanId = id.trim().toLowerCase();
    const cleanTitle = (title || '').trim().toLowerCase();
    const prevLen = this.data.news.length;
    this.data.news = this.data.news.filter(n => {
      const matchId = n.id === id || n.id.toLowerCase() === cleanId;
      const matchTitle = cleanTitle && n.title.trim().toLowerCase() === cleanTitle;
      return !matchId && !matchTitle;
    });
    if (this.data.news.length !== prevLen) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  // --- SOCIAL LINKS ---
  getSocialLinks(): SocialLink[] {
    return this.data.socialLinks;
  }

  updateSocialLink(id: string, partial: Partial<SocialLink>): SocialLink | null {
    const index = this.data.socialLinks.findIndex(s => s.id === id);
    if (index === -1) return null;
    this.data.socialLinks[index] = { ...this.data.socialLinks[index], ...partial };
    this.saveDatabase();
    return this.data.socialLinks[index];
  }

  createSocialLink(link: Omit<SocialLink, 'id'>): SocialLink {
    const newLink: SocialLink = {
      ...link,
      id: `soc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    this.data.socialLinks.push(newLink);
    this.saveDatabase();
    return newLink;
  }

  deleteSocialLink(id: string, name?: string): boolean {
    const cleanId = id.trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();
    const prevLen = this.data.socialLinks.length;
    this.data.socialLinks = this.data.socialLinks.filter(s => {
      const matchId = s.id === id || s.id.toLowerCase() === cleanId;
      const matchName = cleanName && s.name.trim().toLowerCase() === cleanName;
      return !matchId && !matchName;
    });
    if (this.data.socialLinks.length !== prevLen) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  // --- TICKETS ---
  getTickets(): SupportTicket[] {
    return [...this.data.tickets].reverse();
  }

  createTicket(t: Omit<SupportTicket, 'id' | 'createdAt' | 'status'>): SupportTicket {
    const newTicket: SupportTicket = {
      ...t,
      id: `TCK-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'Aberto',
      createdAt: new Date().toISOString()
    };
    this.data.tickets.push(newTicket);
    this.saveDatabase();
    return newTicket;
  }

  updateTicket(id: string, partial: Partial<SupportTicket>): SupportTicket | null {
    const index = this.data.tickets.findIndex(t => t.id === id);
    if (index === -1) return null;
    this.data.tickets[index] = { ...this.data.tickets[index], ...partial };
    this.saveDatabase();
    return this.data.tickets[index];
  }

  // --- DASHBOARD STATS ---
  getDashboardStats(): DashboardStats {
    const orders = this.data.orders;
    const paidOrders = orders.filter(o => o.status === 'Pago' || o.status === 'Entregue');
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const vipsSold = paidOrders.filter(o => o.productType === 'vip').length;

    return {
      playersCount: this.data.players.length,
      ordersCount: orders.length,
      pendingOrdersCount: orders.filter(o => o.status === 'Pendente').length,
      paidOrdersCount: paidOrders.length,
      vipsSoldCount: vipsSold,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      recentOrders: orders.slice(-10).reverse(),
      recentPlayers: this.data.players.slice(-10).reverse()
    };
  }
}

export const dbStore = new Store();
