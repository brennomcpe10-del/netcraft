import React, { useState } from 'react';
import { NewsArticle } from '../types/index.ts';
import { X } from 'lucide-react';

interface NewsViewProps {
  news: NewsArticle[];
  loading: boolean;
}

export const NewsView: React.FC<NewsViewProps> = ({ news, loading }) => {
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);

  const publishedNews = news.filter(n => n.published);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-16 space-y-8 sm:space-y-12">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-bold font-heading text-white tracking-tight">
          Notícias
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-2 sm:mt-3 leading-relaxed">
          Atualizações oficiais, notas de versão e anúncios da equipe.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 sm:py-20 text-sm text-zinc-400">
          Carregando notícias...
        </div>
      ) : publishedNews.length === 0 ? (
        <div className="text-center py-12 sm:py-16 border border-white/[0.06] rounded-2xl bg-white/[0.01]">
          <p className="text-sm text-zinc-400">Nenhuma notícia publicada ainda.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {publishedNews.map(article => (
            <div
              key={article.id}
              onClick={() => setSelectedArticle(article)}
              className="py-4 sm:py-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 sm:gap-4 hover:bg-white/[0.01] transition-colors cursor-pointer group"
            >
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1.5 font-mono">
                  <span className="text-emerald-400 font-medium">
                    {article.category}
                  </span>
                  <span>•</span>
                  <span>{article.author}</span>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-white group-hover:text-emerald-400 transition-colors font-heading">
                  {article.title}
                </h2>

                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">
                  {article.summary}
                </p>
              </div>

              <span className="text-xs text-zinc-400 font-mono shrink-0">
                {article.date}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Clean Modal for Article Reader */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-2xl bg-[#0d1017] border border-white/[0.08] rounded-2xl p-5 sm:p-8 max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setSelectedArticle(null)}
              className="absolute top-6 right-6 text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <span className="text-xs font-mono text-emerald-400 uppercase">
                {selectedArticle.category} • {selectedArticle.date}
              </span>
              <h2 className="text-2xl font-bold font-heading text-white mt-1 mb-2">
                {selectedArticle.title}
              </h2>
              <span className="text-xs text-zinc-400 block">
                Publicado por {selectedArticle.author}
              </span>
            </div>

            <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line space-y-4 border-t border-white/[0.06] pt-6">
              {selectedArticle.content}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
