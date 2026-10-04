import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext.tsx';
import { X } from 'lucide-react';

interface AdminLoginModalProps {
  onSuccessRedirect?: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ onSuccessRedirect }) => {
  const { isAdminModalOpen, closeAdminModal, loginAdmin } = useAdmin();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isAdminModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Informe a credencial administrativa');
      return;
    }

    setLoading(true);
    setError('');

    const ok = await loginAdmin(password);
    setLoading(false);

    if (ok) {
      setPassword('');
      if (onSuccessRedirect) {
        onSuccessRedirect();
      }
    } else {
      setError('Credencial administrativa incorreta');
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
        onClick={closeAdminModal}
      />
      <div className="relative w-full max-w-sm bg-[#0d1017] border border-white/[0.08] rounded-2xl p-7 shadow-2xl z-10">
        <button
          type="button"
          onClick={closeAdminModal}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-bold font-heading text-white tracking-tight">
            Acesso Administrativo
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Insira a credencial mestre para gerenciar o servidor.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Palavra-chave administrativa"
              className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] focus:border-white/30 rounded-xl text-sm text-white placeholder-zinc-500 outline-none transition-colors"
              autoFocus
            />
            {error && (
              <p className="text-xs text-rose-400 mt-2 font-medium">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Verificando...' : 'Acessar Painel'}
          </button>
        </form>
      </div>
    </div>
  );
};
