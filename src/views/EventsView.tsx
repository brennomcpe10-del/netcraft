import React from 'react';
import { ServerEvent } from '../types/index.ts';

interface EventsViewProps {
  events: ServerEvent[];
  loading: boolean;
}

export const EventsView: React.FC<EventsViewProps> = ({ events, loading }) => {
  const publishedEvents = events.filter(e => e.published);
  const nextEvent = publishedEvents.find(e => e.status === 'Próximo' || e.status === 'Em andamento') || publishedEvents[0];
  const upcomingEvents = publishedEvents.filter(e => e.id !== nextEvent?.id);

  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-16">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold font-heading text-white tracking-tight">
          Eventos
        </h1>
        <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
          Calendário de batalhas, desafios e atividades especiais do servidor.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-sm text-zinc-400">
          Carregando eventos...
        </div>
      ) : publishedEvents.length === 0 ? (
        <div className="text-center py-16 border border-white/[0.06] rounded-2xl bg-white/[0.01]">
          <p className="text-sm text-zinc-400">Nenhum evento programado no momento.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {/* PRÓXIMO EVENTO */}
          {nextEvent && (
            <div className="space-y-4">
              <span className="text-xs uppercase font-mono tracking-wider text-emerald-400 font-semibold">
                Próximo Evento
              </span>

              <div className="p-8 rounded-2xl border border-white/[0.08] bg-white/[0.01]">
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 mb-3 font-mono">
                  <span className="text-emerald-400 font-semibold">
                    {nextEvent.date}
                  </span>
                  <span>•</span>
                  <span>{nextEvent.time}</span>
                  {nextEvent.location && (
                    <>
                      <span>•</span>
                      <span>{nextEvent.location}</span>
                    </>
                  )}
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold text-white font-heading mb-3">
                  {nextEvent.name}
                </h2>

                <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                  {nextEvent.description}
                </p>

                {nextEvent.rewards && nextEvent.rewards.length > 0 && (
                  <div className="border-t border-white/[0.06] pt-4">
                    <span className="text-xs font-semibold text-zinc-300 block mb-2">
                      Premiações:
                    </span>
                    <ul className="text-xs text-zinc-400 space-y-1">
                      {nextEvent.rewards.map((r, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-emerald-400" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PRÓXIMOS EVENTOS (LISTA LIMPA) */}
          {upcomingEvents.length > 0 && (
            <div className="space-y-4">
              <span className="text-xs uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                Outros Eventos Programados
              </span>

              <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {upcomingEvents.map(ev => (
                  <div
                    key={ev.id}
                    className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-1">
                        <span>{ev.date}</span>
                        <span>•</span>
                        <span>{ev.time}</span>
                      </div>
                      <h3 className="text-base font-semibold text-white">
                        {ev.name}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
                        {ev.description}
                      </p>
                    </div>

                    <span className="text-[11px] font-mono uppercase px-2.5 py-1 rounded bg-white/[0.03] text-zinc-400 shrink-0">
                      {ev.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
