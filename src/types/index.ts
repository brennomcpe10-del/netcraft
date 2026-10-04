export type OrderStatus = 'Pendente' | 'Pago' | 'Cancelado' | 'Entregue';
export type PaymentMethod = 'LIVEPIX' | 'PIX' | 'Cartao' | 'Boleto';
export type EventStatus = 'Próximo' | 'Em andamento' | 'Encerrado';
export type NewsCategory = 'Atualização' | 'Evento' | 'Manutenção' | 'Novidade';
export type ProductCategory = 'vips' | 'kits' | 'itens' | 'cosmeticos' | 'outros';

export interface ActiveVip {
  vipId: string;
  vipName: string;
  activatedAt: string;
  expiresAt: string | null;
}

export interface Player {
  id: string;
  nickname: string;
  createdAt: string;
  lastActive: string;
  activeVips: ActiveVip[];
  totalSpent: number;
  ordersCount: number;
  avatarUrl?: string;
  bio?: string;
}

export interface VIP {
  id: string;
  name: string;
  price: number;
  duration: string;
  description: string;
  benefits: string[];
  color: 'emerald' | 'cyan' | 'blue' | 'purple' | 'amber';
  image: string;
  order: number;
  active: boolean;
  isPopular?: boolean;
  livepixUrl?: string;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  description: string;
  image: string;
  active: boolean;
  highlights: string[];
  order: number;
  livepixUrl?: string;
}

export interface Order {
  id: string;
  buyerNickname: string;
  recipientNickname: string;
  productId: string;
  productName: string;
  productType: 'vip' | 'product';
  amount: number;
  createdAt: string;
  status: OrderStatus;
  transactionId: string;
  paymentMethod: PaymentMethod;
  paidAt?: string;
  deliveredAt?: string;
  pixCode?: string;
  pixQrCodeUrl?: string;
}

export interface ServerEvent {
  id: string;
  name: string;
  description: string;
  date: string;
  time: string;
  status: EventStatus;
  image: string;
  rewards: string[];
  published: boolean;
  location?: string;
  order?: number;
}

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  summary: string;
  image: string;
  date: string;
  author: string;
  published: boolean;
  category: NewsCategory;
}

export interface ServerRule {
  id: string;
  title: string;
  description: string;
  category: 'Geral' | 'Construções' | 'Economia' | 'PvP';
}

export interface ServerSystem {
  id: string;
  title: string;
  description: string;
  icon: string;
  command?: string;
}

export interface ServerSettings {
  serverName: string;
  tagline: string;
  ip: string;
  port: number;
  version: string;
  motd: string;
  isOnline: boolean;
  onlinePlayersCount: number;
  maxPlayers: number;
  logoUrl?: string;
  announcementText?: string;
  rules: ServerRule[];
  systems: ServerSystem[];
  livePixUrl?: string;
  whatToExpectImage?: string;
}

export interface SocialLink {
  id: string;
  platform: 'discord' | 'youtube' | 'tiktok' | 'instagram' | 'whatsapp' | 'twitter' | 'site' | 'outros';
  name: string;
  url: string;
  icon: string;
  active: boolean;
  description: string;
  memberCount?: string;
  order?: number;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  enabled: boolean;
  order: number;
}

export interface MenuItem {
  id: string;
  label: string;
  target: string;
  enabled: boolean;
  order: number;
}

export interface PageConfig {
  id: string;
  title: string;
  description: string;
  image?: string;
  enabled: boolean;
  order: number;
}

export interface HomeConfig {
  heroTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  heroImage: string;
  primaryButtonText: string;
  secondaryButtonText: string;
  showIpBar: boolean;
  showAboutSection: boolean;
  aboutTitle: string;
  aboutDescription: string;
  aboutImage: string;
  showSystemsSection: boolean;
  systemsTitle: string;
  showVipsSection: boolean;
  vipsTitle: string;
  showNewsSection: boolean;
  newsTitle: string;
  showCommunitySection: boolean;
  communityTitle: string;
}

export interface AppearanceConfig {
  logoText: string;
  logoUrl: string;
  bgImage: string;
  heroImage: string;
  primaryAccent: string;
  secondaryAccent: string;
}

export interface SupportTicket {
  id: string;
  nickname: string;
  playerNickname?: string;
  category: string;
  subject: string;
  message: string;
  contact?: string;
  status: 'Aberto' | 'Em andamento' | 'Resolvido' | 'Fechado';
  createdAt: string;
  reply?: string;
  repliedAt?: string;
}

export interface DashboardStats {
  playersCount: number;
  ordersCount: number;
  pendingOrdersCount: number;
  paidOrdersCount: number;
  vipsSoldCount: number;
  totalRevenue: number;
  recentOrders: Order[];
  recentPlayers: Player[];
  activeEventsCount?: number;
  publishedNewsCount?: number;
}
