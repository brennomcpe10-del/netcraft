import React, { useState } from 'react';
import { usePlayer } from '../context/PlayerContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { api } from '../lib/api.ts';
import { ChevronDown, Send } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

const faqList: FaqItem[] = [
  {
    question: 'Como faço para entrar no NetCraftBR pelo celular?',
    answer: 'Abra o Minecraft Bedrock no celular, clique em Jogar > Servidores > Adicionar Servidor. Insira o IP netcraftbr.srvmc.com e porta 25673, depois salve e conecte.'
  },
  {
    question: 'Posso jogar usando Minecraft de computador ou console?',
    answer: 'Sim. No Windows (Bedrock), adicione normalmente o servidor. Nos consoles (Xbox, PS, Switch), conecte-se usando o aplicativo BedrockTogether no smartphone na mesma rede Wi-Fi.'
  },
  {
    question: 'Quanto tempo demora para meu VIP ser entregue após o pagamento?',
    answer: 'Pagamentos via PIX ou Cartão são validados pelo backend de forma quase instantânea. Após a confirmação, os benefícios são concedidos imediatamente ao nickname escolhido.'
  },
  {
    question: 'Posso presentear outro jogador com um VIP?',
    answer: 'Sim. Durante a compra, selecione a opção "Presentear outro jogador" e informe o nickname exato da pessoa no Minecraft Bedrock.'
  },
  {
    question: 'O que fazer se o meu VIP não ativar?',
    answer: 'Caso passem 15 minutos sem ativação, preencha o formulário abaixo com o seu nickname e o ID do pedido para verificação da equipe.'
  }
];

export const SupportView: React.FC = () => {
  const { player } = usePlayer();
  const { showSuccess, showError } = useToast();

  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [nickname, setNickname] = useState(player?.nickname || '');
  const [category, setCategory] = useState<'compra' | 'vip' | 'duvida' | 'bug' | 'outro'>('compra');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !subject.trim() || !message.trim()) {
      showError('Preencha todos os campos do chamado.');
      return;
    }

    try {
      setSending(true);
      await api.createTicket({
        nickname: nickname.trim(),
        category,
        subject: subject.trim(),
        message: message.trim()
      });
      setSubmitted(true);
      showSuccess('Chamado de suporte enviado.');
      setSubject('');
      setMessage('');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Falha ao registrar chamado.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-16 space-y-10 sm:space-y-16">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-bold font-heading text-white tracking-tight">
          Central de Suporte
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-2 sm:mt-3 leading-relaxed">
          Tire dúvidas frequentes ou envie uma mensagem direta para a nossa equipe.
        </p>
      </div>

      {/* FAQ SECTION */}
      <section className="space-y-4 sm:space-y-6">
        <h2 className="text-xl sm:text-2xl font-bold font-heading text-white">
          Perguntas Frequentes
        </h2>

        <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {faqList.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="py-4">
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full text-left flex items-center justify-between gap-4 cursor-pointer group"
                >
                  <span className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? 'rotate-180 text-white' : ''}`}
                  />
                </button>
                {isOpen && (
                  <p className="text-xs text-zinc-400 mt-3 leading-relaxed">
                    {item.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* CONTACT FORM */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold font-heading text-white">
            Abrir Chamado
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Preencha os dados abaixo para receber auxílio da administração:
          </p>
        </div>

        {submitted ? (
          <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.02] text-center space-y-3">
            <h3 className="text-base font-bold text-white">Chamado registrado</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Nossa equipe recebeu sua mensagem e responderá através do servidor e Discord.
            </p>
            <button
              onClick={() => setSubmitted(false)}
              className="text-xs text-emerald-400 underline underline-offset-4 cursor-pointer font-medium"
            >
              Enviar outro chamado
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                  Nickname no Minecraft
                </label>
                <input
                  type="text"
                  required
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder="Seu nickname exato"
                  className="w-full px-3.5 py-2.5 bg-white/[0.02] border border-white/[0.08] focus:border-white/30 rounded-lg text-xs text-white placeholder-zinc-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-white/[0.08] focus:border-white/30 rounded-lg text-xs text-white outline-none"
                >
                  <option value="compra">Problemas com Compra</option>
                  <option value="vip">Dúvidas sobre VIP</option>
                  <option value="duvida">Dúvida Geral</option>
                  <option value="bug">Reportar Bug</option>
                  <option value="outro">Outro Assunto</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                Assunto
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Ex: Confirmação do Pedido #ORD-12345"
                className="w-full px-3.5 py-2.5 bg-white/[0.02] border border-white/[0.08] focus:border-white/30 rounded-lg text-xs text-white placeholder-zinc-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                Mensagem
              </label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Descreva o problema com clareza..."
                className="w-full px-3.5 py-2.5 bg-white/[0.02] border border-white/[0.08] focus:border-white/30 rounded-lg text-xs text-white placeholder-zinc-500 outline-none transition-colors resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="px-6 py-2.5 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Enviando...' : 'Enviar Chamado'}</span>
            </button>
          </form>
        )}
      </section>
    </div>
  );
};
