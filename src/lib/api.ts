import {
  VIP,
  Product,
  Order,
  ServerEvent,
  NewsArticle,
  ServerSettings,
  SocialLink,
  Player,
  SupportTicket,
  DashboardStats,
  PaymentMethod
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

export const api = {
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
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Palavra-chave incorreta.');
    }
    return res.json();
  },

  async verifyAdmin(token: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/admin/verify`, {
        headers: getHeaders(token)
      });
      const data = await res.json();
      return !!data.authenticated;
    } catch {
      return false;
    }
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
  async getVips(all = false): Promise<VIP[]> {
    const res = await fetch(`${API_BASE}/vips${all ? '?all=true' : ''}`);
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
    const res = await fetch(`${API_BASE}/admin/vips/${id}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(vipData)
    });
    if (!res.ok) throw new Error('Erro ao atualizar VIP.');
    return res.json();
  },

  async deleteVip(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/vips/${id}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir VIP.');
  },

  // --- STORE PRODUCTS ---
  async getProducts(all = false, category?: string): Promise<Product[]> {
    const params = new URLSearchParams();
    if (all) params.append('all', 'true');
    if (category) params.append('category', category);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/products${query}`);
    if (!res.ok) throw new Error('Erro ao buscar produtos.');
    return res.json();
  },

  async createProduct(productData: Partial<Product>, adminToken: string): Promise<Product> {
    const res = await fetch(`${API_BASE}/admin/products`, {
      method: 'POST',
      headers: getHeaders(adminToken),
      body: JSON.stringify(productData)
    });
    if (!res.ok) throw new Error('Erro ao criar produto.');
    return res.json();
  },

  async updateProduct(id: string, productData: Partial<Product>, adminToken: string): Promise<Product> {
    const res = await fetch(`${API_BASE}/admin/products/${id}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(productData)
    });
    if (!res.ok) throw new Error('Erro ao atualizar produto.');
    return res.json();
  },

  async deleteProduct(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/products/${id}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir produto.');
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

  async getAllOrders(adminToken: string): Promise<Order[]> {
    const res = await fetch(`${API_BASE}/orders`, {
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao carregar lista de pedidos.');
    return res.json();
  },

  async updateOrderStatus(id: string, status: Order['status'], adminToken: string): Promise<Order> {
    const res = await fetch(`${API_BASE}/admin/orders/${id}/status`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Erro ao atualizar status do pedido.');
    return res.json();
  },

  async deleteOrder(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/orders/${id}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir pedido.');
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
  async getEvents(all = false): Promise<ServerEvent[]> {
    const res = await fetch(`${API_BASE}/events${all ? '?all=true' : ''}`);
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

  async deleteEvent(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/events/${id}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir evento.');
  },

  // --- NEWS ---
  async getNews(all = false): Promise<NewsArticle[]> {
    const res = await fetch(`${API_BASE}/news${all ? '?all=true' : ''}`);
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
    const res = await fetch(`${API_BASE}/admin/news/${id}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(newsData)
    });
    if (!res.ok) throw new Error('Erro ao atualizar notícia.');
    return res.json();
  },

  async deleteNews(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/news/${id}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir notícia.');
  },

  // --- COMMUNITY ---
  async getCommunity(): Promise<SocialLink[]> {
    const res = await fetch(`${API_BASE}/community`);
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
    const res = await fetch(`${API_BASE}/admin/community/${id}`, {
      method: 'PUT',
      headers: getHeaders(adminToken),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erro ao atualizar rede social.');
    return res.json();
  },

  async deleteSocialLink(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/community/${id}`, {
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

  async createTicket(ticketData: { nickname: string; category: string; subject: string; message: string }): Promise<SupportTicket> {
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(ticketData)
    });
    if (!res.ok) throw new Error('Erro ao registrar chamado de suporte.');
    return res.json();
  },

  async updateTicket(id: string, data: Partial<SupportTicket>, adminToken: string): Promise<SupportTicket> {
    const res = await fetch(`${API_BASE}/admin/tickets/${id}`, {
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

  async deletePlayer(id: string, adminToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/players/${id}`, {
      method: 'DELETE',
      headers: getHeaders(adminToken)
    });
    if (!res.ok) throw new Error('Erro ao excluir jogador.');
  }
};
