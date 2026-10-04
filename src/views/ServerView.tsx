import React, { useState } from 'react';
import { ServerSettings } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import { Copy, Check } from 'lucide-react';

interface ServerViewProps {
  settings: ServerSettings | null;
}

export const ServerView: React.FC<ServerViewProps> = ({ settings }) => {
  const { showSuccess } = useToast();
  const [copiedIp, setCopiedIp] = useState(false);
  const [tutorialTab, setTutorialTab] = useState<'mobile' | 'pc' | 'console'>('mobile');

  const serverIp = settings?.ip || 'netcraftbr.srvmc.com';
  const serverPort = settings?.port || 25673;
  const serverVersion = settings?.version || 'Minecraft Bedrock 1.20 - 1.21.x';

  const handleCopyIp = () => {
    navigator.clipboard.writeText(serverIp);
    setCopiedIp(true);
    showSuccess('IP copiado para a área de transferência');
    setTimeout(() => setCopiedIp(false), 2500);
  };

  const rules = settings?.rules || [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-16 space-y-20">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold font-heading text-white tracking-tight">
          O Servidor
        </h1>
        <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
          Informações de conexão, especificações de rede e diretrizes de convivência da comunidade.
        </p>
      </div>

      {/* Connection Specs (Clean Minimalist Bar) */}
      <div className="p-8 rounded-2xl border border-white/[0.08] bg-white/[0.01]">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-left divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          <div className="pb-4 sm:pb-0 sm:pr-6">
            <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
              Endereço IP
            </span>
            <div className="text-lg font-bold font-mono text-white">
              {serverIp}
            </div>
          </div>

          <div className="py-4 sm:py-0 sm:px-6">
            <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
              Porta
            </span>
            <div className="text-lg font-bold font-mono text-white">
              {serverPort}
            </div>
          </div>

          <div className="pt-4 sm:pt-0 sm:pl-6">
            <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
              Versão
            </span>
            <div className="text-sm font-semibold text-zinc-300">
              {serverVersion}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Servidor Online & Ativo</span>
          </div>

          <button
            onClick={handleCopyIp}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {copiedIp ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedIp ? 'Copiado' : 'Copiar IP'}</span>
          </button>
        </div>
      </div>

      {/* COMO ENTRAR (CLEAN TABS & INSTRUCTIONS) */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold font-heading text-white">
            Como Entrar
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Selecione o seu dispositivo e siga as orientações:
          </p>
        </div>

        {/* Tab buttons */}
        <div className="flex gap-2 border-b border-white/[0.06] pb-3">
          <button
            onClick={() => setTutorialTab('mobile')}
            className={`text-xs px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
              tutorialTab === 'mobile'
                ? 'bg-white text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Celular (Android / iOS)
          </button>
          <button
            onClick={() => setTutorialTab('pc')}
            className={`text-xs px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
              tutorialTab === 'pc'
                ? 'bg-white text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Windows 10 / 11
          </button>
          <button
            onClick={() => setTutorialTab('console')}
            className={`text-xs px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
              tutorialTab === 'console'
                ? 'bg-white text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Consoles (Xbox, PlayStation, Switch)
          </button>
        </div>

        {/* Tab content */}
        <div className="p-6 rounded-2xl border border-white/[0.06] bg-white/[0.01]">
          {tutorialTab === 'mobile' && (
            <ol className="space-y-4 text-xs text-zinc-300 leading-relaxed list-decimal list-inside">
              <li>Abra o Minecraft no seu celular e clique no botão <strong>Jogar</strong>.</li>
              <li>Acesse a aba <strong>Servidores</strong> e role até o final da página.</li>
              <li>Clique em <strong>Adicionar Servidor</strong>.</li>
              <li>No campo de IP digite <code className="text-emerald-400 font-mono px-1 py-0.5 bg-black/40 rounded">{serverIp}</code> e na porta <code className="text-emerald-400 font-mono px-1 py-0.5 bg-black/40 rounded">{serverPort}</code>.</li>
              <li>Salve e clique em <strong>Jogar</strong> para se conectar.</li>
            </ol>
          )}

          {tutorialTab === 'pc' && (
            <ol className="space-y-4 text-xs text-zinc-300 leading-relaxed list-decimal list-inside">
              <li>Inicie o Minecraft for Windows (Bedrock Edition).</li>
              <li>Clique em <strong>Jogar</strong> e vá na aba <strong>Servidores</strong>.</li>
              <li>Clique em <strong>Adicionar Servidor</strong>.</li>
              <li>Insira o endereço <code className="text-emerald-400 font-mono px-1 py-0.5 bg-black/40 rounded">{serverIp}</code> e a porta <code className="text-emerald-400 font-mono px-1 py-0.5 bg-black/40 rounded">{serverPort}</code>.</li>
              <li>Clique em <strong>Entrar no Servidor</strong>.</li>
            </ol>
          )}

          {tutorialTab === 'console' && (
            <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
              <p>
                Nos consoles, utilize o aplicativo gratuito <strong>BedrockTogether</strong> ou <strong>MC Server Connector</strong> em seu celular conectado na mesma rede Wi-Fi do console:
              </p>
              <ol className="space-y-2 list-decimal list-inside text-zinc-400">
                <li>Instale o app <strong>BedrockTogether</strong> no smartphone.</li>
                <li>Insira o IP <code className="text-emerald-400 font-mono px-1 py-0.5 bg-black/40 rounded">{serverIp}</code> e porta <code className="text-emerald-400 font-mono px-1 py-0.5 bg-black/40 rounded">{serverPort}</code>.</li>
                <li>Toque em Iniciar/Run no celular.</li>
                <li>No console, vá na aba <strong>Amigos</strong> e entre na partida em rede local (LAN).</li>
              </ol>
            </div>
          )}
        </div>
      </section>

      {/* REGRAS DO SERVIDOR (LISTA LIMPA) */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold font-heading text-white">
            Regras da Comunidade
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Diretrizes para garantir um ambiente saudável e justo:
          </p>
        </div>

        <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {rules.map((rule, idx) => (
            <div key={rule.id || idx} className="py-4 flex flex-col sm:flex-row sm:items-start gap-4">
              <span className="text-xs font-mono text-zinc-500 shrink-0 mt-0.5">
                0{idx + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {rule.title}
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  {rule.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
