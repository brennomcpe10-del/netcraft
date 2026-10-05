import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  query,
  limit,
  getDoc
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from './firebase.ts';
import {
  VIP,
  Product,
  ServerEvent,
  NewsArticle,
  ServerSettings,
  SocialLink,
  Player,
  Order,
  HomeConfig,
  MenuItem,
  AppearanceConfig,
  FaqItem,
  SupportTicket,
  DashboardStats
} from '../types/index.ts';

import {
  initialSettings,
  initialVips,
  initialProducts,
  initialEvents,
  initialNews,
  initialSocialLinks
} from '../../server/data/initialData.ts';

// -------------------------------------------------------------
// DEFAULT INITIAL CONFIGURATIONS
// -------------------------------------------------------------
export const initialHomeConfig: HomeConfig = {
  heroTitle: 'NETCRAFTBR',
  heroSubtitle: 'Seu servidor. Sua aventura.',
  heroDescription: 'Entre no nosso servidor Minecraft Bedrock e viva sua própria aventura.',
  heroImage: '/hero_landscape.jpg',
  primaryButtonText: 'Jogar agora',
  secondaryButtonText: 'Conhecer o servidor',
  showIpBar: true,
  showAboutSection: true,
  aboutTitle: 'Um servidor feito para você jogar do seu jeito.',
  aboutDescription: 'O NetCraftBR nasceu com o propósito de oferecer uma experiência fluída, limpa e estável para jogadores de Minecraft Bedrock no celular, console e computador.',
  aboutImage: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1000&q=80',
  showSystemsSection: true,
  systemsTitle: 'Sistemas do Servidor',
  showVipsSection: true,
  vipsTitle: 'Planos VIP',
  showNewsSection: true,
  newsTitle: 'Notícias Recentes',
  showCommunitySection: true,
  communityTitle: 'Participe da Comunidade'
};

export const initialMenuItems: MenuItem[] = [
  { id: 'home', label: 'Início', target: 'home', enabled: true, order: 1 },
  { id: 'server', label: 'Servidor', target: 'server', enabled: true, order: 2 },
  { id: 'vip', label: 'VIP', target: 'vip', enabled: true, order: 3 },
  { id: 'store', label: 'Loja', target: 'store', enabled: true, order: 4 },
  { id: 'events', label: 'Eventos', target: 'events', enabled: true, order: 5 },
  { id: 'community', label: 'Comunidade', target: 'community', enabled: true, order: 6 },
  { id: 'support', label: 'Suporte', target: 'support', enabled: true, order: 7 }
];

export const initialAppearance: AppearanceConfig = {
  logoText: 'NETCRAFTBR',
  logoUrl: '',
  bgImage: '/hero_landscape.jpg',
  heroImage: '/hero_landscape.jpg',
  primaryAccent: '#10b981',
  secondaryAccent: '#06b6d4'
};

export const initialFaqs: FaqItem[] = [
  {
    id: 'faq-1',
    question: 'Como faço para entrar no NetCraftBR pelo celular?',
    answer: 'Abra o Minecraft Bedrock no celular, clique em Jogar > Servidores > Adicionar Servidor. Insira o IP netcraftbr.srvmc.com e porta 25673, depois salve e conecte.',
    category: 'jogar',
    enabled: true,
    order: 1
  },
  {
    id: 'faq-2',
    question: 'Posso jogar usando Minecraft de computador ou console?',
    answer: 'Sim! No Windows (Bedrock), adicione normalmente o servidor. Nos consoles (Xbox, PS, Switch), conecte-se usando o aplicativo BedrockTogether no smartphone na mesma rede Wi-Fi.',
    category: 'jogar',
    enabled: true,
    order: 2
  },
  {
    id: 'faq-3',
    question: 'Quanto tempo demora para meu VIP ser entregue após o pagamento?',
    answer: 'Pagamentos via PIX ou Cartão são validados pelo backend de forma quase instantânea. Após a confirmação, os benefícios são concedidos imediatamente ao nickname escolhido.',
    category: 'compra',
    enabled: true,
    order: 3
  },
  {
    id: 'faq-4',
    question: 'Posso presentear outro jogador com um VIP?',
    answer: 'Sim! Durante a compra, selecione a opção "Presentear outro jogador" e informe o nickname exato da pessoa no Minecraft Bedrock.',
    category: 'compra',
    enabled: true,
    order: 4
  },
  {
    id: 'faq-5',
    question: 'O que fazer se o meu VIP não ativar?',
    answer: 'Caso passem 15 minutos sem ativação, envie um chamado no suporte ou procure a equipe no Discord oficial informando o ID do pedido.',
    category: 'vip',
    enabled: true,
    order: 5
  }
];

// -------------------------------------------------------------
// SYSTEM INITIALIZATION (NO AUTOMATIC SEEDING - EVERYTHING IS MANUAL)
// -------------------------------------------------------------
export async function seedFirestoreIfEmpty() {
  try {
    if (typeof window !== 'undefined' && localStorage.getItem('netcraftbr_seeded') === 'true') {
      return;
    }

    const initRef = doc(db, 'system', 'initialized');
    const initSnap = await getDoc(initRef);
    if (!initSnap.exists()) {
      await setDoc(initRef, { initializedAt: new Date().toISOString(), version: 1 }).catch(() => {});
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('netcraftbr_seeded', 'true');
    }
  } catch (err) {
    console.warn('Firestore initialization notice:', err);
  }
}

// -------------------------------------------------------------
// DIRECT FIRESTORE GETTERS (OFFICIAL SOURCE OF TRUTH)
// -------------------------------------------------------------
export async function getVipsFromFirestore(): Promise<VIP[]> {
  try {
    const snap = await getDocs(collection(db, 'vips'));
    const list: VIP[] = [];
    snap.forEach(d => list.push({ ...d.data(), id: d.id } as VIP));
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    return list;
  } catch (err) {
    console.warn('Error fetching VIPs from Firestore:', err);
    return [];
  }
}

export async function getProductsFromFirestore(): Promise<Product[]> {
  try {
    const snap = await getDocs(collection(db, 'products'));
    const list: Product[] = [];
    snap.forEach(d => list.push({ ...d.data(), id: d.id } as Product));
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    return list;
  } catch (err) {
    console.warn('Error fetching Products from Firestore:', err);
    return [];
  }
}

export async function getVipByIdFromFirestore(id: string): Promise<VIP | null> {
  try {
    const cleanId = String(id).trim();
    const docRef = doc(db, 'vips', cleanId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { ...snap.data(), id: snap.id } as VIP;
    }
    const colSnap = await getDocs(collection(db, 'vips'));
    const lower = cleanId.toLowerCase();
    for (const d of colSnap.docs) {
      const data = d.data();
      if (
        d.id === cleanId ||
        d.id.toLowerCase() === lower ||
        data.id === cleanId ||
        (data.id && String(data.id).toLowerCase() === lower)
      ) {
        return { ...data, id: d.id } as VIP;
      }
    }
    return null;
  } catch (err) {
    console.warn('Error fetching VIP by ID from Firestore:', err);
    return null;
  }
}

export async function getProductByIdFromFirestore(id: string): Promise<Product | null> {
  try {
    const cleanId = String(id).trim();
    const docRef = doc(db, 'products', cleanId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { ...snap.data(), id: snap.id } as Product;
    }
    const colSnap = await getDocs(collection(db, 'products'));
    const lower = cleanId.toLowerCase();
    for (const d of colSnap.docs) {
      const data = d.data();
      if (
        d.id === cleanId ||
        d.id.toLowerCase() === lower ||
        data.id === cleanId ||
        (data.id && String(data.id).toLowerCase() === lower)
      ) {
        return { ...data, id: d.id } as Product;
      }
    }
    return null;
  } catch (err) {
    console.warn('Error fetching Product by ID from Firestore:', err);
    return null;
  }
}

export async function getOrdersFromFirestore(): Promise<Order[]> {
  try {
    const snap = await getDocs(collection(db, 'orders'));
    const list: Order[] = [];
    snap.forEach(d => list.push({ ...d.data(), id: d.id } as Order));
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (err) {
    console.warn('Error fetching Orders from Firestore:', err);
    return [];
  }
}

export async function getPlayersFromFirestore(): Promise<Player[]> {
  try {
    let snap = await getDocs(collection(db, 'players'));
    const list: Player[] = [];
    snap.forEach(d => list.push({ ...d.data(), id: d.id } as Player));
    // Fallback to users if players empty
    if (list.length === 0) {
      const uSnap = await getDocs(collection(db, 'users'));
      uSnap.forEach(d => list.push({ ...d.data(), id: d.id } as Player));
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (err) {
    console.warn('Error fetching Players from Firestore:', err);
    return [];
  }
}

export async function getEventsFromFirestore(): Promise<ServerEvent[]> {
  try {
    const snap = await getDocs(collection(db, 'events'));
    const list: ServerEvent[] = [];
    snap.forEach(d => list.push({ ...d.data(), id: d.id } as ServerEvent));
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    return list;
  } catch (err) {
    console.warn('Error fetching Events from Firestore:', err);
    return [];
  }
}

export async function getNewsFromFirestore(): Promise<NewsArticle[]> {
  try {
    const snap = await getDocs(collection(db, 'news'));
    const list: NewsArticle[] = [];
    snap.forEach(d => list.push({ ...d.data(), id: d.id } as NewsArticle));
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  } catch (err) {
    console.warn('Error fetching News from Firestore:', err);
    return [];
  }
}

export async function getCommunityFromFirestore(): Promise<SocialLink[]> {
  try {
    let snap = await getDocs(collection(db, 'community'));
    if (snap.empty) {
      snap = await getDocs(collection(db, 'socialLinks'));
    }
    const list: SocialLink[] = [];
    snap.forEach(d => list.push({ ...d.data(), id: d.id } as SocialLink));
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    return list;
  } catch (err) {
    console.warn('Error fetching Community links from Firestore:', err);
    return [];
  }
}

export async function getSettingsFromFirestore(): Promise<ServerSettings | null> {
  try {
    let snap = await getDoc(doc(db, 'settings', 'general'));
    if (!snap.exists()) {
      snap = await getDoc(doc(db, 'serverSettings', 'default'));
    }
    if (snap.exists()) {
      return snap.data() as ServerSettings;
    }
    return null;
  } catch (err) {
    console.warn('Error fetching Settings from Firestore:', err);
    return null;
  }
}

export async function getTicketsFromFirestore(): Promise<SupportTicket[]> {
  try {
    const snap = await getDocs(collection(db, 'tickets'));
    const list: SupportTicket[] = [];
    snap.forEach(d => list.push({ ...d.data(), id: d.id } as SupportTicket));
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (err) {
    console.warn('Error fetching Tickets from Firestore:', err);
    return [];
  }
}

export async function getStatsFromFirestore(): Promise<DashboardStats> {
  try {
    const [pSnap, oSnap] = await Promise.all([
      getDocs(collection(db, 'players')).catch(() => ({ docs: [] } as any)),
      getDocs(collection(db, 'orders')).catch(() => ({ docs: [] } as any))
    ]);

    const orders: Order[] = oSnap.docs ? oSnap.docs.map((d: any) => ({ ...d.data(), id: d.id })) : [];
    const players: Player[] = pSnap.docs ? pSnap.docs.map((d: any) => ({ ...d.data(), id: d.id })) : [];
    const paid = orders.filter((o: Order) => o.status === 'Pago' || o.status === 'Entregue');
    const rev = paid.reduce((acc: number, o: Order) => acc + (o.amount || 0), 0);

    return {
      playersCount: players.length,
      ordersCount: orders.length,
      pendingOrdersCount: orders.filter((o: Order) => o.status === 'Pendente').length,
      paidOrdersCount: paid.length,
      vipsSoldCount: paid.filter((o: Order) => o.productType === 'vip').length,
      totalRevenue: Number(rev.toFixed(2)),
      recentOrders: orders.slice(-10).reverse(),
      recentPlayers: players.slice(-10).reverse()
    };
  } catch (err) {
    console.warn('Error calculating Stats from Firestore:', err);
    return {
      playersCount: 0,
      ordersCount: 0,
      pendingOrdersCount: 0,
      paidOrdersCount: 0,
      vipsSoldCount: 0,
      totalRevenue: 0,
      recentOrders: [],
      recentPlayers: []
    };
  }
}

// -------------------------------------------------------------
// REAL-TIME LISTENERS
// -------------------------------------------------------------
export function subscribeToVips(callback: (vips: VIP[]) => void) {
  return onSnapshot(collection(db, 'vips'), snapshot => {
    const list: VIP[] = [];
    snapshot.forEach(docSnap => {
      list.push({ ...docSnap.data(), id: docSnap.id } as VIP);
    });
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    callback(list);
  }, err => console.error('VIPs sync error:', err));
}

export function subscribeToProducts(callback: (products: Product[]) => void) {
  return onSnapshot(collection(db, 'products'), snapshot => {
    const list: Product[] = [];
    snapshot.forEach(docSnap => {
      list.push({ ...docSnap.data(), id: docSnap.id } as Product);
    });
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    callback(list);
  }, err => console.error('Products sync error:', err));
}

export function subscribeToServerSettings(callback: (settings: ServerSettings) => void) {
  // Listen to official settings/general, with fallback to serverSettings/default
  return onSnapshot(doc(db, 'settings', 'general'), docSnap => {
    if (docSnap.exists()) {
      callback(docSnap.data() as ServerSettings);
    } else {
      // fallback
      getDoc(doc(db, 'serverSettings', 'default')).then(legacySnap => {
        if (legacySnap.exists()) {
          callback(legacySnap.data() as ServerSettings);
        }
      }).catch(() => {});
    }
  }, () => {
    // If permission or error, attempt legacy
    getDoc(doc(db, 'serverSettings', 'default')).then(legacySnap => {
      if (legacySnap.exists()) {
        callback(legacySnap.data() as ServerSettings);
      }
    }).catch(() => {});
  });
}

export function subscribeToSocialLinks(callback: (links: SocialLink[]) => void) {
  return onSnapshot(collection(db, 'community'), snapshot => {
    if (!snapshot.empty) {
      const list: SocialLink[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id } as SocialLink);
      });
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      callback(list);
    } else {
      // fallback to legacy socialLinks
      getDocs(collection(db, 'socialLinks')).then(legacySnap => {
        const list: SocialLink[] = [];
        legacySnap.forEach(docSnap => {
          list.push({ ...docSnap.data(), id: docSnap.id } as SocialLink);
        });
        list.sort((a, b) => (a.order || 0) - (b.order || 0));
        callback(list);
      }).catch(() => {});
    }
  }, err => console.error('Social links sync error:', err));
}

export function subscribeToEvents(callback: (events: ServerEvent[]) => void) {
  return onSnapshot(collection(db, 'events'), snapshot => {
    const list: ServerEvent[] = [];
    snapshot.forEach(docSnap => {
      list.push({ ...docSnap.data(), id: docSnap.id } as ServerEvent);
    });
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    callback(list);
  }, err => console.error('Events sync error:', err));
}

export function subscribeToNews(callback: (news: NewsArticle[]) => void) {
  return onSnapshot(collection(db, 'news'), snapshot => {
    const list: NewsArticle[] = [];
    snapshot.forEach(docSnap => {
      list.push({ ...docSnap.data(), id: docSnap.id } as NewsArticle);
    });
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    callback(list);
  }, err => console.error('News sync error:', err));
}

export function subscribeToOrders(callback: (orders: Order[]) => void) {
  return onSnapshot(collection(db, 'orders'), snapshot => {
    const list: Order[] = [];
    snapshot.forEach(docSnap => {
      list.push({ ...docSnap.data(), id: docSnap.id } as Order);
    });
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(list);
  }, err => console.error('Orders sync error:', err));
}

export function subscribeToPlayers(callback: (players: Player[]) => void) {
  return onSnapshot(collection(db, 'players'), snapshot => {
    if (!snapshot.empty) {
      const list: Player[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Player);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(list);
    } else {
      getDocs(collection(db, 'users')).then(legacySnap => {
        const list: Player[] = [];
        legacySnap.forEach(docSnap => {
          list.push({ ...docSnap.data(), id: docSnap.id } as Player);
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(list);
      }).catch(() => {});
    }
  }, err => console.error('Players sync error:', err));
}

export const subscribeToUsers = subscribeToPlayers;

export function subscribeToTickets(callback: (tickets: SupportTicket[]) => void) {
  return onSnapshot(collection(db, 'tickets'), snapshot => {
    const list: SupportTicket[] = [];
    snapshot.forEach(docSnap => {
      list.push({ ...docSnap.data(), id: docSnap.id } as SupportTicket);
    });
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(list);
  }, err => console.error('Tickets sync error:', err));
}

export function subscribeToHomeConfig(callback: (config: HomeConfig) => void) {
  return onSnapshot(doc(db, 'homeConfig', 'default'), docSnap => {
    if (docSnap.exists()) {
      callback(docSnap.data() as HomeConfig);
    }
  }, err => console.error('Home config sync error:', err));
}

export function subscribeToMenuItems(callback: (items: MenuItem[]) => void) {
  return onSnapshot(collection(db, 'menuItems'), snapshot => {
    const list: MenuItem[] = [];
    snapshot.forEach(docSnap => {
      list.push({ ...docSnap.data(), id: docSnap.id } as MenuItem);
    });
    list.sort((a, b) => a.order - b.order);
    callback(list);
  }, err => console.error('Menu items sync error:', err));
}

export function subscribeToAppearanceConfig(callback: (config: AppearanceConfig) => void) {
  return onSnapshot(doc(db, 'appearanceConfig', 'default'), docSnap => {
    if (docSnap.exists()) {
      callback(docSnap.data() as AppearanceConfig);
    }
  }, err => console.error('Appearance sync error:', err));
}

export function subscribeToFaqItems(callback: (faqs: FaqItem[]) => void) {
  return onSnapshot(collection(db, 'faqItems'), snapshot => {
    const list: FaqItem[] = [];
    snapshot.forEach(docSnap => {
      list.push({ ...docSnap.data(), id: docSnap.id } as FaqItem);
    });
    list.sort((a, b) => a.order - b.order);
    callback(list);
  }, err => console.error('FAQs sync error:', err));
}

// -------------------------------------------------------------
// FIRESTORE DIRECT WRITE MUTATIONS
// -------------------------------------------------------------
export async function saveVipToFirestore(vip: VIP) {
  await setDoc(doc(db, 'vips', vip.id), vip);
}

export async function deleteVipFromFirestore(id: string, name?: string) {
  try {
    const cleanId = id.trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();
    await deleteDoc(doc(db, 'vips', id)).catch(() => {});
    if (cleanId !== id) {
      await deleteDoc(doc(db, 'vips', cleanId)).catch(() => {});
    }
    const snap = await getDocs(collection(db, 'vips'));
    const deletePromises: Promise<void>[] = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const matchId = docSnap.id === id || docSnap.id.toLowerCase() === cleanId || data.id === id || (data.id && String(data.id).toLowerCase() === cleanId);
      const matchName = cleanName && data.name && String(data.name).trim().toLowerCase() === cleanName;
      if (matchId || matchName) {
        deletePromises.push(deleteDoc(doc(db, 'vips', docSnap.id)).catch(() => {}));
      }
    }
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Error in deleteVipFromFirestore:', err);
  }
}

export async function saveProductToFirestore(prod: Product) {
  await setDoc(doc(db, 'products', prod.id), prod);
}

export async function deleteProductFromFirestore(id: string, name?: string) {
  try {
    const cleanId = id.trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();
    await deleteDoc(doc(db, 'products', id)).catch(() => {});
    if (cleanId !== id) {
      await deleteDoc(doc(db, 'products', cleanId)).catch(() => {});
    }
    const snap = await getDocs(collection(db, 'products'));
    const deletePromises: Promise<void>[] = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const matchId = docSnap.id === id || docSnap.id.toLowerCase() === cleanId || data.id === id || (data.id && String(data.id).toLowerCase() === cleanId);
      const matchName = cleanName && data.name && String(data.name).trim().toLowerCase() === cleanName;
      if (matchId || matchName) {
        deletePromises.push(deleteDoc(doc(db, 'products', docSnap.id)).catch(() => {}));
      }
    }
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Error in deleteProductFromFirestore:', err);
  }
}

export async function saveSettingsToFirestore(settings: ServerSettings) {
  await Promise.all([
    setDoc(doc(db, 'settings', 'general'), settings, { merge: true }),
    setDoc(doc(db, 'serverSettings', 'default'), settings, { merge: true })
  ]);
}

export async function saveEventToFirestore(ev: ServerEvent) {
  await setDoc(doc(db, 'events', ev.id), ev);
}

export async function deleteEventFromFirestore(id: string, name?: string) {
  try {
    const cleanId = id.trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();
    await deleteDoc(doc(db, 'events', id)).catch(() => {});
    if (cleanId !== id) {
      await deleteDoc(doc(db, 'events', cleanId)).catch(() => {});
    }
    const snap = await getDocs(collection(db, 'events'));
    const deletePromises: Promise<void>[] = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const matchId = docSnap.id === id || docSnap.id.toLowerCase() === cleanId || data.id === id || (data.id && String(data.id).toLowerCase() === cleanId);
      const matchName = cleanName && data.name && String(data.name).trim().toLowerCase() === cleanName;
      if (matchId || matchName) {
        deletePromises.push(deleteDoc(doc(db, 'events', docSnap.id)).catch(() => {}));
      }
    }
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Error in deleteEventFromFirestore:', err);
  }
}

export async function saveNewsToFirestore(n: NewsArticle) {
  await setDoc(doc(db, 'news', n.id), n);
}

export async function deleteNewsFromFirestore(id: string, title?: string) {
  try {
    const cleanId = id.trim().toLowerCase();
    const cleanTitle = (title || '').trim().toLowerCase();
    await deleteDoc(doc(db, 'news', id)).catch(() => {});
    if (cleanId !== id) {
      await deleteDoc(doc(db, 'news', cleanId)).catch(() => {});
    }
    const snap = await getDocs(collection(db, 'news'));
    const deletePromises: Promise<void>[] = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const matchId = docSnap.id === id || docSnap.id.toLowerCase() === cleanId || data.id === id || (data.id && String(data.id).toLowerCase() === cleanId);
      const matchTitle = cleanTitle && data.title && String(data.title).trim().toLowerCase() === cleanTitle;
      if (matchId || matchTitle) {
        deletePromises.push(deleteDoc(doc(db, 'news', docSnap.id)).catch(() => {}));
      }
    }
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Error in deleteNewsFromFirestore:', err);
  }
}

export async function saveSocialLinkToFirestore(link: SocialLink) {
  await Promise.all([
    setDoc(doc(db, 'community', link.id), link, { merge: true }),
    setDoc(doc(db, 'socialLinks', link.id), link, { merge: true })
  ]);
}

export const saveCommunityLinkToFirestore = saveSocialLinkToFirestore;

export async function deleteSocialLinkFromFirestore(id: string, name?: string) {
  try {
    const cleanId = id.trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();
    await Promise.all([
      deleteDoc(doc(db, 'community', id)).catch(() => {}),
      deleteDoc(doc(db, 'socialLinks', id)).catch(() => {})
    ]);
    if (cleanId !== id) {
      await Promise.all([
        deleteDoc(doc(db, 'community', cleanId)).catch(() => {}),
        deleteDoc(doc(db, 'socialLinks', cleanId)).catch(() => {})
      ]);
    }
    for (const col of ['community', 'socialLinks']) {
      try {
        const snap = await getDocs(collection(db, col));
        const deletePromises: Promise<void>[] = [];
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          const matchId = docSnap.id === id || docSnap.id.toLowerCase() === cleanId || data.id === id || (data.id && String(data.id).toLowerCase() === cleanId);
          const matchName = cleanName && data.name && String(data.name).trim().toLowerCase() === cleanName;
          if (matchId || matchName) {
            deletePromises.push(deleteDoc(doc(db, col, docSnap.id)).catch(() => {}));
          }
        }
        await Promise.all(deletePromises);
      } catch {}
    }
  } catch (err) {
    console.warn('Error in deleteSocialLinkFromFirestore:', err);
  }
}

export const deleteCommunityLinkFromFirestore = deleteSocialLinkFromFirestore;

export async function saveTicketToFirestore(ticket: SupportTicket) {
  await setDoc(doc(db, 'tickets', ticket.id), ticket, { merge: true });
}

export async function deleteTicketFromFirestore(id: string) {
  await deleteDoc(doc(db, 'tickets', id)).catch(() => {});
}

export async function saveOrderToFirestore(order: Order) {
  await setDoc(doc(db, 'orders', order.id), order);
}

export async function deleteOrderFromFirestore(id: string) {
  try {
    const cleanId = id.trim().toLowerCase().replace(/^#/, '');
    await deleteDoc(doc(db, 'orders', id)).catch(() => {});
    await deleteDoc(doc(db, 'orders', id.replace(/^#/, ''))).catch(() => {});
    const snap = await getDocs(collection(db, 'orders'));
    const deletePromises: Promise<void>[] = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const docClean = docSnap.id.toLowerCase().replace(/^#/, '');
      const dataIdClean = (data.id || '').toLowerCase().replace(/^#/, '');
      if (
        docSnap.id === id ||
        docClean === cleanId ||
        dataIdClean === cleanId
      ) {
        deletePromises.push(deleteDoc(doc(db, 'orders', docSnap.id)).catch(() => {}));
      }
    }
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Error in deleteOrderFromFirestore:', err);
  }
}

export async function deleteOrdersBulkFromFirestore(filter: 'all' | 'concluidos' | 'pendentes' | 'cancelados'): Promise<number> {
  try {
    const snap = await getDocs(collection(db, 'orders'));
    const deletePromises: Promise<void>[] = [];
    let count = 0;
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as Order;
      let shouldDelete = false;
      if (filter === 'all') {
        shouldDelete = true;
      } else if (filter === 'concluidos') {
        shouldDelete = data.status === 'Entregue' || data.status === 'Pago';
      } else if (filter === 'pendentes') {
        shouldDelete = data.status === 'Pendente';
      } else if (filter === 'cancelados') {
        shouldDelete = data.status === 'Cancelado';
      }

      if (shouldDelete) {
        count++;
        deletePromises.push(deleteDoc(doc(db, 'orders', docSnap.id)).catch(() => {}));
      }
    }
    await Promise.all(deletePromises);
    return count;
  } catch (err) {
    console.warn('Error in deleteOrdersBulkFromFirestore:', err);
    return 0;
  }
}

function playerDocIdFromNickname(nickname: string): string {
  const bytes = new TextEncoder().encode(nickname.trim().toLowerCase());
  const hex = Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  return `player-${hex}`;
}

export async function getOrCreatePlayerInFirestore(nickname: string): Promise<Player> {
  const clean = nickname.trim();
  const playerRef = doc(db, 'players', playerDocIdFromNickname(clean));
  const snapshot = await getDoc(playerRef);

  if (snapshot.exists()) {
    const existing = { ...snapshot.data(), id: snapshot.id } as Player;
    const updated: Player = {
      ...existing,
      nickname: existing.nickname || clean,
      lastActive: new Date().toISOString()
    };
    await setDoc(playerRef, updated, { merge: true });
    await setDoc(doc(db, 'users', playerRef.id), updated, { merge: true }).catch(() => {});
    return updated;
  }

  const now = new Date().toISOString();
  const player: Player = {
    id: playerRef.id,
    nickname: clean,
    createdAt: now,
    lastActive: now,
    activeVips: [],
    totalSpent: 0,
    ordersCount: 0
  };

  await setDoc(playerRef, player);
  await setDoc(doc(db, 'users', playerRef.id), player).catch(() => {});
  return player;
}

export async function savePlayerToFirestore(player: Player) {
  await Promise.all([
    setDoc(doc(db, 'players', player.id), player, { merge: true }),
    setDoc(doc(db, 'users', player.id), player, { merge: true })
  ]);
}

export const saveUserToFirestore = savePlayerToFirestore;
export const deletePlayerFromFirestore = deleteUserFromFirestore;

export async function getUserByNicknameFromFirestore(nickname: string): Promise<Player | null> {
  try {
    const cleanNick = nickname.trim().toLowerCase();
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    let found: Player | null = null;
    snap.forEach(docSnap => {
      const data = docSnap.data() as Player;
      if (data.nickname && data.nickname.trim().toLowerCase() === cleanNick) {
        found = { ...data, id: docSnap.id };
      }
    });
    return found;
  } catch (err) {
    console.warn('Error fetching user from Firestore:', err);
    return null;
  }
}

export async function getOrCreateUserFromFirestore(nickname: string): Promise<Player> {
  const cleanNick = nickname.trim();
  const lower = cleanNick.toLowerCase();

  try {
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    let found: Player | null = null;
    snap.forEach(docSnap => {
      const data = docSnap.data() as Player;
      if (data.nickname && data.nickname.trim().toLowerCase() === lower) {
        found = { ...data, id: docSnap.id };
      }
    });

    if (found) {
      const updated: Player = {
        ...(found as Player),
        lastActive: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', updated.id), updated, { merge: true }).catch(() => {});
      return updated;
    }

    const newPlayer: Player = {
      id: `player-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      nickname: cleanNick,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      activeVips: [],
      totalSpent: 0,
      ordersCount: 0
    };
    await setDoc(doc(db, 'users', newPlayer.id), newPlayer).catch(() => {});
    return newPlayer;
  } catch (err) {
    console.warn('Could not reach Firestore for user creation, using local fallback:', err);
    return {
      id: `player-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      nickname: cleanNick,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      activeVips: [],
      totalSpent: 0,
      ordersCount: 0
    };
  }
}

export async function deleteUserFromFirestore(id: string, nickname?: string) {
  try {
    const cleanNick = (nickname || '').trim().toLowerCase();
    const cleanId = id.trim().toLowerCase();

    // 1. Direct doc deletion attempts
    const directRefs = [
      doc(db, 'users', id),
      doc(db, 'players', id)
    ];
    if (cleanId !== id) {
      directRefs.push(doc(db, 'users', cleanId));
      directRefs.push(doc(db, 'players', cleanId));
    }
    if (cleanNick) {
      directRefs.push(doc(db, 'users', playerDocIdFromNickname(cleanNick)));
      directRefs.push(doc(db, 'players', playerDocIdFromNickname(cleanNick)));
    }

    for (const dRef of directRefs) {
      await deleteDoc(dRef).catch(() => {});
    }

    // 2. Scan both collections for matching id or nickname to guarantee total removal
    for (const colName of ['users', 'players']) {
      try {
        const snap = await getDocs(collection(db, colName));
        const delPromises: Promise<void>[] = [];
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          const dNick = (data.nickname || '').trim().toLowerCase();
          const dId = (data.id || '').trim().toLowerCase();
          if (
            docSnap.id === id ||
            docSnap.id.toLowerCase() === cleanId ||
            dId === cleanId ||
            (cleanNick && (dNick === cleanNick || docSnap.id.includes(cleanNick)))
          ) {
            delPromises.push(deleteDoc(doc(db, colName, docSnap.id)).catch(() => {}));
          }
        }
        await Promise.all(delPromises);
      } catch (err) {
        console.warn(`Notice scanning ${colName} during user deletion:`, err);
      }
    }
  } catch (err) {
    console.warn('Error in deleteUserFromFirestore:', err);
  }
}

export async function saveHomeConfigToFirestore(config: HomeConfig) {
  await setDoc(doc(db, 'homeConfig', 'default'), config);
}

export async function saveMenuItemToFirestore(item: MenuItem) {
  await setDoc(doc(db, 'menuItems', item.id), item);
}

export async function deleteMenuItemFromFirestore(id: string) {
  await deleteDoc(doc(db, 'menuItems', id));
}

export async function saveAppearanceConfigToFirestore(config: AppearanceConfig) {
  await setDoc(doc(db, 'appearanceConfig', 'default'), config);
}

export async function saveFaqItemToFirestore(faq: FaqItem) {
  await setDoc(doc(db, 'faqItems', faq.id), faq);
}

export async function deleteFaqItemFromFirestore(id: string) {
  await deleteDoc(doc(db, 'faqItems', id));
}

// -------------------------------------------------------------
// IMAGE UPLOAD (FIREBASE STORAGE WITH RESILIENT FALLBACK)
// -------------------------------------------------------------
export async function uploadImage(file: File): Promise<string> {
  try {
    const storage = getStorage();
    const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const storageRef = ref(storage, `uploads/${Date.now()}_${safeName}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  } catch (err) {
    console.warn('Storage upload fallback to dataURL:', err);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
