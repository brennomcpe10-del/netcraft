import {
  VIP,
  Product,
  Order,
  PixTestOrderSummary,
  ServerEvent,
  NewsArticle,
  ServerSettings,
  SocialLink,
  Player,
  SupportTicket,
  DashboardStats,
  PaymentMethod,
  Coupon
} from '../types/index.ts';

const API_BASE = '/api';

function notifyIfSessionExpired(status: number) {
  if (status === 401 || status === 403) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('admin:session_expired'));
    }
  }
}

async function handleAdminFetch<T>(res: Response, defaultError: string): Promise<T> {
  if (!res.ok) {
    notifyIfSessionExpired(res.status);
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || defaultError);
  }
  return res.json();
}

function getHeaders(adminToken?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (adminToken) {
    headers['Authorization'] = `Bearer ${adminToken}`;
  }
  return headers;
}

async function adminRequest<T>(path: string, options: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(`${API_BASE}${path}`, {...options, cache:'no-store', signal:AbortSignal.timeout(15000)}); }
  catch { throw new Error('Não foi possível conectar à API administrativa. Verifique sua conexão e tente novamente.'); }
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') throw new Error('A API administrativa não respondeu em JSON. Verifique o deploy e as rotas /api no Vercel.');
  if (!res.ok) throw new Error(data.error || `Falha no acesso administrativo (HTTP ${res.status}).`);
  return data as T;
}

export const api = {
  async uploadIdentity(value:{data:string;mime:string},token:string){const res=await fetch(`${API_BASE}/admin/identity/upload`,{method:'POST',headers:getHeaders(token),body:JSON.stringify(value)});return handleAdminFetch<{asset:import('./identity.ts').LogoAsset;uploadToken:string}>(res,'Não foi possível enviar o logo.');},
  async saveIdentity(value:unknown,token:string){const res=await fetch(`${API_BASE}/admin/identity`,{method:'PUT',headers:getHeaders(token),body:JSON.stringify(value)});return handleAdminFetch<import('./identity.ts').SiteIdentity>(res,'Não foi possível salvar a identidade visual.');},
  async getRevenue(period:string,token:string|null):Promise<import('./revenue.ts').RevenueReport>{const res=await fetch(`${API_BASE}/admin/revenue?period=${encodeURIComponent(period)}`,{headers:getHeaders(token),cache:'no-store'});return handleAdminFetch(res,'Não foi possível calcular o faturamento.');},
  // --- PLAYER / AUTH ---
  async loginPlayer(nickname: string): Promise<{ success: boolean; player: Player }> {
    const res = await fetch(`${API_BASE}/player/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ nickname })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao entrar com nickname.');
    }
    return res.json();
  },

  async getPlayer(nickname: string): Promise<Player> {
    const res = await fetch(`${API_BASE}/player/${encodeURIComponent(nickname)}`);
    if (!res.ok) throw new Error('Jogador não encontrado.');
    return res.json();
  },

  async getPlayerOrders(nickname: string): Promise<Order[]> {
    const res = await fetch(`${API_BASE}/player/${encodeURIComponent(nickname)}/orders`);
    if (!res.ok) throw new Error('Erro ao buscar pedidos do jogador.');
    return res.json();
  },

  // --- ADMIN AUTH ---
  async loginAdmin(password: string): Promise<{ success: boolean; token: string }> {
    return adminRequest('/admin/login', {method:'POST', headers:getHeaders(), body:JSON.stringify({password})});
  },

  async verifyAdmin(token: string): Promise<boolean> {
    const data = await adminRequest<{authenticated:boolean}>('/admin/verify', {headers:getHeaders(token)});
    return data.authenticated === true;
  },

  async saveStoreCategories(categories: import('./storeCategories.ts').StoreCategory[], token: string) {
    const res = await fetch(`${API_BASE}/admin/store-categories`, {method:'PUT',headers:getHeaders(token),body:JSON.stringify({categories})});
    return handleAdminFetch<{success:boolean}>(res, 'Não foi possível salvar as categorias.');
  },

  async logoutAdmin(token: string): Promise<void> {
    await fetch(`${API_BASE}/admin/logout`, {
      method: 'POST',
      headers: getHeaders(token)
    }).catch(() => {});
  },

  // --- SETTINGS ---
  async getSettings(): Promise<ServerSettings> {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Erro ao carregar configurações do servidor.');
    return res.json();
  },

  async updateSettings(settings: Partial<ServerSettings>, adminToken: string): Promise<ServerSettings> {
    const res = await fetch(`${API_BASE}/admin/settings`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(settings)
    });
    return handleAdminFetch<ServerSettings>(res, 'Erro ao atualizar configurações.');
  },

  async updateLivePixUrl(livePixUrl: string, adminToken: string): Promise<{ success: boolean; message: string; livePixUrl: string; settings: ServerSettings }> {
    const res = await fetch(`${API_BASE}/admin/settings/livepix`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify({ livePixUrl })
    });
    return handleAdminFetch<{ success: boolean; message: string; livePixUrl: string; settings: ServerSettings }>(
      res,
      'Erro ao atualizar link do LivePix.'
    );
  },

  async updatePixUrl(pixUrl: string, adminToken: string): Promise<{ success: boolean; message: string; pixUrl: string; settings: ServerSettings }> {
    const res = await fetch(`${API_BASE}/admin/settings/pix`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify({ pixUrl })
    });
    return handleAdminFetch<{ success: boolean; message: string; pixUrl: string; settings: ServerSettings }>(
      res,
      'Erro ao atualizar link de cobrança PIX.'
    );
  },

  // --- VIPS ---
  async getVips(all = false, adminToken?: string): Promise<VIP[]> {
    const res = await fetch(`${API_BASE}/vips${all ? '?all=true' : ''}`, {
      headers: getHeaders(adminToken), cache: 'no-store'
    });
    if (!res.ok) throw new Error('Erro ao buscar VIPs.');
    return res.json();
  },

  async createVip(vipData: Partial<VIP>, adminToken: string): Promise<VIP> {
    const res = await fetch(`${API_BASE}/admin/vips`, {
      method: 'POST',
      headers: getHeaders(adminToken),
      body: JSON.stringify(vipData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao criar VIP.');
    }
    return res.json();
  },

  async updateVip(id: string, vipData: Partial<VIP>, adminToken: string): Promise<VIP> {
    const res = await fetch(`${API_BASE}/admin/vips/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(vipData)
    });
    if (!res.ok) throw new Error('Erro ao atualizar VIP.');
    return res.json();
  },

  async deleteVip(id: string, adminToken: string, name?: string): Promise<void> {
    const q = name ? `?name=${encodeURIComponent(name)}` : '';
    const res = await fetch(`${API_BASE}/admin/vips/${encodeURIComponent(id)}${q}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir VIP.');
  },

  // --- STORE PRODUCTS ---
  async getProducts(all = false, category?: string, adminToken?: string): Promise<Product[]> {
    const params = new URLSearchParams();
    if (all) params.append('all', 'true');
    if (category) params.append('category', category);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/products${query}`, {
      headers: getHeaders(adminToken), cache: 'no-store'
    });
    if (!res.ok) throw new Error('Erro ao buscar produtos.');
    return res.json();
  },

  async createProduct(productData: Partial<Product>, adminToken: string): Promise<Product> {
    const res = await fetch(`${API_BASE}/admin/products`, {
      method: 'POST',
      headers: getHeaders(adminToken),
      body: JSON.stringify(productData)
    });
    return handleAdminFetch<Product>(res,'Erro ao criar produto.');
  },

  async updateProduct(id: string, productData: Partial<Product>, adminToken: string): Promise<Product> {
    const res = await fetch(`${API_BASE}/admin/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(productData)
    });
    return handleAdminFetch<Product>(res,'Erro ao atualizar produto.');
  },

  async deleteProduct(id: string, adminToken: string, name?: string): Promise<void> {
    const q = name ? `?name=${encodeURIComponent(name)}` : '';
    const res = await fetch(`${API_BASE}/admin/products/${encodeURIComponent(id)}${q}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    await handleAdminFetch<{success:boolean}>(res,'Erro ao excluir produto.');
  },

  // --- ORDERS ---
  async createOrder(data: {
    buyerNickname: string;
    recipientNickname: string;
    productId: string;
    productType: 'vip' | 'product';
    paymentMethod: PaymentMethod;
  }): Promise<Order> {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao processar pedido.');
    }
    return res.json();
  },

  async getOrder(id: string): Promise<Order> {
    const res = await fetch(`${API_BASE}/orders/${id}`);
    if (!res.ok) throw new Error('Pedido não encontrado.');
    return res.json();
  },

  async getPixTestOrders(adminToken: string): Promise<PixTestOrderSummary[]> {
    const res = await fetch(`${API_BASE}/admin/pix-test-orders`, {
      headers: getHeaders(adminToken),
      cache: 'no-store'
    });
    return handleAdminFetch<PixTestOrderSummary[]>(res, 'Não foi possível consultar os Pix de teste.');
  },

  async getAllOrders(adminToken: string): Promise<Order[]> {
    const res = await fetch(`${API_BASE}/orders`, {
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao carregar lista de pedidos.');
    return res.json();
  },

  async updateOrderStatus(id: string, status: Order['status'], adminToken: string): Promise<Order> {
    const rawId = id.trim();
    const encodedId = encodeURIComponent(rawId);
    const res = await fetch(`${API_BASE}/admin/orders/${encodedId}/status`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify({ id: rawId, status })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao atualizar status do pedido.');
    }
    return res.json();
  },

  async deleteOrder(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir pedido.');
  },

  // --- CUPONS DE DESCONTO ---
  async getCoupons(adminToken?: string): Promise<Coupon[]> {
    const res = await fetch(`${API_BASE}/admin/coupons`, {
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao carregar cupons.');
    return res.json();
  },

  async createCoupon(couponData: Partial<Coupon>, adminToken: string): Promise<Coupon> {
    const res = await fetch(`${API_BASE}/admin/coupons`, {
      method: 'POST',
      headers: getHeaders(adminToken),
      body: JSON.stringify(couponData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao criar cupom de desconto.');
    }
    return res.json();
  },

  async updateCoupon(id: string, couponData: Partial<Coupon>, adminToken: string): Promise<Coupon> {
    const res = await fetch(`${API_BASE}/admin/coupons/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(couponData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao atualizar cupom de desconto.');
    }
    return res.json();
  },

  async deleteCoupon(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/coupons/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao excluir cupom.');
    }
  },

  async validateCoupon(code: string, amount: number): Promise<{
    valid: boolean;
    coupon?: Coupon;
    discountAmount: number;
    finalAmount: number;
    message?: string;
    error?: string;
  }> {
    const res = await fetch(`${API_BASE}/coupons/validate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ code, amount })
    });
    const data = await res.json().catch(() => ({ valid: false, discountAmount: 0, finalAmount: amount, error: 'Falha na validação' }));
    return data;
  },

  async deleteOrdersBulk(
    filter: 'all' | 'concluidos' | 'pendentes' | 'cancelados',
    adminToken: string
  ): Promise<{ success: boolean; message: string; deletedCount: number; deletedIds: string[]; orders: Order[] }> {
    const res = await fetch(`${API_BASE}/admin/orders/bulk-delete`, {
      method: 'POST',
      headers: getHeaders(adminToken),
      body: JSON.stringify({ filter })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao excluir pedidos em lote.');
    }
    return res.json();
  },

  // Backend Webhook simulation (Delivers product securely)
  async simulatePayment(orderId: string): Promise<{ success: boolean; message: string; order: Order }> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/simulate-payment`, {
      method: 'POST',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Falha na confirmação do pagamento no backend.');
    return res.json();
  },

  // --- EVENTS ---
  async getEvents(all = false, adminToken?: string): Promise<ServerEvent[]> {
    const res = await fetch(`${API_BASE}/events${all ? '?all=true' : ''}`, {
      headers: getHeaders(adminToken), cache: 'no-store'
    });
    if (!res.ok) throw new Error('Erro ao carregar eventos.');
    return res.json();
  },

  async createEvent(eventData: Partial<ServerEvent>, adminToken: string): Promise<ServerEvent> {
    const res = await fetch(`${API_BASE}/admin/events`, {
      method: 'POST',
      headers: getHeaders(adminToken),
      body: JSON.stringify(eventData)
    });
    if (!res.ok) throw new Error('Erro ao criar evento.');
    return res.json();
  },

  async updateEvent(id: string, eventData: Partial<ServerEvent>, adminToken: string): Promise<ServerEvent> {
    const res = await fetch(`${API_BASE}/admin/events/${id}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(eventData)
    });
    if (!res.ok) throw new Error('Erro ao atualizar evento.');
    return res.json();
  },

  async deleteEvent(id: string, adminToken: string, name?: string): Promise<void> {
    const q = name ? `?name=${encodeURIComponent(name)}` : '';
    const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(id)}${q}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir evento.');
  },

  // --- NEWS ---
  async getNews(all = false, adminToken?: string): Promise<NewsArticle[]> {
    const res = await fetch(`${API_BASE}/news${all ? '?all=true' : ''}`, {
      headers: getHeaders(adminToken), cache: 'no-store'
    });
    if (!res.ok) throw new Error('Erro ao carregar notícias.');
    return res.json();
  },

  async createNews(newsData: Partial<NewsArticle>, adminToken: string): Promise<NewsArticle> {
    const res = await fetch(`${API_BASE}/admin/news`, {
      method: 'POST',
      headers: getHeaders(adminToken),
      body: JSON.stringify(newsData)
    });
    if (!res.ok) throw new Error('Erro ao publicar notícia.');
    return res.json();
  },

  async updateNews(id: string, newsData: Partial<NewsArticle>, adminToken: string): Promise<NewsArticle> {
    const res = await fetch(`${API_BASE}/admin/news/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(newsData)
    });
    if (!res.ok) throw new Error('Erro ao atualizar notícia.');
    return res.json();
  },

  async deleteNews(id: string, adminToken: string, title?: string): Promise<void> {
    const q = title ? `?name=${encodeURIComponent(title)}` : '';
    const res = await fetch(`${API_BASE}/admin/news/${encodeURIComponent(id)}${q}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir notícia.');
  },

  // --- COMMUNITY ---
  async getCommunity(all = false, adminToken?: string): Promise<SocialLink[]> {
    const res = await fetch(`${API_BASE}/community${all ? '?all=true' : ''}`, {
      headers: getHeaders(adminToken), cache: 'no-store'
    });
    if (!res.ok) throw new Error('Erro ao carregar redes sociais.');
    return res.json();
  },

  async createSocialLink(data: Partial<SocialLink>, adminToken: string): Promise<SocialLink> {
    const res = await fetch(`${API_BASE}/admin/community`, {
      method: 'POST',
      headers: getHeaders(adminToken),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erro ao criar rede social.');
    return res.json();
  },

  async updateSocialLink(id: string, data: Partial<SocialLink>, adminToken: string): Promise<SocialLink> {
    const res = await fetch(`${API_BASE}/admin/community/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erro ao atualizar rede social.');
    return res.json();
  },

  async deleteSocialLink(id: string, adminToken: string, name?: string): Promise<void> {
    const q = name ? `?name=${encodeURIComponent(name)}` : '';
    const res = await fetch(`${API_BASE}/admin/community/${encodeURIComponent(id)}${q}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir rede social.');
  },

  // --- SUPPORT TICKETS ---
  async getTickets(adminToken?: string, nickname?: string): Promise<SupportTicket[]> {
    const params = nickname ? `?nickname=${encodeURIComponent(nickname)}` : '';
    const res = await fetch(`${API_BASE}/tickets${params}`, {
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao buscar chamados.');
    return res.json();
  },

  async createTicket(ticketData: { nickname: string; category: string; subject: string; message: string }): Promise<Pick<SupportTicket,'id'|'status'|'createdAt'>> {
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(ticketData)
    });
    if (!res.ok) throw new Error('Erro ao registrar chamado de suporte.');
    return res.json();
  },

  async updateTicket(id: string, data: Partial<SupportTicket>, adminToken: string): Promise<SupportTicket> {
    const res = await fetch(`${API_BASE}/admin/tickets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erro ao atualizar chamado.');
    return res.json();
  },

  // --- ADMIN STATS & PLAYERS ---
  async getAdminStats(adminToken: string): Promise<DashboardStats> {
    const res = await fetch(`${API_BASE}/admin/stats`, {
      headers: getHeaders(adminToken)
    });
    return handleAdminFetch<DashboardStats>(res, 'Erro ao carregar estatísticas do painel.');
  },

  async getAdminPlayers(adminToken: string, search?: string): Promise<Player[]> {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`${API_BASE}/admin/players${params}`, {
      headers: getHeaders(adminToken)
    });
    return handleAdminFetch<Player[]>(res, 'Erro ao carregar lista de jogadores.');
  },

  async createAdminPlayer(data: { nickname: string; vipId?: string }, adminToken: string): Promise<Player> {
    const res = await fetch(`${API_BASE}/admin/players`, {
      method: 'POST',
      headers: getHeaders(adminToken),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao cadastrar jogador.');
    }
    return res.json();
  },

  async deletePlayer(id: string, adminToken: string, nickname?: string): Promise<void> {
    const q = nickname ? `?nickname=${encodeURIComponent(nickname)}` : '';
    const res = await fetch(`${API_BASE}/admin/players/${encodeURIComponent(id)}${q}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir jogador.');
  }
};
