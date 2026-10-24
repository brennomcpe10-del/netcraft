import React from "react";
import { ArrowRight, Copy } from "lucide-react";
import {
  ServerSettings,
  VIP,
  Product,
  ServerEvent,
  NewsArticle,
  SocialLink,
} from "../types/index.ts";
import {
  StoreCategory,
  defaultStoreCategories,
} from "../lib/storeCategories.ts";
import { CategoryGrid } from "../components/CategoryGrid.tsx";
import { ProductCard } from "../components/ProductCard.tsx";
import { useToast } from "../context/ToastContext.tsx";
interface Props {
  setCurrentTab: (t: string) => void;
  settings: ServerSettings | null;
  vips: VIP[];
  products: Product[];
  events: ServerEvent[];
  news: NewsArticle[];
  socialLinks: SocialLink[];
  categories?: StoreCategory[];
  onExploreCategory?: (id: string) => void;
  onBuyItem: (item: VIP | Product, type: "vip" | "product") => void;
}
export function HomeView({
  setCurrentTab,
  settings,
  vips,
  products,
  categories = defaultStoreCategories,
  onExploreCategory,
  onBuyItem,
}: Props) {
  const { showSuccess, showError } = useToast();
  const ip = settings?.ip || "netcraftbr.srvmc.com",
    port = settings?.port || 25673;
  const select = (id: string) => {
    onExploreCategory?.(id);
    setCurrentTab("store");
    window.scrollTo(0, 0);
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showSuccess("Copiado!");
    } catch {
      showError("Não foi possível copiar. Selecione o endereço abaixo.");
    }
  };
  const featured = [
    ...vips
      .filter((v) => v.active && v.isPopular)
      .map((item) => ({ item, type: "vip" as const })),
    ...products
      .filter((p) => p.active && p.featured)
      .map((item) => ({ item, type: "product" as const })),
  ]
    .sort((a, b) => a.item.order - b.item.order)
    .slice(0, 4);
  return (
    <div className="shop-home">
      <section className="shop-banner">
        <img src="/hero_landscape.webp" alt="" fetchPriority="high" />
        <div className="nc-container">
          <span className="eyebrow">LOJA OFICIAL • MINECRAFT BEDROCK</span>
          <h1>
            NETCRAFT<span>BR</span> <em>Loja</em>
          </h1>
          <p>
            Seu próximo equipamento. Sua próxima aventura.
            <br />
            Explore VIPs, kits e itens para jogar do seu jeito.
          </p>
          <a href="#store-categories" className="nc-button">
            Explorar categorias
            <ArrowRight size={17} />
          </a>
        </div>
      </section>
      <section className="nc-container shop-section" id="store-categories">
        <div className="shop-section-heading">
          <span className="eyebrow">ESCOLHA SUA PRÓXIMA AVENTURA</span>
          <h2>CATEGORIAS DA LOJA</h2>
        </div>
        <CategoryGrid
          categories={categories}
          products={products}
          vips={vips}
          onSelect={select}
        />
      </section>
      {featured.length > 0 && (
        <section className="nc-container shop-section">
          <div className="section-heading">
            <h2>Produtos em destaque</h2>
            <button className="text-link" onClick={() => select("all")}>
              Ver loja completa
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="catalog-grid">
            {featured.map(({ item, type }) => (
              <ProductCard
                key={`${type}-${item.id}`}
                item={item}
                onBuy={() => onBuyItem(item, type)}
              />
            ))}
          </div>
        </section>
      )}
      <section className="nc-container shop-section">
        <div className="shop-connect">
          <div>
            <span className="eyebrow">NOS ENCONTRAMOS NO JOGO</span>
            <h2>Conecte-se ao NetCraftBR</h2>
            <p>Adicione o servidor no Minecraft Bedrock.</p>
          </div>
          <div className="connection-bar">
            <button onClick={() => copy(ip)} aria-label="Copiar IP">
              <span>
                <small>ENDEREÇO IP</small>
                <strong>{ip}</strong>
              </span>
              <Copy size={16} />
            </button>
            <button
              onClick={() => copy(String(port))}
              aria-label="Copiar porta"
            >
              <span>
                <small>PORTA</small>
                <strong>{port}</strong>
              </span>
              <Copy size={16} />
            </button>
          </div>
        </div>
      </section>
      <section className="nc-container shop-section shop-help">
        <div>
          <span className="eyebrow">PRECISA DE AJUDA?</span>
          <h2>Fale com a equipe.</h2>
          <p>
            Tire dúvidas sobre os produtos e acompanhe sua compra pelo perfil.
          </p>
        </div>
        <button
          className="nc-button secondary"
          onClick={() => setCurrentTab("support")}
        >
          Acessar suporte
          <ArrowRight size={17} />
        </button>
      </section>
      <section className="nc-container nc-section faq-section">
        <div>
          <span className="eyebrow">DÚVIDAS SOBRE A LOJA</span>
          <h2>Perguntas frequentes</h2>
        </div>
        <div>
          <details>
            <summary>Como escolher um produto?</summary>
            <p>
              Abra uma categoria, confira os benefícios e adicione o produto ao
              carrinho. Você pode revisar sua seleção antes de continuar.
            </p>
          </details>
          <details>
            <summary>Como acompanho um pedido?</summary>
            <p>
              Acesse Meu perfil com sua gamertag. O pagamento será conferido
              antes da entrega pela equipe.
            </p>
          </details>
          <details>
            <summary>Posso pagar vários produtos juntos?</summary>
            <p>
              O carrinho mantém sua seleção. A cobrança conjunta ainda está em
              preparação; os links atuais aceitam uma unidade por checkout.
            </p>
          </details>
          <details>
            <summary>Preciso de VIP para jogar?</summary>
            <p>
              Você pode entrar no servidor sem comprar um plano. Confira os
              benefícios de cada produto na loja.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
