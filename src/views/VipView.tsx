import React from 'react';
import { VIP } from '../types/index.ts';
import { Check } from 'lucide-react';

interface VipViewProps {
  vips: VIP[];
  loading: boolean;
  onBuyVip: (vip: VIP) => void;
}

export const VipView: React.FC<VipViewProps> = ({ vips, loading, onBuyVip }) => {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-16 space-y-10 sm:space-y-16">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-bold font-heading text-white tracking-tight">
          Planos VIP
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-2 sm:mt-3 leading-relaxed">
          Apoie a manutenção do servidor e desbloqueie benefícios exclusivos e balanceados para a sua jornada.
        </p>
      </div>

      {/* VIPs Grid */}
      {loading ? (
        <div className="text-center py-16 sm:py-20 text-zinc-400 text-sm">
          Carregando pacotes VIP...
        </div>
      ) : vips.length === 0 ? (
        <div className="text-center py-12 sm:py-16 border border-white/[0.06] rounded-2xl bg-white/[0.01]">
          <p className="text-sm text-zinc-400">Nenhum plano VIP disponível no momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {vips.map(vip => {
            const isFeatured = vip.isPopular;
            return (
              <div
                key={vip.id}
                className={`p-5 sm:p-7 rounded-2xl border flex flex-col justify-between transition-all ${
                  isFeatured
                    ? 'border-emerald-500/40 bg-emerald-500/[0.02]'
                    : 'border-white/[0.08] bg-white/[0.01] hover:border-white/20'
                }`}
              >
                <div>
                  {/* Name and Duration */}
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl font-bold text-white font-heading">
                      {vip.name}
                    </h2>
                    <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                      {vip.duration}
                    </span>
                  </div>

                  {/* Price */}
                  <div className="mb-4 sm:mb-6">
                    <span className="text-3xl font-extrabold text-white">
                      R$ {vip.price.toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  {/* Short Description */}
                  {vip.description && (
                    <p className="text-xs text-zinc-400 mb-4 sm:mb-6 leading-relaxed">
                      {vip.description}
                    </p>
                  )}

                  {/* Benefits: 3 to 5 key points */}
                  <div className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8 text-xs text-zinc-300">
                    {vip.benefits.slice(0, 5).map((b, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Buy Button */}
                <button
                  onClick={() => onBuyVip(vip)}
                  className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isFeatured
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-sm'
                      : 'bg-white hover:bg-zinc-200 text-zinc-950'
                  }`}
                >
                  Comprar
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Informative note */}
      <div className="max-w-2xl mx-auto p-4 sm:p-6 rounded-xl border border-white/[0.06] bg-white/[0.01] text-center text-xs text-zinc-400 leading-relaxed">
        <p>
          As ativações são processadas de forma automática após a confirmação do pagamento pelo backend. Dúvidas sobre prazos ou transferências podem ser consultadas em nossa página de suporte.
        </p>
      </div>
    </div>
  );
};
