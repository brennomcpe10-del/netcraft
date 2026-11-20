import React from "react";
import { Brand } from "./Header.tsx";
import { ServerSettings } from "../types/index.ts";
export function Footer({
  setCurrentTab,
  settings,
}: {
  setCurrentTab: (t: string) => void;
  settings: ServerSettings | null;
}) {
  return (
    <footer className="nc-footer">
      <div className="nc-container footer-top">
        <div>
          <Brand />
          <p>Seu mundo. Sua comunidade. Sua história.</p>
          <small>
            {settings?.ip || "netcraftbr.srvmc.com"} · {settings?.port || 25673}
          </small>
        </div>
        <nav aria-label="Rodapé">
          {[
            ["store", "Loja"],
            ["server", "Como jogar"],
            ["community", "Comunidade"],
            ["support", "Suporte"],
            ["profile", "Meus pedidos"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setCurrentTab(id);
                window.scrollTo(0, 0);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
      <div className="nc-container footer-bottom">
        <span>© {new Date().getFullYear()} NetCraftBR</span>
        <span>Não afiliado à Mojang ou Microsoft.</span>
      </div>
    </footer>
  );
}
