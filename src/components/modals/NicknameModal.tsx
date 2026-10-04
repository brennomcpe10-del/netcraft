import React, { useState } from 'react';
import { usePlayer } from '../../context/PlayerContext.tsx';
import { X, Sparkles, Loader2 } from 'lucide-react';

export const NicknameModal: React.FC = () => {
  const { isLoginModalOpen, closeLoginModal, login } = usePlayer();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isLoginModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = nickname.trim();
    if (!clean) {
      setError('Digite seu nickname do Minecraft');
      return;
    }
    if (clean.length < 3) {
      setError('O nickname deve ter no mínimo 3 caracteres');
      return;
    }
    if (clean.length > 32) {
      setError('O nickname deve ter no máximo 32 caracteres');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const ok = await login(clean);
      if (ok) {
        setNickname('');
      } else {
        setError('Não foi possível entrar. Tente novamente.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar com nickname.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
        onClick={closeLoginModal}
      />
      <div className="relative w-full max-w-sm bg-[#0d1017] border border-white/[0.08] rounded-2xl p-7 shadow-2xl z-10">
        <button
          type="button"
          onClick={closeLoginModal}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse shadow-[0_0_8px_#00e676]" />
            <span className="text-[11px] font-bold font-heading uppercase text-[#00e676] tracking-wider">
              Identificação do Jogador
            </span>
          </div>
          <h2 className="text-xl font-bold font-heading text-white tracking-tight">
            Digite seu nickname do Minecraft
          </h2>
          <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
            Se for sua primeira vez, sua conta será criada automaticamente.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="relative">
              <input
                type="text"
                value={nickname}
                onChange={e => {
                  setNickname(e.target.value);
                  setError('');
                }}
                placeholder="Ex: Steve_BR"
                className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] focus:border-[#00e676] rounded-xl text-sm text-white placeholder-zinc-500 outline-none transition-colors"
                autoFocus
                maxLength={32}
              />
            </div>
            {error && (
              <p className="text-xs text-rose-400 mt-2 font-medium">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#00e676] hover:bg-[#00c853] text-black font-extrabold font-heading text-xs tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,230,118,0.25)] hover:shadow-[0_0_25px_rgba(0,230,118,0.45)]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>ENTRANDO...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>ENTRAR NO SERVIDOR</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={closeLoginModal}
            className="w-full py-2 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer text-center block"
          >
            Continuar como visitante
          </button>
        </form>
      </div>
    </div>
  );
};
