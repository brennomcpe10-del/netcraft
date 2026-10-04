import type { VIP, Product, ServerEvent, NewsArticle, ServerSettings, SocialLink, Player, Order } from '../../src/types/index.ts';

export const initialSettings: ServerSettings = {
  serverName: 'NetCraftBR',
  tagline: 'Seu servidor. Sua aventura.',
  ip: 'netcraftbr.srvmc.com',
  port: 25673,
  version: 'Minecraft Bedrock 1.20 - 1.21.x',
  motd: '§a§lNetCraftBR §8» §fSeu servidor. Sua aventura! §7[Bedrock 1.21+]',
  isOnline: true,
  onlinePlayersCount: 42,
  maxPlayers: 250,
  logoUrl: '',
  livePixUrl: '',
  whatToExpectImage: '/harbor_explore.jpg',
  announcementText: '🎉 Grande Torneio Gladiador neste sábado às 19:00 com premiação VIP Supreme!',
  rules: [
    {
      id: 'rule-1',
      title: 'Respeito Mútuo e Comunidade',
      description: 'Proibido qualquer tipo de ofensa, preconceito, discurso de ódio, assédio ou toxicidade no chat global ou privado.',
      category: 'Geral'
    },
    {
      id: 'rule-2',
      title: 'Proibido Trapaças (Hacks / Cheats / X-Ray)',
      description: 'O uso de qualquer cliente modificado que proporcione vantagens injustas (Fly, Killaura, Speed, X-Ray) resultará em banimento permanente imediato.',
      category: 'Geral'
    },
    {
      id: 'rule-3',
      title: 'Proteção de Terrenos e Anti-Grief',
      description: 'Não destrua construções de outros jogadores nem tente roubar através de bugs de blocos. Utilize sempre o bloco de proteção de terreno.',
      category: 'Construções'
    },
    {
      id: 'rule-4',
      title: 'Economia Justa e Anti-Duplicação',
      description: 'Qualquer tentativa de duplicar itens ou explorar falhas no sistema econômico resultará em reset de conta e banimento sem aviso prévio.',
      category: 'Economia'
    },
    {
      id: 'rule-5',
      title: 'Regras de PvP e Combate',
      description: 'O combate entre jogadores é liberado apenas em áreas permitidas (Arenas e /warp pvp). Combat logging (desconectar durante combate) é punido automaticamente.',
      category: 'PvP'
    }
  ],
  systems: [
    {
      id: 'sys-eco',
      title: 'Economia Global',
      description: 'Sistema completo de coins, mercado de jogadores, leilões em tempo real, banco com juros e lojas automáticas.',
      icon: 'Coins',
      command: '/money, /mercado'
    },
    {
      id: 'sys-terrenos',
      title: 'Terrenos & Proteção',
      description: 'Proteja suas vilas, castelos e baús com blocos de proteção inteligentes. Compartilhe permissões com amigos.',
      icon: 'Shield',
      command: '/terreno, /bloco'
    },
    {
      id: 'sys-casas',
      title: 'Sistema de Casas (/sethome)',
      description: 'Defina múltiplos pontos de retorno rápidos e seguros para nunca se perder pelo imenso mundo de sobrevivência.',
      icon: 'Home',
      command: '/sethome, /home'
    },
    {
      id: 'sys-warps',
      title: 'Warps & Mundos',
      description: 'Teleportes instantâneos para o Spawn, Mina Resetável, Arena PvP, Loja Central, Nether e The End.',
      icon: 'Compass',
      command: '/warp, /spawn'
    },
    {
      id: 'sys-eventos',
      title: 'Eventos Automáticos',
      description: 'Gladiador semanal, Caça ao Dragão, Corrida de Barcos no Gelo, Caça ao Tesouro e Quiz no chat.',
      icon: 'Trophy',
      command: '/eventos'
    },
    {
      id: 'sys-grupos',
      title: 'Clãs & Grupos',
      description: 'Crie ou junte-se a uma aliança, conquiste territórios, dispute o ranking dos clãs mais poderosos e dispute guerras.',
      icon: 'Users',
      command: '/cla, /clan'
    },
    {
      id: 'sys-tpa',
      title: 'Teleporte Entre Amigos (TPA)',
      description: 'Envie e aceite pedidos de teleporte para jogar em conjunto com seus amigos a qualquer hora.',
      icon: 'Zap',
      command: '/tpa, /tpaccept'
    },
    {
      id: 'sys-vips',
      title: 'Vantagens VIP',
      description: 'Acesse kits exclusivos, comando /fly em seus terrenos, multiplicadores de moedas, chat colorido e prioridade na fila.',
      icon: 'Crown',
      command: '/vip'
    },
    {
      id: 'sys-criadores',
      title: 'Apoio a Criadores',
      description: 'Programa oficial para streamers e criadores de conteúdo do YouTube e TikTok com tag exclusiva e recompensas.',
      icon: 'Video',
      command: '/criadores'
    },
    {
      id: 'sys-procurados',
      title: 'Sistema de Procurados (Bounties)',
      description: 'Coloque a cabeça dos seus rivais a prêmio ou torne-se um caçador de recompensas temido em todo o mapa.',
      icon: 'Target',
      command: '/bounty, /procurados'
    },
    {
      id: 'sys-bosses',
      title: 'Bosses Customizados',
      description: 'Chefões ancestrais surgem em masmorras secretas no Nether e End com padrões de ataque únicos e drops lendários.',
      icon: 'Skull',
      command: '/bosses'
    },
    {
      id: 'sys-loja',
      title: 'Loja Dinâmica',
      description: 'Compre e venda minérios, blocos raros e itens de agricultura com preços que variam conforme a oferta e demanda.',
      icon: 'ShoppingBag',
      command: '/loja'
    }
  ]
};

export const initialVips: VIP[] = [
  {
    id: 'vip-explorer',
    name: 'Explorer',
    price: 14.90,
    duration: '30 dias',
    description: 'O pontapé inicial ideal para quem quer explorar o servidor com vantagens úteis e sem complicações.',
    benefits: [
      'Tag [EXPLORER] destacada no chat e tablist',
      'Acesso ao /kit explorer diário com armaduras e ferramentas',
      'Até 4 /sethomes extras',
      'Comando /hat para usar blocos na cabeça',
      'Entrada prioritária com o servidor cheio',
      'Desconto de 5% no mercado da loja global',
      'Acesso ao canal exclusivo de VIPs no Discord'
    ],
    color: 'emerald',
    image: 'compass',
    order: 1,
    active: true
  },
  {
    id: 'vip-elite',
    name: 'Elite',
    price: 29.90,
    duration: '30 dias',
    description: 'O pacote preferido dos jogadores dedicados. Ganhe asas em seus terrenos e kits muito mais fortes.',
    benefits: [
      'Tag [ELITE] estilizada com cor ciano no chat',
      'Comando /fly liberado em todas as suas construções e terrenos',
      'Acesso aos /kit elite diário e semanal',
      'Até 8 /sethomes extras',
      'Multiplicador de moedas 1.5x em todas as atividades',
      'Comandos /feed e /craft em qualquer lugar',
      'Acesso a partículas exclusivas de caminhada',
      'Todos os benefícios do plano Explorer'
    ],
    color: 'cyan',
    image: 'award',
    order: 2,
    active: true,
    isPopular: true
  },
  {
    id: 'vip-supreme',
    name: 'Supreme',
    price: 49.90,
    duration: '30 dias',
    description: 'Para os mestres do NetCraftBR que comandam reinos e dominam os leilões e arenas do servidor.',
    benefits: [
      'Tag [SUPREME] animada com brilho no chat',
      'Acesso ao cobiçado /kit supreme semanal com itens encantados nível V',
      'Até 16 /sethomes extras para qualquer dimensão',
      'Multiplicador de moedas 2.0x (Dobro de coins)',
      'Comando /near para detectar invasores ao redor da base',
      'Comando /repair para reparar ferramentas sem gastar XP',
      'Acesso prioritário a salas de teste e eventos especiais',
      'Todos os benefícios dos planos Explorer e Elite'
    ],
    color: 'blue',
    image: 'shield-check',
    order: 3,
    active: true
  },
  {
    id: 'vip-legendario',
    name: 'Lendário',
    price: 89.90,
    duration: 'Vitalício (Para sempre)',
    description: 'A coroa definitiva do NetCraftBR. Nunca mais se preocupe com renovação de VIP e torne-se uma lenda.',
    benefits: [
      'Tag [LENDÁRIO] dourada/roxa lendária permanente',
      'Vantagens VITALÍCIAS sem custo de renovação',
      'Acesso a TODOS os kits VIP (Explorer, Elite, Supreme e Lendário)',
      'Homes ILIMITADAS em qualquer coordenada',
      'Multiplicador de moedas 2.5x vitalício',
      'Acesso a mascotes (Pets) companheiros cosméticos',
      'Capa exclusiva Lendária no Discord oficial',
      'Acesso direto ao chat privado com a Administração'
    ],
    color: 'purple',
    image: 'crown',
    order: 4,
    active: true
  }
];

export const initialProducts: Product[] = [
  {
    id: 'prod-kit-pvp',
    name: 'Super Kit Gladiador',
    category: 'kits',
    price: 9.90,
    description: 'Conjunto completo de armadura de Netherite com Proteção IV, Espada Afiada V e Maçãs Douradas Encantadas.',
    image: 'sword',
    active: true,
    highlights: ['Set Netherite Completo', '32x Golden Apple', 'Totens da Imortalidade'],
    order: 1
  },
  {
    id: 'prod-spawner-blaze',
    name: 'Spawner de Blaze Raro',
    category: 'itens',
    price: 12.50,
    description: 'Gerador de monstros lendário para construir fazendas automáticas de poções e pontos de experiência massivos.',
    image: 'flame',
    active: true,
    highlights: ['Taxa de Spawn +50%', 'Colocável em qualquer terreno protegido'],
    order: 2
  },
  {
    id: 'prod-chaves-misteriosas',
    name: 'Combo 5x Chaves Místicas',
    category: 'itens',
    price: 15.00,
    description: 'Chaves mágicas para abrir a Caixa Misteriosa no Spawn com chance de ganhar VIPs, moedas e itens raros.',
    image: 'key',
    active: true,
    highlights: ['Abertura imediata no /warp caixas', 'Garantia de premiações épicas'],
    order: 3
  },
  {
    id: 'prod-coins-pacote',
    name: 'Pacote 100.000 Coins',
    category: 'outros',
    price: 19.90,
    description: 'Alavanque sua fortuna na economia do servidor. Compre terrenos imensos, monte lojas e domine os leilões.',
    image: 'coins',
    active: true,
    highlights: ['Moedas depositadas direto na sua conta', 'Sem limite de transferências'],
    order: 4
  },
  {
    id: 'prod-cosmetico-asas',
    name: 'Partículas de Fogo Alado',
    category: 'cosmeticos',
    price: 8.90,
    description: 'Efeito visual exuberante de chamas que segue os passos do seu personagem em todo o servidor.',
    image: 'sparkles',
    active: true,
    highlights: ['100% cosmético', 'Ativável e desativável pelo /particulas'],
    order: 5
  },
  {
    id: 'prod-unban',
    name: 'Perdão Judicial (Unban)',
    category: 'outros',
    price: 35.00,
    description: 'Segunda chance para jogadores que foram punidos com banimento por infrações leves do servidor.',
    image: 'unlock',
    active: true,
    highlights: ['Reativação imediata da conta', 'Não aplicável a trapaças graves repetidas'],
    order: 6
  }
];

export const initialEvents: ServerEvent[] = [
  {
    id: 'ev-1',
    name: 'Torneio Gladiador Semanal',
    description: 'A maior batalha do NetCraftBR! Todos os clãs e jogadores se reúnem na arena coliseu para lutar até o último sobrevivente.',
    date: 'Sábado',
    time: '19:00 (Brasília)',
    status: 'Próximo',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    rewards: ['1x VIP Supreme (30 dias)', '500.000 Coins para o Clã Vencedor', 'Troféu Físico no Hall da Fama'],
    published: true,
    location: '/warp gladiador'
  },
  {
    id: 'ev-2',
    name: 'A Caçada ao Dragão Ancestral',
    description: 'O Ender Dragon despertou com mutações de fogo sombrio e vida triplicada. Reúna seus aliados para derrotá-lo.',
    date: 'Domingo',
    time: '17:00 (Brasília)',
    status: 'Próximo',
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    rewards: ['Ovo de Dragão Decorativo', 'Armaduras Netherite Lendárias', 'Chaves Místicas para todos os participantes'],
    published: true,
    location: '/warp the-end'
  },
  {
    id: 'ev-3',
    name: 'Corrida de Barcos no Gelo',
    description: 'Circuito veloz construído nas alturas com obstáculos, saltos acrobáticos e curvas perigosas.',
    date: 'Quarta-feira',
    time: '20:00 (Brasília)',
    status: 'Encerrado',
    image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
    rewards: ['1x VIP Elite', '100.000 Coins', 'Tag [PILOTO] no chat'],
    published: true,
    location: '/warp corrida'
  }
];

export const initialNews: NewsArticle[] = [
  {
    id: 'news-1',
    title: 'Grande Inauguração da Temporada NetCraftBR 2.0!',
    summary: 'Novo mapa com biomas expandidos, economia reformulada e sistema de terrenos mais rápido.',
    content: `Sejam bem-vindos à nova era do NetCraftBR! É com imenso orgulho que anunciamos a abertura da Temporada 2.0 para todos os jogadores do Minecraft Bedrock.

Nesta nova temporada preparamos:
• Mundo totalmente novo gerado na versão mais recente do Minecraft Bedrock.
• Novo sistema de proteção de terrenos por bloco, sem lag e 100% intuitivo.
• Reformulação completa dos preços da loja de minérios.
• Adição de novos kits para os planos VIP Explorer, Elite e Supreme.
• Servidor de alta performance hospedado no Brasil com ping super baixo.

Junte-se a nós hoje mesmo conectando em netcraftbr.srvmc.com na porta 25673!`,
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    date: '2026-09-28',
    author: 'Equipe NetCraftBR',
    published: true,
    category: 'Atualização'
  },
  {
    id: 'news-2',
    title: 'Chegada dos Novos Bosses Customizados no Nether',
    summary: 'Enfrente o Demônio das Chamas e o Guarda do Vazio em masmorras sombrias.',
    content: `Os guerreiros mais corajosos agora têm um novo desafio: masmorras lendárias foram descobertas nas profundezas do Nether!

A cada 4 horas, um chefe temível surge com padrões especiais de ataque e invocação de servos. Derrotar um chefe concede fragmentos para forjar as novas armas cósmicas.

Reúna seu clã e prepare suas poções!`,
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    date: '2026-09-25',
    author: 'Brenno (Owner)',
    published: true,
    category: 'Novidade'
  },
  {
    id: 'news-3',
    title: 'Manutenção Preventiva de Infraestrutura e Redução de Ping',
    summary: 'Melhorias de rota para jogadores de celular e consoles em todas as regiões do Brasil.',
    content: `Realizamos com sucesso a migração de roteamento para um novo nó de rede de baixa latência.

Jogadores no celular (Android e iOS), consoles (Xbox, PlayStation, Nintendo Switch) e Windows agora contam com resposta instantânea de quebra de blocos e combate fluído.

Agradecemos a todos pelo feedback contínuo em nossa comunidade do Discord!`,
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80',
    date: '2026-09-20',
    author: 'Suporte Técnico',
    published: true,
    category: 'Manutenção'
  }
];

export const initialSocialLinks: SocialLink[] = [
  {
    id: 'soc-discord',
    platform: 'discord',
    name: 'Discord Oficial',
    url: 'https://discord.gg/netcraftbr',
    icon: 'MessageSquare',
    active: true,
    description: 'Comunidade ativa com mais de 3.500 membros, sorteios semanais, anúncios e chat de voz.',
    memberCount: '3.540 membros'
  },
  {
    id: 'soc-youtube',
    platform: 'youtube',
    name: 'Canal no YouTube',
    url: 'https://youtube.com/@netcraftbr',
    icon: 'Youtube',
    active: true,
    description: 'Trailers oficiais de atualização, tutoriais de sistemas e cobertura dos torneios Gladiador.',
    memberCount: '12.800 inscritos'
  },
  {
    id: 'soc-tiktok',
    platform: 'tiktok',
    name: 'TikTok NetCraftBR',
    url: 'https://tiktok.com/@netcraftbr',
    icon: 'Video',
    active: true,
    description: 'Clipes engraçados da galera, melhores construções dos jogadores e dicas rápidas de Bedrock.',
    memberCount: '45.000 seguidores'
  },
  {
    id: 'soc-instagram',
    platform: 'instagram',
    name: 'Instagram do Servidor',
    url: 'https://instagram.com/netcraftbr',
    icon: 'Instagram',
    active: true,
    description: 'Stories com bastidores da equipe, novidades em primeira mão e spoilers de novos eventos.',
    memberCount: '8.900 seguidores'
  },
  {
    id: 'soc-whatsapp',
    platform: 'whatsapp',
    name: 'Grupo de Avisos WhatsApp',
    url: 'https://chat.whatsapp.com/netcraftbr',
    icon: 'Phone',
    active: true,
    description: 'Canal oficial e silencioso apenas para anúncios importantes de eventos e cupons relâmpago.',
    memberCount: '950 membros'
  }
];

export const initialPlayers: Player[] = [
  {
    id: 'player-brenno',
    nickname: 'BrennoMCPE',
    createdAt: '2026-09-01T10:00:00.000Z',
    lastActive: new Date().toISOString(),
    activeVips: [
      {
        vipId: 'vip-legendario',
        vipName: 'Lendário',
        activatedAt: '2026-09-01T10:00:00.000Z',
        expiresAt: null
      }
    ],
    totalSpent: 89.90,
    ordersCount: 1,
    bio: 'Criador e fundador do NetCraftBR.'
  },
  {
    id: 'player-steve',
    nickname: 'GamerGuerreiro',
    createdAt: '2026-09-12T14:30:00.000Z',
    lastActive: '2026-10-01T12:00:00.000Z',
    activeVips: [
      {
        vipId: 'vip-elite',
        vipName: 'Elite',
        activatedAt: '2026-09-15T18:20:00.000Z',
        expiresAt: '2026-10-15T18:20:00.000Z'
      }
    ],
    totalSpent: 29.90,
    ordersCount: 1,
    bio: 'Líder do Clã Dragões Vermelhos.'
  }
];

export const initialOrders: Order[] = [
  {
    id: 'ORD-781923',
    buyerNickname: 'BrennoMCPE',
    recipientNickname: 'BrennoMCPE',
    productId: 'vip-legendario',
    productName: 'VIP Lendário',
    productType: 'vip',
    amount: 89.90,
    createdAt: '2026-09-01T10:00:00.000Z',
    status: 'Entregue',
    transactionId: 'TX-PIX-984102941',
    paymentMethod: 'PIX',
    paidAt: '2026-09-01T10:01:15.000Z',
    deliveredAt: '2026-09-01T10:01:20.000Z'
  },
  {
    id: 'ORD-912845',
    buyerNickname: 'GamerGuerreiro',
    recipientNickname: 'GamerGuerreiro',
    productId: 'vip-elite',
    productName: 'VIP Elite',
    productType: 'vip',
    amount: 29.90,
    createdAt: '2026-09-15T18:20:00.000Z',
    status: 'Entregue',
    transactionId: 'TX-PIX-120491823',
    paymentMethod: 'PIX',
    paidAt: '2026-09-15T18:21:05.000Z',
    deliveredAt: '2026-09-15T18:21:10.000Z'
  }
];
