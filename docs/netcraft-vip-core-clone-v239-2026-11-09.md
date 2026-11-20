# NetCraftCore VIP CLONE v2.3.39 — teste isolado de concessão

## Situação

O site já simulou Explorer, Elite e Supreme corretamente sem entregar VIP. Agora foi produzido um **clone isolado** a partir do Core 2.3.38, com versão de pacote [2,3,39], novos UUIDs para BP, RP e módulos e um teste sintético da escrita no VIPSystem. O Core 2.3.38 do Mundo Eterno não foi alterado.

**Este addon não é uma atualização para o Mundo Eterno.** Não instale lá nem no servidor oficial. A aplicação de VIP ocorre somente no clone mediante configuração exclusiva; pagamentos comerciais, Pix, Vercel e fila de entregas continuam OFF. Não há integração site -> VIP real nesta fase.

## Arquivo e instalação

O pacote .mcaddon e o ZIP com guia/configuração foram entregues como anexos na conversa do projeto. Crie um BDS separado com um **mundo novo**, diferente do Mundo Eterno, e utilize somente BP/RP do clone. Não copie segredos, banco de dados ou credenciais comerciais para esse clone.

UUID de módulo script do clone: 4c9a163d-a423-54cd-b889-1e07da5d9527.

No servidor isolado, crie o arquivo config/4c9a163d-a423-54cd-b889-1e07da5d9527/variables.json com estas propriedades:

- NCBR_VIP_CLONE_GUARD = I_ACK_ISOLATED_WORLD_2_3_39
- NCBR_VIP_CLONE_GAMERTAG = Halzin5212
- NCBR_DELIVERY_ENABLED = OFF
- NCBR_DELIVERY_LINK_ENABLED = false (boolean)

As permissões de @minecraft/server, @minecraft/server-ui e @minecraft/server-admin devem existir somente para o script de teste. Sem esse conjunto de configurações, o laboratório permanece OFF.

## Teste no mundo isolado (somente operador)

1. Entre com a conta de laboratório e, dentro do clone, execute: /tag Halzin5212 add admin
2. No **chat do jogador**, execute: /scriptevent ncbrlab:vip_apply explorer
3. Confirme o resultado applied e use: /scriptevent ncbrlab:vip_status explorer
4. Reinicie SOMENTE o servidor clone e repita o comando: não pode conceder VIP de novo.
5. Para Elite e Supreme, restaure uma cópia limpa do mundo ou crie outro mundo isolado: uma troca direta de plano deve ser recusada por vip_upgrade_review_required.

Os testes locais com código do executor v2.3.38 extraído do addon original aprovaram 6 cenários, incluindo três tiers, duplicação, bloqueio de outro jogador, mudança indevida de plano e recebimento incerto. Integridade do .mcaddon: BP 467 arquivos; RP 1302; ambas as versões [2,3,39] e UUIDs distintos.

Este marco AINDA NÃO comprova um teste real dentro de BDS: falta executar o clone no Minecraft e observar log e tags reais, incluindo persistência após reiniciar. O CI também verifica a segurança do módulo, mas não substitui essa execução in-game.

O núcleo de teste está em minecraft/vip-clone-lab/vip_clone_lab.js e o CI automatizado em tests/delivery-vip-clone-gate.test.mjs.

Nenhuma alteração em RTP, Cabeças PvP, Mina Principal ou Arena PvE. Pagamentos reais e delivery comercial permanecem desativados.
