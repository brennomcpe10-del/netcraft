import React from 'react';
import { SocialLink } from '../types/index.ts';
import {
  MessageSquare,
  Youtube,
  Video,
  Instagram,
  Phone,
  ExternalLink
} from 'lucide-react';

interface CommunityViewProps {
  socialLinks: SocialLink[];
}

export const CommunityView: React.FC<CommunityViewProps> = ({ socialLinks }) => {
  const getSocialIcon = (platform: string) => {
    switch (platform) {
      case 'discord': return MessageSquare;
      case 'youtube': return Youtube;
      case 'tiktok': return Video;
      case 'instagram': return Instagram;
      case 'whatsapp': return Phone;
      default: return ExternalLink;
    }
  };

  const activeLinks = socialLinks.filter(l => l.active);

  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-12">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold font-heading text-white tracking-tight">
          Comunidade
        </h1>
        <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
          Nossas redes sociais e canais oficiais de comunicação.
        </p>
      </div>

      {/* Social Links List */}
      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {activeLinks.map(link => {
          const Icon = getSocialIcon(link.platform);
          return (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="py-6 flex items-center justify-between gap-4 hover:bg-white/[0.01] transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/[0.08] flex items-center justify-center text-zinc-300 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white group-hover:text-emerald-400 transition-colors">
                    {link.name}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {link.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {link.memberCount && (
                  <span className="text-xs font-mono text-zinc-400 hidden sm:inline">
                    {link.memberCount}
                  </span>
                )}
                <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};
