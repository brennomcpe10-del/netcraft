import React, { useState, useEffect, useCallback } from 'react';
import { ToastProvider } from './context/ToastContext.tsx';
import { PlayerProvider } from './context/PlayerContext.tsx';
import { AdminProvider, useAdmin } from './context/AdminContext.tsx';

import { Header } from './components/Header.tsx';
import { Footer } from './components/Footer.tsx';
import { NicknameModal } from './components/modals/NicknameModal.tsx';
import { AdminLoginModal } from './components/modals/AdminLoginModal.tsx';
import { CheckoutModal } from './components/modals/CheckoutModal.tsx';

import { HomeView } from './views/HomeView.tsx';
import { ServerView } from './views/ServerView.tsx';
import { VipView } from './views/VipView.tsx';
import { StoreView } from './views/StoreView.tsx';
import { EventsView } from './views/EventsView.tsx';
import { NewsView } from './views/NewsView.tsx';
import { CommunityView } from './views/CommunityView.tsx';
import { SupportView } from './views/SupportView.tsx';
import { ProfileView } from './views/ProfileView.tsx';
import { AdminView } from './views/AdminView.tsx';

import { VIP, Product, ServerEvent, NewsArticle, ServerSettings, SocialLink } from './types/index.ts';
import {
  seedFirestoreIfEmpty,
  subscribeToVips,
  subscribeToProducts,
  subscribeToServerSettings,
  subscribeToEvents,
  subscribeToNews,
  subscribeToSocialLinks,
  getVipsFromFirestore,
  getProductsFromFirestore,
  getEventsFromFirestore,
  getNewsFromFirestore,
  getSettingsFromFirestore,
  getCommunityFromFirestore
} from './lib/firestoreSync.ts';

function MainAppContent() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [vips, setVips] = useState<VIP[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);

  // Active checkout item modal state
  const [checkoutItem, setCheckoutItem] = useState<{
    item: VIP | Product;
    type: 'vip' | 'product';
  } | null>(null);

  const { isAdminLoggedIn, openAdminModal } = useAdmin();

  // 1. Initial Firestore data fetch (Official Source of Truth)
  const fetchGlobalData = useCallback(async () => {
    try {
      const [st, v, p, ev, nw, soc] = await Promise.all([
        getSettingsFromFirestore(),
        getVipsFromFirestore(),
        getProductsFromFirestore(),
        getEventsFromFirestore(),
        getNewsFromFirestore(),
        getCommunityFromFirestore()
      ]);
      if (st) setSettings(st);
      if (v) setVips(v);
      if (p) setProducts(p);
      if (ev) setEvents(ev);
      if (nw) setNews(nw);
      if (soc) setSocialLinks(soc);
    } catch (err) {
      console.warn('Firestore initial fetch notice:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Real-time Firestore synchronization across all devices
  useEffect(() => {
    // Seed Firestore if collections are empty
    seedFirestoreIfEmpty().catch(() => {});

    // Fallback load
    fetchGlobalData();

    // Attach real-time listeners for live updates across all devices
    const unsubVips = subscribeToVips(liveVips => {
      setVips(liveVips);
    });

    const unsubProds = subscribeToProducts(liveProds => {
      setProducts(liveProds);
    });

    const unsubSettings = subscribeToServerSettings(liveSettings => {
      if (liveSettings) setSettings(liveSettings);
    });

    const unsubEvents = subscribeToEvents(liveEvents => {
      setEvents(liveEvents);
    });

    const unsubNews = subscribeToNews(liveNews => {
      setNews(liveNews);
    });

    const unsubSocial = subscribeToSocialLinks(liveSocial => {
      setSocialLinks(liveSocial);
    });

    return () => {
      unsubVips();
      unsubProds();
      unsubSettings();
      unsubEvents();
      unsubNews();
      unsubSocial();
    };
  }, [fetchGlobalData]);

  // 3. Support for accessing admin panel via /admin or #admin
  useEffect(() => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    if (path.includes('/admin') || hash === '#admin') {
      if (isAdminLoggedIn) {
        setCurrentTab('admin');
      } else {
        openAdminModal();
      }
    }
  }, [isAdminLoggedIn, openAdminModal]);

  // Handle buy item trigger
  const handleBuyItem = (item: VIP | Product, type: 'vip' | 'product') => {
    setCheckoutItem({ item, type });
  };

  // If viewing admin panel, show AdminView full screen
  if (currentTab === 'admin') {
    if (!isAdminLoggedIn) {
      openAdminModal();
      setCurrentTab('home');
      return null;
    }
    return (
      <AdminView
        onExit={() => {
          setCurrentTab('home');
          if (window.location.pathname.includes('/admin')) {
            window.history.pushState(null, '', '/');
          }
        }}
        onRefreshGlobalData={fetchGlobalData}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#06090e] text-zinc-100 antialiased relative selection:bg-[#00e676]/20 selection:text-[#00e676]">
      {/* Minecraft Sunset Landscape background with atmospheric overlays matching reference */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.12] filter blur-[0.5px] scale-[1.02] transform transition-transform duration-1000"
          style={{ backgroundImage: `url('/hero_sunset.jpg')` }}
        />
        {/* Layered dark gradients for pristine readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#06090e]/85 via-[#06090e]/95 to-[#06090e]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(0,230,118,0.06),transparent_70%)]" />
      </div>

      {/* Header with [NETCRAFTBR] and [Nick] [Menu] */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenPlayModal={() => {
          setCurrentTab('server');
        }}
      />

      {/* Main Content */}
      <main className="flex-1 relative">
        {currentTab === 'home' && (
          <HomeView
            setCurrentTab={setCurrentTab}
            settings={settings}
            vips={vips}
            products={products}
            events={events}
            news={news}
            socialLinks={socialLinks}
            onBuyItem={handleBuyItem}
          />
        )}

        {currentTab === 'server' && (
          <ServerView settings={settings} />
        )}

        {currentTab === 'vip' && (
          <VipView
            vips={vips}
            loading={loading}
            onBuyVip={vip => handleBuyItem(vip, 'vip')}
          />
        )}

        {currentTab === 'store' && (
          <StoreView
            products={products}
            vips={vips}
            loading={loading}
            onBuyItem={handleBuyItem}
          />
        )}

        {currentTab === 'events' && (
          <EventsView
            events={events}
            loading={loading}
          />
        )}

        {currentTab === 'community' && (
          <CommunityView socialLinks={socialLinks} />
        )}

        {currentTab === 'support' && (
          <SupportView />
        )}

        {currentTab === 'profile' && (
          <ProfileView setCurrentTab={setCurrentTab} />
        )}
      </main>

      {/* Footer */}
      <Footer
        setCurrentTab={setCurrentTab}
        settings={settings}
      />

      {/* MODALS */}
      <NicknameModal />
      <AdminLoginModal
        onSuccessRedirect={() => {
          setCurrentTab('admin');
        }}
      />

      {checkoutItem && (
        <CheckoutModal
          item={checkoutItem.item}
          itemType={checkoutItem.type}
          livePixUrl={settings?.livePixUrl}
          pixUrl={settings?.pixUrl}
          onClose={() => setCheckoutItem(null)}
          onSuccess={async () => {
            await fetchGlobalData();
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <PlayerProvider>
        <AdminProvider>
          <MainAppContent />
        </AdminProvider>
      </PlayerProvider>
    </ToastProvider>
  );
}
