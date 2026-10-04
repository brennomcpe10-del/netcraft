import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { dbStore } from '../data/store.ts';

export const apiRouter = express.Router();

// The secret keyword is strictly handled on the server side
// Default: 'brennomcpe' as instructed by the server owner
const ADMIN_SECRET = process.env.ADMIN_KEYWORD || 'brennomcpe';

// In-memory set of explicitly revoked admin tokens
const revokedAdminTokens = new Set<string>();

// Generate cryptographic HMAC-signed token
export function generateAdminToken(): string {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${timestamp}.${nonce}`;
  const hmac = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
  return `adm_${payload}.${hmac}`;
}

// Validate admin token (cryptographically verified, immune to server restarts and multi-instance statelessness)
export function isValidAdminToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  if (revokedAdminTokens.has(token)) return false;

  // Master recovery fallback: allow direct keyword
  if (token === ADMIN_SECRET) return true;

  // Validate HMAC token format: adm_<timestamp>.<nonce>.<signature>
  if (token.startsWith('adm_')) {
    const raw = token.substring(4);
    const parts = raw.split('.');
    if (parts.length === 3) {
      const [timestampStr, nonce, sig] = parts;
      const timestamp = parseInt(timestampStr, 10);
      if (!isNaN(timestamp)) {
        // Valid for 30 days
        const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        if (now - timestamp <= MAX_AGE && timestamp <= now + 5 * 60 * 1000) {
          const payload = `${timestampStr}.${nonce}`;
          const expectedSig = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
          try {
            if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
              return true;
            }
          } catch {
            return false;
          }
        }
      }
    }
  }

  return false;
}

// Middleware to protect admin routes
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso negado: Credencial de administrador ausente.' });
  }

  const token = authHeader.substring(7);
  if (!isValidAdminToken(token)) {
    return res.status(403).json({ error: 'Sessão administrativa inválida ou expirada.' });
  }

  next();
}

// -------------------------------------------------------------
// ADMIN AUTHENTICATION
// -------------------------------------------------------------
apiRouter.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Credencial não informada.' });
  }

  if (password.trim() === ADMIN_SECRET) {
    const token = generateAdminToken();
    return res.json({
      success: true,
      token,
      message: 'Autenticado com sucesso no Painel NetCraftBR.'
    });
  }

  return res.status(401).json({ error: 'Palavra-chave administrativa incorreta.' });
});

apiRouter.post('/admin/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    revokedAdminTokens.add(token);
  }
  res.json({ success: true });
});

apiRouter.get('/admin/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }
  const token = authHeader.substring(7);
  return res.json({ authenticated: isValidAdminToken(token) });
});

// -------------------------------------------------------------
// PLAYER / ACCOUNT IDENTIFICATION
// -------------------------------------------------------------
apiRouter.post('/player/login', (req, res) => {
  const { nickname } = req.body;
  if (!nickname || typeof nickname !== 'string') {
    return res.status(400).json({ error: 'Nickname é obrigatório.' });
  }

  const clean = nickname.trim();
  if (clean.length < 3 || clean.length > 32) {
    return res.status(400).json({ error: 'O nickname deve conter entre 3 e 32 caracteres.' });
  }

  const player = dbStore.getOrCreatePlayer(clean);
  return res.json({
    success: true,
    player
  });
});

apiRouter.get('/player/:nickname', (req, res) => {
  const { nickname } = req.params;
  const clean = decodeURIComponent(nickname).trim();

  if (clean.length < 3 || clean.length > 32) {
    return res.status(400).json({
      error: 'O nickname deve conter entre 3 e 32 caracteres.'
    });
  }

  const player = dbStore.getOrCreatePlayer(clean);

  return res.json(player);
});

apiRouter.get('/player/:nickname/orders', (req, res) => {
  const { nickname } = req.params;
  const orders = dbStore.getOrdersByNickname(nickname);
  return res.json(orders);
});

// -------------------------------------------------------------
// SERVER SETTINGS & INFRASTRUCTURE
// -------------------------------------------------------------
apiRouter.get('/settings', (_req, res) => {
  res.json(dbStore.getSettings());
});

apiRouter.put('/admin/settings', requireAdmin, (req, res) => {
  const updated = dbStore.updateSettings(req.body);
  res.json(updated);
});

apiRouter.put('/admin/settings/livepix', requireAdmin, (req, res) => {
  const { livePixUrl } = req.body;
  if (typeof livePixUrl !== 'string') {
    return res.status(400).json({ error: 'URL do LivePix inválida.' });
  }
  const clean = livePixUrl.trim();
  if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
    return res.status(400).json({ error: 'O link deve começar com http:// ou https://' });
  }
  const updated = dbStore.updateSettings({ livePixUrl: clean });
  res.json({
    success: true,
    message: 'Link do LivePix atualizado com sucesso.',
    livePixUrl: updated.livePixUrl,
    settings: updated
  });
});

apiRouter.put('/admin/settings/pix', requireAdmin, (req, res) => {
  const { pixUrl } = req.body;
  if (typeof pixUrl !== 'string') {
    return res.status(400).json({ error: 'Link ou chave PIX inválido.' });
  }
  const clean = pixUrl.trim();
  const updated = dbStore.updateSettings({ pixUrl: clean });
  res.json({
    success: true,
    message: 'Link de cobrança PIX atualizado com sucesso.',
    pixUrl: updated.pixUrl,
    settings: updated
  });
});

// -------------------------------------------------------------
// VIP PACKAGES
// -------------------------------------------------------------
apiRouter.get('/vips', (req, res) => {
  const includeInactive = req.query.all === 'true';
  res.json(dbStore.getVips(includeInactive));
});

apiRouter.post('/admin/vips', requireAdmin, (req, res) => {
  const { name, price, duration, description, benefits, color, image, order, active, livepixUrl, pixUrl } = req.body;
  if (!name || price == null || !duration) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const newVip = dbStore.createVip({
    name,
    price: Number(price),
    duration,
    description: description || '',
    benefits: Array.isArray(benefits) ? benefits : [],
    color: color || 'emerald',
    image: image || 'crown',
    order: Number(order) || 1,
    active: active !== false,
    isPopular: !!req.body.isPopular,
    livepixUrl: livepixUrl ? String(livepixUrl).trim() : '',
    pixUrl: pixUrl ? String(pixUrl).trim() : ''
  });

  res.status(201).json(newVip);
});

apiRouter.put('/admin/vips/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateVip(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'VIP não encontrado.' });
  }
  res.json(updated);
});

apiRouter.delete('/admin/vips/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const deleted = dbStore.deleteVip(id);
  if (!deleted) {
    return res.status(404).json({ error: 'VIP não encontrado.' });
  }
  res.json({ success: true, message: 'VIP excluído com sucesso.' });
});

// -------------------------------------------------------------
// STORE PRODUCTS
// -------------------------------------------------------------
apiRouter.get('/products', (req, res) => {
  const includeInactive = req.query.all === 'true';
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  res.json(dbStore.getProducts(includeInactive, category));
});

apiRouter.post('/admin/products', requireAdmin, (req, res) => {
  const { name, category, price, description, image, active, highlights, order, livepixUrl, pixUrl } = req.body;
  if (!name || !category || price == null) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const newProd = dbStore.createProduct({
    name,
    category,
    price: Number(price),
    description: description || '',
    image: image || 'cube',
    active: active !== false,
    highlights: Array.isArray(highlights) ? highlights : [],
    order: Number(order) || 1,
    livepixUrl: livepixUrl ? String(livepixUrl).trim() : '',
    pixUrl: pixUrl ? String(pixUrl).trim() : ''
  });

  res.status(201).json(newProd);
});

apiRouter.put('/admin/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateProduct(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }
  res.json(updated);
});

apiRouter.delete('/admin/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const deleted = dbStore.deleteProduct(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }
  res.json({ success: true, message: 'Produto excluído com sucesso.' });
});

// -------------------------------------------------------------
// ORDERS & CHECKOUT & GATEWAY WEBHOOK
// -------------------------------------------------------------
apiRouter.get('/orders', (req, res) => {
  const nickname = typeof req.query.nickname === 'string' ? req.query.nickname : null;
  if (nickname) {
    return res.json(dbStore.getOrdersByNickname(nickname));
  }
  // All orders requires admin
  const authHeader = req.headers.authorization;
  if (!authHeader || !isValidAdminToken(authHeader.replace('Bearer ', '').trim())) {
    return res.status(401).json({ error: 'Acesso restrito ao administrador.' });
  }
  res.json(dbStore.getOrders());
});

apiRouter.get('/orders/:id', (req, res) => {
  const { id } = req.params;
  const order = dbStore.getOrderById(id);
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado.' });
  }
  res.json(order);
});

apiRouter.post('/orders', (req, res) => {
  const { buyerNickname, recipientNickname, productId, productType, paymentMethod } = req.body;

  if (!buyerNickname || !recipientNickname || !productId || !productType) {
    return res.status(400).json({ error: 'Dados do pedido incompletos.' });
  }

  // Security check: Never trust client price! Fetch actual price from DB
  let amount = 0;
  let productName = '';

  if (productType === 'vip') {
    const vip = dbStore.getVipById(productId);
    if (!vip || !vip.active) {
      return res.status(400).json({ error: 'VIP selecionado não está disponível.' });
    }
    amount = vip.price;
    productName = `VIP ${vip.name}`;
  } else {
    const product = dbStore.getProductById(productId);
    if (!product || !product.active) {
      return res.status(400).json({ error: 'Produto selecionado não está disponível.' });
    }
    amount = product.price;
    productName = product.name;
  }

  const order = dbStore.createOrder({
    buyerNickname,
    recipientNickname,
    productId,
    productName,
    productType,
    amount,
    paymentMethod: paymentMethod || 'PIX'
  });

  res.status(201).json(order);
});

// Webhook / Simulated Payment Confirmation
// As specified: "O VIP NÃO deve ser entregue apenas porque o usuário chegou à página de sucesso...
// A entrega deverá ocorrer somente depois que o backend confirmar o pagamento."
apiRouter.post('/orders/:id/simulate-payment', (req, res) => {
  const { id } = req.params;
  const order = dbStore.getOrderById(id);
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado.' });
  }

  if (order.status === 'Entregue' || order.status === 'Pago') {
    return res.json({ message: 'Pedido já foi processado e entregue.', order });
  }

  // Server processes payment and delivers items
  const updatedOrder = dbStore.updateOrderStatus(id, 'Pago');
  res.json({
    success: true,
    message: 'Pagamento confirmado pelo backend! Vantagens entregues na conta do jogador.',
    order: updatedOrder
  });
});

apiRouter.put('/admin/orders/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status não especificado.' });
  }
  const order = dbStore.updateOrderStatus(id, status);
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado.' });
  }
  res.json(order);
});

apiRouter.delete('/admin/orders/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const deleted = dbStore.deleteOrder(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Pedido não encontrado.' });
  }
  res.json({ success: true, message: 'Pedido excluído com sucesso.' });
});

// -------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------
apiRouter.get('/events', (req, res) => {
  const includeAll = req.query.all === 'true';
  res.json(dbStore.getEvents(includeAll));
});

apiRouter.post('/admin/events', requireAdmin, (req, res) => {
  const { name, description, date, time, status, image, rewards, published, location } = req.body;
  if (!name || !description || !date) {
    return res.status(400).json({ error: 'Dados do evento incompletos.' });
  }

  const newEv = dbStore.createEvent({
    name,
    description,
    date,
    time: time || '19:00',
    status: status || 'Próximo',
    image: image || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    rewards: Array.isArray(rewards) ? rewards : [],
    published: published !== false,
    location: location || '/warp eventos'
  });

  res.status(201).json(newEv);
});

apiRouter.put('/admin/events/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateEvent(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Evento não encontrado.' });
  }
  res.json(updated);
});

apiRouter.delete('/admin/events/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const deleted = dbStore.deleteEvent(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Evento não encontrado.' });
  }
  res.json({ success: true });
});

// -------------------------------------------------------------
// NEWS
// -------------------------------------------------------------
apiRouter.get('/news', (req, res) => {
  const includeAll = req.query.all === 'true';
  res.json(dbStore.getNews(includeAll));
});

apiRouter.post('/admin/news', requireAdmin, (req, res) => {
  const { title, content, summary, image, author, category, published } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
  }

  const article = dbStore.createNews({
    title,
    content,
    summary: summary || title,
    image: image || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    date: new Date().toISOString().split('T')[0],
    author: author || 'Equipe NetCraftBR',
    published: published !== false,
    category: category || 'Atualização'
  });

  res.status(201).json(article);
});

apiRouter.put('/admin/news/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateNews(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Notícia não encontrada.' });
  }
  res.json(updated);
});

apiRouter.delete('/admin/news/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const deleted = dbStore.deleteNews(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Notícia não encontrada.' });
  }
  res.json({ success: true });
});

// -------------------------------------------------------------
// COMMUNITY & SOCIAL LINKS
// -------------------------------------------------------------
apiRouter.get('/community', (_req, res) => {
  res.json(dbStore.getSocialLinks());
});

apiRouter.post('/admin/community', requireAdmin, (req, res) => {
  const { name, platform, url, icon, active, description, memberCount, order } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'Nome e URL são obrigatórios.' });
  }

  const newLink = dbStore.createSocialLink({
    name,
    platform: platform || 'discord',
    url,
    icon: icon || 'message-square',
    active: active !== false,
    description: description || '',
    memberCount: memberCount || '',
    order: Number(order) || 1
  });

  res.status(201).json(newLink);
});

apiRouter.put('/admin/community/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateSocialLink(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Rede social não encontrada.' });
  }
  res.json(updated);
});

apiRouter.delete('/admin/community/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const deleted = dbStore.deleteSocialLink(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Rede social não encontrada.' });
  }
  res.json({ success: true, message: 'Rede social excluída com sucesso.' });
});

// -------------------------------------------------------------
// SUPPORT TICKETS
// -------------------------------------------------------------
apiRouter.get('/tickets', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && isValidAdminToken(authHeader.replace('Bearer ', '').trim())) {
    return res.json(dbStore.getTickets());
  }
  const nickname = typeof req.query.nickname === 'string' ? req.query.nickname.toLowerCase() : null;
  if (nickname) {
    return res.json(dbStore.getTickets().filter(t => t.nickname.toLowerCase() === nickname));
  }
  res.json([]);
});

apiRouter.post('/tickets', (req, res) => {
  const { nickname, category, subject, message } = req.body;
  if (!nickname || !category || !subject || !message) {
    return res.status(400).json({ error: 'Preencha todos os campos do chamado.' });
  }

  const ticket = dbStore.createTicket({
    nickname,
    category,
    subject,
    message
  });
  res.status(201).json(ticket);
});

apiRouter.put('/admin/tickets/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateTicket(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }
  res.json(updated);
});

// -------------------------------------------------------------
// ADMIN DASHBOARD & PLAYERS MANAGEMENT
// -------------------------------------------------------------
apiRouter.get('/admin/stats', requireAdmin, (_req, res) => {
  res.json(dbStore.getDashboardStats());
});

apiRouter.get('/admin/players', requireAdmin, (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase() : '';
  let players = dbStore.getPlayers();
  if (search) {
    players = players.filter(p => p.nickname.toLowerCase().includes(search));
  }
  res.json(players);
});

apiRouter.delete('/admin/players/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const deleted = dbStore.deletePlayer(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Jogador não encontrado.' });
  }
  res.json({ success: true, message: 'Jogador excluído com sucesso.' });
});
