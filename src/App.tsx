import {IdentityProvider} from "./context/IdentityContext.tsx";
import { CartProvider, useCart } from "./context/CartContext.tsx";
import { CartView } from "./views/CartView.tsx";
import { useStoreCategories } from "./hooks/useStoreCategories.ts";
import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { ToastProvider, useToast } from "./context/ToastContext.tsx";
import { PlayerProvider } from "./context/PlayerContext.tsx";
import { AdminProvider, useAdmin } from "./context/AdminContext.tsx";

import { Header } from "./components/Header.tsx";
import { Footer } from "./components/Footer.tsx";
import { NicknameModal } from "./components/modals/NicknameModal.tsx";
import { AdminLoginModal } from "./components/modals/AdminLoginModal.tsx";

import { HomeView } from "./views/HomeView.tsx";
import { ServerView } from "./views/ServerView.tsx";
import { VipView } from "./views/VipView.tsx";
import { StoreView } from "./views/StoreView.tsx";
import { EventsView } from "./views/EventsView.tsx";
import { NewsView } from "./views/NewsView.tsx";
import { CommunityView } from "./views/CommunityView.tsx";
import { SupportView } from "./views/SupportView.tsx";
import { ProfileView } from "./views/ProfileView.tsx";
const AdminView = lazy(() =>
  import("./views/AdminView.tsx").then((module) => ({
    default: module.AdminView,
  })),
);

import {
  VIP,
  Product,
  ServerEvent,
  NewsArticle,
  ServerSettings,
  SocialLink,
} from "./types/index.ts";


function MainAppContent() {
  const categories = useStoreCategories();
  const cart = useCart();
  const { showSuccess } = useToast();
  const [currentTab, setCurrentTab] = useState<string>("home");
  const [storeCategory, setStoreCategory] = useState("all");
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [vips, setVips] = useState<VIP[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);

  const { isAdminLoggedIn, isAdminChecking, openAdminModal } = useAdmin();

  const [catalogError, setCatalogError] = useState("");

  // Product prices and availability must come from the same backend used by Pix.
  // Firestore browser listeners can race with an authoritative catalog response.
  const fetchGlobalData = useCallback(async () => {
    async function readJson(path: string): Promise<unknown> {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`API indisponível: ${path}`);
      return res.json();
    }
    const [catalog, config, eventsResult, newsResult, communityResult] =
      await Promise.allSettled([
        readJson("/api/storefront/catalog"),
        readJson("/api/settings"),
        readJson("/api/events"),
        readJson("/api/news"),
        readJson("/api/community"),
      ]);
    if (catalog.status === "fulfilled" && catalog.value &&
        typeof catalog.value === "object") {
      const data = catalog.value as {products?: unknown; vips?: unknown};
      if (Array.isArray(data.products) && Array.isArray(data.vips)) {
        setProducts(data.products as Product[]);
        setVips(data.vips as VIP[]);
        setCatalogError("");
      } else {
        setProducts([]);
        setVips([]);
        setCatalogError("Não foi possível validar o catálogo oficial da loja.");
      }
    } else {
      // Fail closed: never show stale prices from an unauthenticated client snapshot.
      setProducts([]);
      setVips([]);
      setCatalogError("Catálogo temporariamente indisponível. Não é possível realizar compras.");
    }
    if (config.status === "fulfilled" && config.value &&
        typeof config.value === "object") {
      setSettings(config.value as ServerSettings);
    }
    if (eventsResult.status === "fulfilled" && Array.isArray(eventsResult.value))
      setEvents(eventsResult.value as ServerEvent[]);
    if (newsResult.status === "fulfilled" && Array.isArray(newsResult.value))
      setNews(newsResult.value as NewsArticle[]);
    if (communityResult.status === "fulfilled" && Array.isArray(communityResult.value))
      setSocialLinks(communityResult.value as SocialLink[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchGlobalData();
    // Cross-device changes are fetched through the server rather than
    // subscriptions to collections whose writes must be protected.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchGlobalData();
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchGlobalData();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchGlobalData]);

  // 3. Support for accessing admin panel via /admin or #admin
  useEffect(() => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    if (!isAdminChecking && (path === "/admin" || path === "/admin/" || hash === "#admin")) {
      if (isAdminLoggedIn) {
        setCurrentTab("admin");
      } else {
        openAdminModal();
      }
    }
  }, [isAdminLoggedIn, isAdminChecking, openAdminModal]);

  useEffect(() => {
    if (currentTab === "admin" && !isAdminChecking && !isAdminLoggedIn) {
      setCurrentTab("home");
      openAdminModal();
    }
  }, [currentTab, isAdminChecking, isAdminLoggedIn, openAdminModal]);

  // Handle buy item trigger
  const handleBuyItem = (item: VIP | Product, type: "vip" | "product") => {
    cart.add(item, type);
    showSuccess(`${item.name}: carrinho atualizado.`);
  };

  // If viewing admin panel, show AdminView full screen
  if (currentTab === "admin" && isAdminLoggedIn) {
    return (
      <Suspense
        fallback={
          <p role="status" className="p-8">
            Carregando administração…
          </p>
        }
      >
        <AdminView
          onExit={() => {
            setCurrentTab("home");
            if (window.location.pathname.includes("/admin")) {
              window.history.pushState(null, "", "/");
            }
          }}
          onRefreshGlobalData={fetchGlobalData}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#06090e] text-zinc-100 antialiased relative selection:bg-[#00e676]/20 selection:text-[#00e676] overflow-x-hidden w-full">
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
        cartCount={cart.count}
        onOpenCart={() => {
          setCurrentTab("cart");
          window.scrollTo(0, 0);
        }}
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          if (tab === "store") setStoreCategory("all");
          setCurrentTab(tab);
        }}
        onOpenPlayModal={() => {
          setCurrentTab("server");
        }}
      />

      {/* Main Content */}
      <main
        id="main-content"
        className="flex-1 relative w-full overflow-x-hidden"
      >
        {catalogError && (currentTab === "store" || currentTab === "vip" || currentTab === "cart") && (
          <p role="alert" className="mx-auto max-w-5xl my-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            {catalogError}
          </p>
        )}
        {currentTab === "home" && (
          <HomeView
            setCurrentTab={setCurrentTab}
            settings={settings}
            categories={categories}
            onExploreCategory={setStoreCategory}
            vips={vips}
            products={products}
            events={events}
            news={news}
            socialLinks={socialLinks}
            onBuyItem={handleBuyItem}
          />
        )}

        {currentTab === "cart" && (
          <CartView
            products={products}
            vips={vips}
            onShop={() => {
              setStoreCategory("all");
              setCurrentTab("store");
            }}
          />
        )}
        {currentTab === "server" && <ServerView settings={settings} />}

        {currentTab === "vip" && (
          <StoreView
            categories={categories}
            initialCategory="vips"
            products={products}
            vips={vips}
            loading={loading}
            onCategoryChange={(id) => {
              setStoreCategory(id);
              setCurrentTab("store");
            }}
            onBuyItem={handleBuyItem}
          />
        )}

        {currentTab === "store" && (
          <StoreView
            categories={categories}
            initialCategory={storeCategory}
            onCategoryChange={setStoreCategory}
            products={products}
            vips={vips}
            loading={loading}
            onBuyItem={handleBuyItem}
          />
        )}

        {currentTab === "events" && (
          <EventsView events={events} loading={loading} />
        )}

        {currentTab === "community" && (
          <CommunityView socialLinks={socialLinks} />
        )}

        {currentTab === "support" && <SupportView />}

        {currentTab === "profile" && (
          <ProfileView setCurrentTab={setCurrentTab} />
        )}
      </main>

      {/* Footer */}
      <Footer
        setCurrentTab={(tab) => {
          if (tab === "store") setStoreCategory("all");
          setCurrentTab(tab);
        }}
        settings={settings}
      />

      {/* MODALS */}
      <NicknameModal />
      <AdminLoginModal
        onSuccessRedirect={() => {
          setCurrentTab("admin");
        }}
      />

    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <IdentityProvider>
      <PlayerProvider>
        <AdminProvider>
          <CartProvider>
            <MainAppContent />
          </CartProvider>
        </AdminProvider>
      </PlayerProvider>
    </IdentityProvider>
    </ToastProvider>
  );
}
