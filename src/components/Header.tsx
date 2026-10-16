import React, { useState, useEffect, useRef } from "react";
import { Menu, X, User, ShoppingCart, ArrowUpRight } from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";
import { useAdmin } from "../context/AdminContext.tsx";
export const Brand = () => (
  <span className="nc-brand">
    <span className="brand-cube">N</span>
    <span>
      NETCRAFT<span className="brand-br">BR</span>
      <small>MINECRAFT BEDROCK</small>
    </span>
  </span>
);
export function Header({
  currentTab,
  setCurrentTab,
  onOpenPlayModal,
  cartCount = 0,
  onOpenCart,
}: {
  currentTab: string;
  setCurrentTab: (t: string) => void;
  onOpenPlayModal?: () => void;
  cartCount?: number;
  onOpenCart?: () => void;
}) {
  const { player, openLoginModal } = usePlayer();
  const { isAdminLoggedIn, openAdminModal } = useAdmin();
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const nav = [
    ["home", "Início"],
    ["store", "Loja"],
    ["vip", "VIPs"],
    ["server", "Servidor"],
    ["events", "Eventos"],
    ["community", "Comunidade"],
    ["support", "Suporte"],
    ["profile", "Meu perfil"],
  ];
  const select = (t: string) => {
    setCurrentTab(t);
    setOpen(false);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab") {
        const a = Array.from(
            document.querySelectorAll<HTMLButtonElement>(".nc-drawer button"),
          ),
          first = a[0],
          last = a[a.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      trigger.current?.focus();
    };
  }, [open]);
  return (
    <>
      <a href="#main-content" className="skip-link">
        Pular para conteúdo
      </a>
      <header className="nc-header">
        <div className="nc-header-inner">
          <button aria-label="NetCraftBR início" onClick={() => select("home")}>
            <Brand />
          </button>
          <nav className="desktop-nav" aria-label="Principal">
            {nav
              .filter(([id]) => id !== "vip")
              .slice(0, 4)
              .map(([id, label]) => (
                <button
                  key={id}
                  aria-current={currentTab === id ? "page" : undefined}
                  onClick={() => select(id)}
                >
                  {label}
                </button>
              ))}
          </nav>
          <div className="header-actions">
            <button
              className="icon-button header-login"
              aria-label={player ? "Meu perfil" : "Entrar"}
              onClick={() => (player ? select("profile") : openLoginModal())}
            >
              <User size={17} />
              <span className="header-login-label">
                {player ? "Perfil" : "Entrar"}
              </span>
            </button>
            <button
              className="nc-button header-cart"
              aria-label={`Carrinho: ${cartCount} produtos`}
              onClick={onOpenCart}
            >
              <ShoppingCart size={17} />
              <span>Carrinho</span>
              <b>{cartCount}</b>
            </button>
            <button
              ref={trigger}
              className="icon-button"
              aria-label="Abrir menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <div
            className="nc-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-heading">
              <Brand />
              <button
                ref={close}
                className="icon-button"
                aria-label="Fechar menu"
                onClick={() => setOpen(false)}
              >
                <X />
              </button>
            </div>
            <nav>
              {nav.map(([id, label]) => (
                <button
                  key={id}
                  aria-current={currentTab === id ? "page" : undefined}
                  onClick={() => select(id)}
                >
                  {label}
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </nav>
            <button
              onClick={() => {
                setOpen(false);
                isAdminLoggedIn ? select("admin") : openAdminModal();
              }}
            >
              Administração
            </button>
          </div>
        </div>
      )}
    </>
  );
}
