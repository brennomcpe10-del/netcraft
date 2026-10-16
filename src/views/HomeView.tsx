import React from "react";
import { ArrowRight, Copy, Play, Shield, Users, Swords } from "lucide-react";
import {
  ServerSettings,
  VIP,
  Product,
  ServerEvent,
  NewsArticle,
  SocialLink,
} from "../types/index.ts";
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
  onBuyItem: (i: VIP | Product, t: "vip" | "product") => void;
}
export function HomeView({
  setCurrentTab,
  settings,
  vips,
  events,
  news,
  socialLinks,
  onBuyItem,
}: Props) {
  const { showSuccess, showError } = useToast();
  const ip = settings?.ip || "netcraftbr.srvmc.com",
    port = settings?.port || 25673;
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      showSuccess("Copiado!");
    } catch {
      showError("Não foi possível copiar. Selecione o endereço.");
    }
  };
  const discord = socialLinks.find((s) => s.active && s.platform === "discord");
  return (
    <div>
      <section className="nc-hero">
        <img
          className="hero-image"
          src="/hero_landscape.webp"
          alt="Paisagem de Minecraft com montanhas e construções"
          fetchPriority="high"
        />
        <div className="hero-shade" />
        <div className="hero-content nc-container">
          <span className="eyebrow">SEU PRÓXIMO MUNDO • BEDROCK</span>
          <h1>
            Uma nova aventura.
            <br />
            <em>A sua história.</em>
          </h1>
          <p>Construa seu lugar, encontre seu clã e viva o NetCraftBR.</p>
          <div className="hero-buttons">
            <button
              className="nc-button"
              onClick={() => setCurrentTab("server")}
            >
              <Play size={17} />
              JOGAR AGORA
            </button>
            <button
              className="nc-button secondary"
              onClick={() => setCurrentTab("vip")}
            >
              LOJA VIP
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="connection-bar">
            <button onClick={() => copy(ip)} aria-label="Copiar IP">
              <span>
                <small>ENDEREÇO IP</small>
                <strong>{ip}</strong>
              </span>
              <Copy size={15} />
            </button>
            <button
              onClick={() => copy(String(port))}
              aria-label="Copiar porta"
            >
              <span>
                <small>PORTA</small>
                <strong>{port}</strong>
              </span>
              <Copy size={15} />
            </button>
          </div>
        </div>
      </section>
      <section className="nc-container nc-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">DÊ UM UPGRADE NA SUA JORNADA</span>
            <h2>Seu próximo nível.</h2>
          </div>
          <button className="text-link" onClick={() => setCurrentTab("vip")}>
            Todos os VIPs
            <ArrowRight size={17} />
          </button>
        </div>
        <div className="catalog-grid">
          {vips
            .filter((v) => v.active)
            .sort((a, b) => a.order - b.order)
            .slice(0, 3)
            .map((v) => (
              <ProductCard
                key={v.id}
                item={v}
                onBuy={() => onBuyItem(v, "vip")}
              />
            ))}
        </div>
        {!vips.some((v) => v.active) && (
          <p className="empty-state">Consulte os planos disponíveis na loja.</p>
        )}
      </section>
      <section className="nc-container nc-section">
        <span className="eyebrow">MUITO ALÉM DE SOBREVIVER</span>
        <h2>Um mundo de possibilidades.</h2>
        <div className="feature-grid">
          {[
            {
              Icon: Shield,
              title: "Seu espaço, sua construção",
              text: "Proteja seu terreno e construa a sua história.",
            },
            {
              Icon: Users,
              title: "Jogue junto",
              text: "Reúna seu clã, crie alianças e encontre novos amigos.",
            },
            {
              Icon: Swords,
              title: "Viva o desafio",
              text: "Economia, batalhas e eventos para movimentar sua jornada.",
            },
          ].map(({ Icon, title, text }) => (
            <article className="feature-card" key={title}>
              <Icon size={25} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="nc-container nc-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ACONTECE NO NETCRAFT</span>
            <h2>Fique por dentro.</h2>
          </div>
          <button className="text-link" onClick={() => setCurrentTab("events")}>
            Eventos
            <ArrowRight size={17} />
          </button>
        </div>
        <div className="updates-grid">
          {events
            .filter((e) => e.published && e.status !== "Encerrado")
            .slice(0, 2)
            .map((e) => (
              <button
                className="update-card"
                key={e.id}
                onClick={() => setCurrentTab("events")}
              >
                {e.image && <img src={e.image} alt="" loading="lazy" />}
                <span className="eyebrow">
                  {e.status} • {e.date}
                </span>
                <h3>{e.name}</h3>
                <p>{e.description}</p>
              </button>
            ))}
          {news
            .filter((n) => n.published)
            .slice(0, 2)
            .map((n) => (
              <article className="update-card" key={n.id}>
                {n.image && <img src={n.image} alt="" loading="lazy" />}
                <span className="eyebrow">{n.category}</span>
                <h3>{n.title}</h3>
                <details>
                  <summary>{n.summary || "Ler novidade"}</summary>
                  <p>{n.content}</p>
                </details>
              </article>
            ))}
        </div>
        {!events.some((e) => e.published && e.status !== "Encerrado") &&
          !news.some((n) => n.published) && (
            <p className="empty-state">
              Novos eventos e novidades serão anunciados aqui.
            </p>
          )}
      </section>
      <section className="nc-container">
        <div className="community-banner">
          <div>
            <span className="eyebrow">A AVENTURA CONTINUA FORA DO JOGO</span>
            <h2>Encontre sua comunidade.</h2>
            <p>Converse com a galera e acompanhe as novidades.</p>
          </div>
          {discord ? (
            <a
              className="nc-button"
              href={discord.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Entrar no Discord
              <ArrowRight size={17} />
            </a>
          ) : (
            <button
              className="nc-button"
              onClick={() => setCurrentTab("community")}
            >
              Conhecer comunidade
              <ArrowRight size={17} />
            </button>
          )}
        </div>
      </section>
      <section className="nc-container nc-section faq-section">
        <div>
          <span className="eyebrow">ANTES DE COMEÇAR</span>
          <h2>Alguma dúvida?</h2>
          <button
            className="text-link"
            onClick={() => setCurrentTab("support")}
          >
            Falar com o suporte
            <ArrowRight size={17} />
          </button>
        </div>
        <div>
          <details>
            <summary>Como entrar no NetCraftBR?</summary>
            <p>
              No Minecraft Bedrock, acesse Jogar → Servidores → Adicionar
              servidor. Informe {ip} e a porta {port}.
            </p>
          </details>
          <details>
            <summary>Preciso de VIP para jogar?</summary>
            <p>
              Você pode conhecer o servidor sem comprar um plano. Veja os
              benefícios de cada VIP na loja.
            </p>
          </details>
          <details>
            <summary>Como acompanho minha compra?</summary>
            <p>
              Acesse Meu perfil com sua gamertag para consultar pedidos. A
              confirmação e a entrega seguem o processo atual da equipe.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
