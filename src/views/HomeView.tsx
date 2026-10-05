import React, { useState } from 'react';
import { ServerSettings, VIP, Product, ServerEvent, NewsArticle, SocialLink } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import {
  Copy,
  Check,
  Play,
  ArrowRight,
  Shield,
  Users,
  Star,
  Target,
  Settings as SettingsIcon,
  CheckCircle2,
  Smartphone,
  Laptop,
  Gamepad2,
  X,
  ExternalLink,
  Flame,
  Crown
} from 'lucide-react';

interface HomeViewProps {
  setCurrentTab: (tab: string) => void;
  settings: ServerSettings | null;
  vips: VIP[];
  products: Product[];
  events: ServerEvent[];
  news: NewsArticle[];
  socialLinks: SocialLink[];
  onBuyItem: (item: VIP | Product, type: 'vip' | 'product') => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  setCurrentTab,
  settings,
  vips,
  products,
  events,
  news,
  socialLinks,
  onBuyItem
}) => {
  const { showSuccess } = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedPort, setCopiedPort] = useState(false);
  const [showPlayModal, setShowPlayModal] = useState(false);
  const [activePlayDevice, setActivePlayDevice] = useState<'mobile' | 'pc' | 'console'>('mobile');

  const serverIp = settings?.ip || 'netcraftbr.srvmc.com';
  const serverPort = settings?.port || 25673;

  const handleCopyIp = () => {
    navigator.clipboard.writeText(serverIp);
    setCopied(true);
    showSuccess(`IP copiado: ${serverIp}`);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyPort = () => {
    navigator.clipboard.writeText(String(serverPort));
    setCopiedPort(true);
    showSuccess(`Porta copiada: ${serverPort}`);
    setTimeout(() => setCopiedPort(false), 2500);
  };

  // 5 Feature Cards matching the Halloween theme
  const referenceFeatures = [
    {
      title: 'ECONOMIA & DOCES',
      desc: 'Trabalhe, compre, venda e troque doces comemorativos.',
      icon: Shield
    },
    {
      title: 'CLÃS & BATALHAS NOTURNAS',
      desc: 'Forme seu clã, dispute territórios e enfrente hordas sombrias.',
      icon: Users
    },
    {
      title: 'EVENTOS DE HALLOWEEN',
      desc: 'Participe da Arena do Terror e ganhe recompensas lendárias.',
      icon: Star
    },
    {
      title: 'SISTEMA DE PROCURADOS',
      desc: 'Faça justiça no reino, ou torne-se a lenda mais temida da noite.',
      icon: Target
    },
    {
      title: 'ADDONS EXCLUSIVOS',
      desc: 'Mecânicas mágicas, vassouras e poções personalizadas para Bedrock.',
      icon: SettingsIcon
    }
  ];

  // Checklist items in "O QUE TE ESPERA?" matching the Halloween edition
  const whatToExpectItems = [
    'Arena Noturna & Mobs do Terror',
    'Caça aos Doces & Abóboras Mágicas',
    'Cidades, Vilas e Terrenos Seguros',
    'Bosses Noturnos com Drops Raros',
    'Mercado, Banco e Assaltos',
    'Guerras de Clãs & Disputas',
    'Trabalhos, Empregos & Economia',
    'Sistema de Procurados & Recompensas',
    'OriginsPE Customizado & Feitiços',
    'Cosméticos e Kits de Halloween!'
  ];

  return (
    <div className="space-y-8 sm:space-y-16 md:space-y-20 lg:space-y-28 pb-8 sm:pb-20">
      {/* ============================================================ */}
      {/* 1. HERO SECTION (HALLOWEEN THEMED) */}
      {/* ============================================================ */}
      <section className="relative min-h-[420px] sm:min-h-[580px] lg:min-h-[660px] flex items-center overflow-hidden border-b border-[#ea580c]/25">
        {/* Background Minecraft Halloween Landscape Image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0 scale-105 transition-transform duration-1000"
          style={{ backgroundImage: `url('/halloween_hero.jpg')` }}
        >
          {/* Spooky dark fog overlays */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#08070d]/95 via-[#08070d]/85 to-[#08070d]/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#08070d] via-transparent to-[#08070d]/85" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-600/[0.14] via-purple-950/[0.1] to-transparent" />
        </div>

        {/* Ambient floating Halloween sparks */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-1">
          <div className="absolute bottom-10 left-[12%] w-2 h-2 rounded-full bg-[#ff7a00] blur-[1px] spark-float" style={{ animationDelay: '0s' }} />
          <div className="absolute bottom-16 left-[30%] w-1.5 h-1.5 rounded-full bg-[#f59e0b] blur-[1px] spark-float" style={{ animationDelay: '1.2s' }} />
          <div className="absolute bottom-12 left-[52%] w-2.5 h-2.5 rounded-full bg-[#ea580c] blur-[1px] spark-float" style={{ animationDelay: '2.5s' }} />
          <div className="absolute bottom-8 left-[72%] w-1.5 h-1.5 rounded-full bg-[#c084fc] blur-[1px] spark-float" style={{ animationDelay: '0.8s' }} />
          <div className="absolute bottom-20 left-[88%] w-2 h-2 rounded-full bg-[#ff7a00] blur-[1px] spark-float" style={{ animationDelay: '3.1s' }} />
        </div>

        {/* Pixel Block Edge Accents (Halloween Orange & Purple) */}
        <div className="absolute top-10 left-0 flex flex-col gap-1 pointer-events-none opacity-40">
          <div className="w-5 h-5 bg-[#ff7a00]" />
          <div className="w-5 h-5 bg-[#ff9800]/60" />
          <div className="w-5 h-5 bg-[#c084fc]/30" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-16 relative z-10 w-full flex flex-col lg:flex-row items-center justify-between gap-6 sm:gap-12">
          {/* Left content + Hanging Jack-o'-Lantern Banner */}
          <div className="flex items-start gap-4 sm:gap-6 max-w-2xl w-full">
            {/* Hanging Halloween Banner */}
            <div className="hidden sm:flex flex-col items-center shrink-0 pt-2 pointer-events-none select-none">
              {/* Wooden pole and mount */}
              <div className="w-14 h-3 bg-[#4a2e18] border-b-2 border-[#2b180a] shadow-lg rounded-xs" />
              {/* Banner cloth (Halloween Pumpkin Orange) */}
              <div className="w-11 h-28 bg-[#9a3412] border border-[#431407] shadow-2xl relative flex flex-col items-center pt-3 overflow-hidden">
                {/* Jack-o'-lantern carved eyes and grin on banner */}
                <div className="w-7 h-7 flex flex-col items-center justify-center">
                  <div className="flex gap-2">
                    <div className="w-1.5 h-1.5 bg-[#fef08a] shadow-[0_0_4px_#facc15]" />
                    <div className="w-1.5 h-1.5 bg-[#fef08a] shadow-[0_0_4px_#facc15]" />
                  </div>
                  <div className="w-1 h-1 bg-[#facc15] my-0.5" />
                  <div className="flex flex-col items-center">
                    <div className="flex gap-0.5">
                      <div className="w-1 h-1.5 bg-[#fef08a]" />
                      <div className="w-1 h-0.5 bg-[#fef08a]" />
                      <div className="w-1 h-1.5 bg-[#fef08a]" />
                      <div className="w-1 h-0.5 bg-[#fef08a]" />
                      <div className="w-1 h-1.5 bg-[#fef08a]" />
                    </div>
                  </div>
                </div>
                {/* Bottom triangular cutout */}
                <div className="absolute -bottom-2 w-full flex justify-between">
                  <div className="w-0 h-0 border-l-[11px] border-l-transparent border-r-[11px] border-r-transparent border-t-[8px] border-t-[#08070d]" />
                </div>
              </div>
            </div>

            {/* Title, Subtitle, Text, CTA */}
            <div className="w-full">
              {/* Kicker badge: HALLOWEEN 2026 */}
              <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-[#ff7a00]/15 border border-[#ff7a00]/40 text-[#ff9800] text-[10px] sm:text-xs font-black font-heading tracking-wide sm:tracking-wider mb-2.5 sm:mb-4 shadow-[0_0_12px_rgba(255,122,0,0.25)] select-none max-w-full leading-tight">
                <span className="halloween-flicker shrink-0">🎃</span>
                <span className="truncate">TEMPORADA DE HALLOWEEN <span className="hidden xs:inline">• NOITE DO TERROR</span></span>
              </div>

              {/* 3D Title: NETCRAFT BR */}
              <h1 className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black font-heading tracking-tight text-white leading-none mb-2 sm:mb-3 mc-3d-text break-words">
                <span>NETCRAFT</span>
                <span className="text-[#ff7a00] drop-shadow-[0_4px_24px_rgba(255,122,0,0.85)] ml-1">BR</span>
              </h1>

              {/* Tagline: SOBREVIVA À NOITE DO TERROR */}
              <div className="text-base xs:text-lg sm:text-2xl md:text-3xl font-black font-heading tracking-wide mb-3 sm:mb-4 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-white">SOBREVIVA À</span>
                <span className="text-[#ff7a00] drop-shadow-[0_0_12px_rgba(255,122,0,0.7)]">NOITE DO TERROR</span>
              </div>

              {/* Description */}
              <p className="text-xs sm:text-base text-zinc-300 max-w-xl mb-5 sm:mb-8 leading-relaxed font-normal">
                O servidor oficial de Minecraft Bedrock entrou no clima de Halloween! Enfrente hordas nas Arenas do Terror, colete doces mágicos, participe de eventos comemorativos e jogue com uma comunidade incrível.
              </p>

              {/* Action Button: [ ▶ JOGAR HALLOWEEN ] */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-4 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowPlayModal(true)}
                  className="w-full sm:w-auto px-5 sm:px-8 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-[#ff7a00] to-[#ea580c] hover:from-[#ff9800] hover:to-[#f97316] text-black font-black font-heading text-xs sm:text-base tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(255,122,0,0.6)] hover:shadow-[0_0_36px_rgba(255,122,0,0.9)] hover:scale-[1.02]"
                >
                  <Play className="w-4 h-4 fill-current shrink-0" />
                  <span>JOGAR HALLOWEEN</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('server')}
                  className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white font-bold font-heading text-xs sm:text-sm tracking-wider border border-white/[0.1] transition-all cursor-pointer hover:border-[#ff7a00]/40 flex items-center justify-center"
                >
                  CONHECER O SERVIDOR
                </button>
              </div>
            </div>
          </div>

          {/* Right Floating Card: SERVIDOR ONLINE (Halloween edition) */}
          <div className="lg:self-end w-full sm:w-auto">
            <div className="p-3.5 sm:p-5 rounded-2xl bg-[#090812]/90 border border-[#ff7a00]/40 backdrop-blur-md shadow-[0_0_25px_rgba(255,122,0,0.25)] flex items-center gap-3 sm:gap-4 w-full sm:min-w-[240px]">
              {/* Status Online Column */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff7a00] opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#ff7a00]" />
                  </span>
                  <span className="text-xs sm:text-sm font-black font-heading tracking-wider text-[#ff9800]">
                    🎃 SERVIDOR ONLINE
                  </span>
                </div>
                <div className="text-[11px] text-zinc-300 pl-5 font-mono">
                  100% Minecraft Bedrock ({serverPort})
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. 5 FEATURE CARDS ROW (HALLOWEEN) */}
      {/* ============================================================ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
          {referenceFeatures.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-[#0a0812]/80 border border-white/[0.06] hover:border-[#ff7a00]/50 transition-all duration-300 flex flex-col items-center text-center group hover:-translate-y-1 hover:bg-[#0c0915] shadow-lg hover:shadow-[0_0_20px_rgba(255,122,0,0.2)]"
              >
                {/* Orange Neon Outline Icon Circle */}
                <div className="w-12 h-12 rounded-xl border border-[#ff7a00]/40 bg-[#ff7a00]/10 text-[#ff9800] flex items-center justify-center mb-4 group-hover:scale-110 group-hover:border-[#ff7a00] group-hover:shadow-[0_0_16px_rgba(255,122,0,0.4)] transition-all">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-black font-heading text-white tracking-wide mb-1.5">
                  {item.title}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. "O QUE TE ESPERA?" SECTION (FROM REFERENCE IMAGE) */}
      {/* ============================================================ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          {/* Left Column: Image with "EXPLORE CONSTRUA EVOLUA" badge */}
          <div className="relative rounded-2xl overflow-hidden border border-[#00e676]/30 bg-[#070b10] shadow-2xl group">
            <img
              src={settings?.whatToExpectImage || '/harbor_explore.jpg'}
              alt="Mundo NetCraftBR"
              className="w-full h-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-700"
            />
            {/* Dark gradient to ensure badge readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#06090e] via-transparent to-transparent opacity-85" />

            {/* Overlaid Badge: EXPLORE CONSTRUA EVOLUA (Reference Design) */}
            <div className="absolute bottom-6 left-6 select-none -rotate-6 transform">
              <div className="leading-tight font-black font-heading text-2xl sm:text-3xl tracking-tight drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]">
                <div className="text-white">EXPLORE</div>
                <div className="text-[#00e676] drop-shadow-[0_0_12px_#00e676]">CONSTRUA</div>
                <div className="text-[#00e676] drop-shadow-[0_0_12px_#00e676]">EVOLUA</div>
              </div>
            </div>
          </div>

          {/* Right Column: Title, Subtitle, Checklist & Button */}
          <div className="space-y-5 sm:space-y-6">
            <div>
              {/* Title with vertical green accent bar: | O QUE TE ESPERA? */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-6 bg-[#00e676] rounded-full shadow-[0_0_8px_#00e676]" />
                <h2 className="text-2xl sm:text-3xl font-black font-heading tracking-wide text-white">
                  O QUE TE ESPERA?
                </h2>
              </div>

              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
                No <strong className="text-white">NetCraftBR</strong> você encontra um servidor completo, com sistemas bem planejados, economia equilibrada e uma comunidade que realmente joga junto.
              </p>
            </div>

            {/* 2-column checklist with green checkmarks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-1 sm:pt-2">
              {whatToExpectItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2.5 text-xs sm:text-sm text-zinc-300">
                  <CheckCircle2 className="w-4 h-4 text-[#00e676] shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {/* Action button: SAIBA MAIS SOBRE O SERVIDOR ➔ */}
            <div className="pt-2 sm:pt-4">
              <button
                type="button"
                onClick={() => setCurrentTab('server')}
                className="w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl border border-[#00e676] bg-[#00e676]/10 hover:bg-[#00e676] text-[#00e676] hover:text-black font-extrabold font-heading text-xs sm:text-sm tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_14px_rgba(0,230,118,0.2)] hover:shadow-[0_0_24px_rgba(0,230,118,0.6)]"
              >
                <span>SAIBA MAIS SOBRE O SERVIDOR</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. PLANOS VIP SECTION */}
      {/* ============================================================ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 mb-5 sm:mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-5 bg-[#00e676] rounded-full shadow-[0_0_8px_#00e676]" />
              <span className="text-xs font-bold font-heading uppercase text-[#00e676] tracking-wider">
                Vantagens & Apoio
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black font-heading text-white">
              PLANOS VIP NETCRAFTBR
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setCurrentTab('vip')}
            className="text-xs font-bold font-heading text-zinc-400 hover:text-[#00e676] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>VER TODOS OS BENEFÍCIOS</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          {vips.slice(0, 3).map(vip => (
            <div
              key={vip.id}
              className={`p-5 sm:p-6 rounded-2xl bg-[#070c12] border transition-all flex flex-col justify-between hover:-translate-y-1 ${
                vip.isPopular
                  ? 'border-[#00e676] shadow-[0_0_24px_rgba(0,230,118,0.2)] relative'
                  : 'border-white/[0.08] hover:border-[#00e676]/40'
              }`}
            >
              {vip.isPopular && (
                <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-[#00e676] text-black font-black font-heading text-[10px] tracking-wider uppercase shadow-md flex items-center gap-1">
                  <Flame className="w-3 h-3 fill-current" />
                  <span>MAIS ESCOLHIDO</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold font-heading text-white flex items-center gap-2">
                    <Crown className="w-5 h-5 text-[#00e676]" />
                    <span>VIP {vip.name}</span>
                  </h3>
                  <span className="text-xs text-zinc-400 font-mono">{vip.duration}</span>
                </div>

                <div className="text-3xl font-black font-heading text-[#00e676] mb-4">
                  R$ {vip.price.toFixed(2).replace('.', ',')}
                </div>

                <ul className="space-y-2 mb-6 text-xs text-zinc-300">
                  {vip.benefits.slice(0, 4).map((b, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#00e676] shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => onBuyItem(vip, 'vip')}
                className="w-full py-2.5 rounded-xl bg-[#00e676] hover:bg-[#00c853] text-black font-black font-heading text-xs tracking-wider transition-colors cursor-pointer"
              >
                COMPRAR AGORA
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. NOTÍCIAS RECENTES */}
      {/* ============================================================ */}
      {news.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 bg-[#00e676] rounded-full shadow-[0_0_8px_#00e676]" />
              <h2 className="text-2xl font-black font-heading text-white">
                NOTÍCIAS & ATUALIZAÇÕES
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setCurrentTab('news')}
              className="text-xs font-bold font-heading text-zinc-400 hover:text-[#00e676] cursor-pointer"
            >
              VER TODAS &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {news.slice(0, 3).map(article => (
              <div
                key={article.id}
                onClick={() => setCurrentTab('news')}
                className="p-5 rounded-2xl bg-[#070c12] border border-white/[0.08] hover:border-[#00e676]/40 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#00e676]/10 text-[#00e676] border border-[#00e676]/20">
                    {article.category}
                  </span>
                  <h3 className="text-base font-bold font-heading text-white group-hover:text-[#00e676] transition-colors mt-2 mb-2 line-clamp-1">
                    {article.title}
                  </h3>
                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                    {article.summary}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>{article.date}</span>
                  <span className="text-[#00e676] group-hover:translate-x-1 transition-transform">Ler &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* MODAL INSTRUÇÕES: COMO JOGAR NO NETCRAFTBR */}
      {/* ============================================================ */}
      {showPlayModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md cursor-pointer"
            onClick={() => setShowPlayModal(false)}
          />

          <div className="relative w-full max-w-lg rounded-2xl bg-[#080d14] border border-[#00e676]/40 p-6 sm:p-8 shadow-2xl z-10">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold font-heading text-[#00e676]">
                  Minecraft Bedrock
                </span>
                <h3 className="text-2xl font-black font-heading text-white mt-0.5">
                  COMO ENTRAR NO SERVIDOR
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Compatível com celulares, computador e consoles.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlayModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Connection Credentials Card */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-mono text-zinc-400">Endereço IP</div>
                  <div className="font-mono text-sm font-semibold text-white">{serverIp}</div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyIp}
                  className="px-3 py-1.5 rounded-lg bg-[#00e676]/15 hover:bg-[#00e676]/25 text-[#00e676] text-xs font-bold font-heading border border-[#00e676]/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#00e676]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado' : 'Copiar IP'}</span>
                </button>
              </div>

              <div className="border-t border-white/[0.05] pt-2 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-mono text-zinc-400">Porta Padrão</div>
                  <div className="font-mono text-sm font-semibold text-white">{serverPort}</div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyPort}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs font-bold font-heading border border-white/[0.08] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedPort ? <Check className="w-3.5 h-3.5 text-[#00e676]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPort ? 'Copiada' : 'Copiar Porta'}</span>
                </button>
              </div>
            </div>

            {/* Device Tabs */}
            <div className="flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.06] mb-5">
              <button
                type="button"
                onClick={() => setActivePlayDevice('mobile')}
                className={`flex-1 py-1.5 text-xs font-bold font-heading rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activePlayDevice === 'mobile'
                    ? 'bg-[#00e676] text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Celular</span>
              </button>
              <button
                type="button"
                onClick={() => setActivePlayDevice('pc')}
                className={`flex-1 py-1.5 text-xs font-bold font-heading rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activePlayDevice === 'pc'
                    ? 'bg-[#00e676] text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>Computador</span>
              </button>
              <button
                type="button"
                onClick={() => setActivePlayDevice('console')}
                className={`flex-1 py-1.5 text-xs font-bold font-heading rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activePlayDevice === 'console'
                    ? 'bg-[#00e676] text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>Console</span>
              </button>
            </div>

            {/* Step by Step Instructions */}
            <div className="space-y-3 mb-6 text-xs text-zinc-300">
              {activePlayDevice === 'mobile' && (
                <>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="w-5 h-5 rounded-full bg-[#00e676]/20 text-[#00e676] font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <p>Abra o Minecraft no seu celular Android ou iOS e toque em <strong className="text-white">Jogar</strong>.</p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="w-5 h-5 rounded-full bg-[#00e676]/20 text-[#00e676] font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <p>Navegue até a aba <strong className="text-white">Servidores</strong> e toque em <strong className="text-white">Adicionar Servidor</strong>.</p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="w-5 h-5 rounded-full bg-[#00e676]/20 text-[#00e676] font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <p>Coloque o Nome: <span className="text-[#00e676] font-semibold">NetCraftBR</span>, IP: <span className="font-mono text-white">{serverIp}</span>, Porta: <span className="font-mono text-white">{serverPort}</span> e toque em <strong className="text-white">Salvar e Jogar</strong>.</p>
                  </div>
                </>
              )}

              {activePlayDevice === 'pc' && (
                <>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="w-5 h-5 rounded-full bg-[#00e676]/20 text-[#00e676] font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <p>Abra o Minecraft Bedrock (Windows Edition) e clique em <strong className="text-white">Jogar</strong>.</p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="w-5 h-5 rounded-full bg-[#00e676]/20 text-[#00e676] font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <p>Acesse a aba <strong className="text-white">Servidores</strong> e clique no botão <strong className="text-white">Adicionar Servidor</strong>.</p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="w-5 h-5 rounded-full bg-[#00e676]/20 text-[#00e676] font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <p>Cole o IP <span className="font-mono text-white">{serverIp}</span> e porta <span className="font-mono text-white">{serverPort}</span>. Clique em <strong className="text-white">Entrar</strong>!</p>
                  </div>
                </>
              )}

              {activePlayDevice === 'console' && (
                <>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="w-5 h-5 rounded-full bg-[#00e676]/20 text-[#00e676] font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <p>No seu smartphone, instale o aplicativo gratuito <strong className="text-white">BedrockTogether</strong> (Play Store / App Store).</p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="w-5 h-5 rounded-full bg-[#00e676]/20 text-[#00e676] font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <p>No app, coloque o IP <span className="font-mono text-white">{serverIp}</span> e Porta <span className="font-mono text-white">{serverPort}</span> e toque em <strong className="text-white">Run</strong>.</p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="w-5 h-5 rounded-full bg-[#00e676]/20 text-[#00e676] font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <p>No Xbox, PlayStation ou Switch na mesma rede Wi-Fi, o NetCraftBR aparecerá na aba <strong className="text-white">Amigos / Rede LAN</strong>!</p>
                  </div>
                </>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => {
                  setShowPlayModal(false);
                  setCurrentTab('server');
                }}
                className="text-xs font-bold font-heading text-zinc-400 hover:text-[#00e676] transition-colors cursor-pointer"
              >
                VER REGRAS COMPLETAS &rarr;
              </button>
              <button
                type="button"
                onClick={() => setShowPlayModal(false)}
                className="px-5 py-2 rounded-xl bg-[#00e676] hover:bg-[#00c853] text-black text-xs font-black font-heading tracking-wider transition-colors cursor-pointer"
              >
                ENTENDI, VAMOS JOGAR!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
