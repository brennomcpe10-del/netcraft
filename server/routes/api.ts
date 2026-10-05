import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { dbStore } from '../data/store.ts';
import type { Player } from '../../src/types/index.ts';

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
apiRouter.post('/player/login', async (req, res) => {
  const { nickname } = req.body;
  if (!nickname || typeof nickname !== 'string') {
    return res.status(400).json({ error: 'Nickname é obrigatório.' });
  }

  const clean = nickname.trim();
  if (clean.length < 3 || clean.length > 32) {
    return res.status(400).json({ error: 'O nickname deve conter entre 3 e 32 caracteres.' });
  }

  const player = dbStore.getOrCreatePlayer(clean);

  // Sync to Firestore users collection
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', player.id), player);
  } catch (err) {
    console.warn('Firestore player sync notice:', err);
  }

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

  const player = dbStore.getPlayerByNickname(clean);
  if (!player) {
    return res.status(404).json({ error: 'Jogador não encontrado.' });
  }

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
apiRouter.get('/settings', async (_req, res) => {
  await dbStore.syncFromFirestore().catch(() => {});
  res.json(dbStore.getSettings());
});

apiRouter.put('/admin/settings', requireAdmin, async (req, res) => {
  const updated = dbStore.updateSettings(req.body);
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'serverSettings', 'default'), updated);
  } catch (err) {
    console.warn('Firestore settings update notice:', err);
  }
  res.json(updated);
});

apiRouter.put('/admin/settings/livepix', requireAdmin, async (req, res) => {
  const { livePixUrl } = req.body;
  if (typeof livePixUrl !== 'string') {
    return res.status(400).json({ error: 'URL do LivePix inválida.' });
  }
  const clean = livePixUrl.trim();
  if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
    return res.status(400).json({ error: 'O link deve começar com http:// ou https://' });
  }
  const updated = dbStore.updateSettings({ livePixUrl: clean });
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'serverSettings', 'default'), updated);
  } catch (err) {
    console.warn('Firestore livepix update notice:', err);
  }
  res.json({
    success: true,
    message: 'Link do LivePix atualizado com sucesso.',
    livePixUrl: updated.livePixUrl,
    settings: updated
  });
});

apiRouter.put('/admin/settings/pix', requireAdmin, async (req, res) => {
  const { pixUrl } = req.body;
  if (typeof pixUrl !== 'string') {
    return res.status(400).json({ error: 'Link ou chave PIX inválido.' });
  }
  const clean = pixUrl.trim();
  const updated = dbStore.updateSettings({ pixUrl: clean });
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'serverSettings', 'default'), updated);
  } catch (err) {
    console.warn('Firestore pix update notice:', err);
  }
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
apiRouter.get('/vips', async (req, res) => {
  const includeInactive = req.query.all === 'true';
  await dbStore.syncFromFirestore().catch(() => {});
  res.json(dbStore.getVips(includeInactive));
});

apiRouter.post('/admin/vips', requireAdmin, async (req, res) => {
  const { id, name, price, duration, description, benefits, color, image, order, active, livepixUrl, pixUrl } = req.body;
  if (!name || price == null || !duration) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const newVip = dbStore.createVip({
    ...(id ? { id: String(id).trim() } : {}),
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

  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'vips', newVip.id), newVip);
  } catch (err) {
    console.warn('Firestore VIP create notice:', err);
  }

  res.status(201).json(newVip);
});

apiRouter.put('/admin/vips/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateVip(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'VIP não encontrado.' });
  }

  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'vips', updated.id), updated);
  } catch (err) {
    console.warn('Firestore VIP update notice:', err);
  }

  res.json(updated);
});

apiRouter.delete('/admin/vips/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const name = typeof req.query.name === 'string' ? req.query.name : req.body?.name;
  const deleted = dbStore.deleteVip(id, name);

  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, deleteDoc, collection, getDocs } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'vips', id)).catch(() => {});
    const cleanId = id.trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();
    const snap = await getDocs(collection(db, 'vips'));
    for (const d of snap.docs) {
      const data = d.data();
      const matchId = d.id === id || d.id.toLowerCase() === cleanId || data.id === id;
      const matchName = cleanName && data.name && String(data.name).trim().toLowerCase() === cleanName;
      if (matchId || matchName) {
        await deleteDoc(doc(db, 'vips', d.id)).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Firestore VIP delete notice:', err);
  }

  res.json({ success: true, message: 'VIP excluído com sucesso.', removed: deleted });
});

// -------------------------------------------------------------
// STORE PRODUCTS
// -------------------------------------------------------------
apiRouter.get('/products', async (req, res) => {
  const includeInactive = req.query.all === 'true';
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  await dbStore.syncFromFirestore().catch(() => {});
  res.json(dbStore.getProducts(includeInactive, category));
});

apiRouter.post('/admin/products', requireAdmin, async (req, res) => {
  const { id, name, category, price, description, image, active, highlights, order, livepixUrl, pixUrl } = req.body;
  if (!name || !category || price == null) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const newProd = dbStore.createProduct({
    ...(id ? { id: String(id).trim() } : {}),
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

  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'products', newProd.id), newProd);
  } catch (err) {
    console.warn('Firestore product create notice:', err);
  }

  res.status(201).json(newProd);
});

apiRouter.put('/admin/products/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateProduct(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }

  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'products', updated.id), updated);
  } catch (err) {
    console.warn('Firestore product update notice:', err);
  }

  res.json(updated);
});

apiRouter.delete('/admin/products/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const name = typeof req.query.name === 'string' ? req.query.name : req.body?.name;
  const deleted = dbStore.deleteProduct(id, name);

  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, deleteDoc, collection, getDocs } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'products', id)).catch(() => {});
    const cleanId = id.trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();
    const snap = await getDocs(collection(db, 'products'));
    for (const d of snap.docs) {
      const data = d.data();
      const matchId = d.id === id || d.id.toLowerCase() === cleanId || data.id === id;
      const matchName = cleanName && data.name && String(data.name).trim().toLowerCase() === cleanName;
      if (matchId || matchName) {
        await deleteDoc(doc(db, 'products', d.id)).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Firestore product delete notice:', err);
  }

  res.json({ success: true, message: 'Produto excluído com sucesso.', removed: deleted });
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

apiRouter.post('/orders', async (req, res) => {
  const { buyerNickname, recipientNickname, productId, productType, paymentMethod } = req.body;

  if (!buyerNickname || !recipientNickname || !productId || !productType) {
    return res.status(400).json({ error: 'Dados do pedido incompletos.' });
  }

  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, getDoc, collection, getDocs, setDoc } = await import('firebase/firestore');

    const cleanProductId = String(productId).trim();
    const cleanLowerId = cleanProductId.toLowerCase();
    const targetType: 'vip' | 'product' = productType === 'vip' ? 'vip' : 'product';

    let itemData: any = null;
    let foundType: 'vip' | 'product' = targetType;

    // 1. Primary lookup in the specified collection in Firestore
    const primaryCollection = targetType === 'vip' ? 'vips' : 'products';
    const primaryDocRef = doc(db, primaryCollection, cleanProductId);
    const primarySnap = await getDoc(primaryDocRef).catch(() => null);

    if (primarySnap && primarySnap.exists()) {
      itemData = { ...primarySnap.data(), id: primarySnap.id };
    } else {
      // 1b. Fallback lookup in primary collection (case-insensitive or by data.id)
      const colSnap = await getDocs(collection(db, primaryCollection)).catch(() => null);
      if (colSnap && !colSnap.empty) {
        for (const d of colSnap.docs) {
          const data = d.data();
          if (
            d.id === cleanProductId ||
            d.id.toLowerCase() === cleanLowerId ||
            data.id === cleanProductId ||
            (data.id && String(data.id).toLowerCase() === cleanLowerId)
          ) {
            itemData = { ...data, id: d.id };
            break;
          }
        }
      }
    }

    // 2. If not found in primary collection, check alternate collection (handles kit/vip categorization)
    if (!itemData) {
      const altCollection = targetType === 'vip' ? 'products' : 'vips';
      const altDocRef = doc(db, altCollection, cleanProductId);
      const altSnap = await getDoc(altDocRef).catch(() => null);

      if (altSnap && altSnap.exists()) {
        itemData = { ...altSnap.data(), id: altSnap.id };
        foundType = targetType === 'vip' ? 'product' : 'vip';
      } else {
        const altColSnap = await getDocs(collection(db, altCollection)).catch(() => null);
        if (altColSnap && !altColSnap.empty) {
          for (const d of altColSnap.docs) {
            const data = d.data();
            if (
              d.id === cleanProductId ||
              d.id.toLowerCase() === cleanLowerId ||
              data.id === cleanProductId ||
              (data.id && String(data.id).toLowerCase() === cleanLowerId)
            ) {
              itemData = { ...data, id: d.id };
              foundType = targetType === 'vip' ? 'product' : 'vip';
              break;
            }
          }
        }
      }
    }

    // 3. Fallback to dbStore RAM cache if Firestore lookup was somehow empty
    if (!itemData) {
      if (targetType === 'vip') {
        const memoryVip = dbStore.getVipById(cleanProductId);
        if (memoryVip) itemData = memoryVip;
      } else {
        const memoryProd = dbStore.getProductById(cleanProductId);
        if (memoryProd) itemData = memoryProd;
      }
    }

    // 4. If item really does not exist, return explicit descriptive error
    if (!itemData) {
      const typeLabel = targetType === 'vip' ? 'VIP' : 'Produto';
      console.warn(`CHECKOUT AVISO: ${typeLabel} não localizado no Firestore:`, {
        targetCollection: primaryCollection,
        searchedId: cleanProductId,
        type: targetType
      });
      return res.status(404).json({
        error: `${typeLabel} selecionado não foi encontrado no sistema (ID: ${cleanProductId}).`,
        code: 'NOT_FOUND',
        collection: primaryCollection,
        productId: cleanProductId
      });
    }

    // 5. Check if item is available / active
    if (itemData.active === false) {
      const typeLabel = foundType === 'vip' ? 'VIP' : 'Produto';
      const safeName = String(itemData.name || 'Item').trim();
      return res.status(400).json({
        error: `O ${typeLabel} "${safeName}" está temporariamente desativado para novas compras.`,
        code: 'ITEM_INACTIVE',
        collection: foundType === 'vip' ? 'vips' : 'products',
        productId: cleanProductId
      });
    }

    // 6. Security: Fetch actual price and name from verified database document safely
    const amount = Number(itemData.price) || 0;
    const rawName = String(itemData.name || itemData.title || (foundType === 'vip' ? 'VIP' : 'Produto')).trim();
    const productName = foundType === 'vip'
      ? (rawName.toLowerCase().startsWith('vip') ? rawName : `VIP ${rawName}`)
      : rawName;

    // 7. Extract payment URLs
    const livepixUrl = itemData.livepixUrl ? String(itemData.livepixUrl).trim() : '';
    const pixUrl = itemData.pixUrl ? String(itemData.pixUrl).trim() : '';

    console.log('CHECKOUT SUCESSO: Documento Firestore validado:', {
      collection: foundType === 'vip' ? 'vips' : 'products',
      id: itemData.id,
      productName,
      amount,
      buyerNickname,
      recipientNickname
    });

    // 8. Create the order
    const order = dbStore.createOrder({
      buyerNickname,
      recipientNickname,
      productId: String(itemData.id || cleanProductId),
      productName,
      productType: foundType,
      amount,
      paymentMethod: (paymentMethod === 'LIVEPIX' ? 'PIX' : (paymentMethod || 'PIX')) as any
    });

    // 9. Register players in dbStore and Firestore players collection
    const buyerPlayer = dbStore.getOrCreatePlayer(buyerNickname);
    const recipientPlayer = dbStore.getOrCreatePlayer(recipientNickname);

    // Save directly to Firestore orders and players collections
    await Promise.all([
      setDoc(doc(db, 'orders', order.id), order),
      setDoc(doc(db, 'players', buyerPlayer.id), buyerPlayer, { merge: true }),
      setDoc(doc(db, 'players', recipientPlayer.id), recipientPlayer, { merge: true })
    ]).catch(err => {
      console.warn('Firestore order persistence notice:', err);
    });

    // Keep RAM memory synced
    if (foundType === 'vip') {
      dbStore.updateVip(itemData.id, itemData);
    } else {
      dbStore.updateProduct(itemData.id, itemData);
    }

    return res.status(201).json({
      ...order,
      livepixUrl,
      pixUrl
    });
  } catch (err: unknown) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    const errorCode = (err as any)?.code || 'INTERNAL_ERROR';
    console.error('DIAGNÓSTICO ERRO FIRESTORE CHECKOUT:', {
      code: errorCode,
      message: errorObj.message,
      name: errorObj.name,
      searchedId: productId,
      productType,
      stack: errorObj.stack
    });
    return res.status(500).json({
      error: `Erro ao consultar dados no Firestore: ${errorObj.message}`,
      code: errorCode,
      productId: String(productId || '')
    });
  }
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

apiRouter.post('/admin/orders/bulk-delete', requireAdmin, async (req, res) => {
  const { filter } = req.body;
  const validFilters = ['all', 'concluidos', 'pendentes', 'cancelados'];
  if (!filter || !validFilters.includes(filter)) {
    return res.status(400).json({ error: 'Filtro de exclusão inválido. Escolha: all, concluidos, pendentes ou cancelados.' });
  }

  const result = dbStore.deleteOrdersBulk(filter as 'all' | 'concluidos' | 'pendentes' | 'cancelados');

  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, deleteDoc, getDocs, collection } = await import('firebase/firestore');

    if (filter === 'all') {
      const snap = await getDocs(collection(db, 'orders'));
      const delPromises = snap.docs.map(d => deleteDoc(doc(db, 'orders', d.id)).catch(() => {}));
      await Promise.all(delPromises);
    } else {
      for (const id of result.deletedIds) {
        await deleteDoc(doc(db, 'orders', id)).catch(() => {});
        await deleteDoc(doc(db, 'orders', id.replace(/^#/, ''))).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Firestore bulk delete notice:', err);
  }

  res.json({
    success: true,
    message: `${result.deletedCount} pedidos excluídos com sucesso.`,
    deletedCount: result.deletedCount,
    deletedIds: result.deletedIds,
    orders: result.orders
  });
});

apiRouter.delete('/admin/orders/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const deleted = dbStore.deleteOrder(id);
  res.json({ success: true, message: 'Pedido excluído com sucesso.', removed: deleted });
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
  const name = typeof req.query.name === 'string' ? req.query.name : req.body?.name;
  const deleted = dbStore.deleteEvent(id, name);
  res.json({ success: true, message: 'Evento excluído com sucesso.', removed: deleted });
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
  const name = typeof req.query.name === 'string' ? req.query.name : (typeof req.query.title === 'string' ? req.query.title : req.body?.title || req.body?.name);
  const deleted = dbStore.deleteNews(id, name);
  res.json({ success: true, message: 'Notícia excluída com sucesso.', removed: deleted });
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
  const name = typeof req.query.name === 'string' ? req.query.name : req.body?.name;
  const deleted = dbStore.deleteSocialLink(id, name);
  res.json({ success: true, message: 'Rede social excluída com sucesso.', removed: deleted });
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

apiRouter.get('/admin/players', requireAdmin, async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase() : '';

  // Synchronize any Firestore users so no registration is ever missed
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { collection, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach(d => {
      const u = d.data() as Player;
      if (u.nickname) {
        dbStore.getOrCreatePlayer(u.nickname);
      }
    });
  } catch {
    // ignore
  }

  let players = dbStore.getPlayers();
  if (search) {
    players = players.filter(p => p.nickname.toLowerCase().includes(search));
  }
  res.json(players);
});

apiRouter.post('/admin/players', requireAdmin, async (req, res) => {
  const { nickname, vipId } = req.body;
  if (!nickname || typeof nickname !== 'string') {
    return res.status(400).json({ error: 'Nickname é obrigatório.' });
  }

  const clean = nickname.trim();
  if (clean.length < 3 || clean.length > 32) {
    return res.status(400).json({ error: 'O nickname deve conter entre 3 e 32 caracteres.' });
  }

  let player = dbStore.getOrCreatePlayer(clean);

  if (vipId) {
    const vip = dbStore.getVipById(vipId);
    if (vip) {
      const isLifetime = vip.duration.toLowerCase().includes('vitalício');
      const now = new Date();
      const expiresAt = isLifetime ? null : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const activeVips = [...player.activeVips];
      const existingIdx = activeVips.findIndex(v => v.vipId === vip.id);
      if (existingIdx >= 0) {
        activeVips[existingIdx].expiresAt = expiresAt;
      } else {
        activeVips.push({
          vipId: vip.id,
          vipName: `VIP ${vip.name}`,
          activatedAt: now.toISOString(),
          expiresAt
        });
      }
      const updated = dbStore.updatePlayer(player.id, { activeVips });
      if (updated) player = updated;
    }
  }

  // Sync to Firestore
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', player.id), player);
  } catch {
    // ignore
  }

  res.status(201).json(player);
});

apiRouter.delete('/admin/players/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const nickname = typeof req.query.nickname === 'string' ? req.query.nickname : (typeof req.query.name === 'string' ? req.query.name : req.body?.nickname);
  const deleted = dbStore.deletePlayer(id, nickname);
  res.json({ success: true, message: 'Jogador excluído com sucesso.', removed: deleted });
});
