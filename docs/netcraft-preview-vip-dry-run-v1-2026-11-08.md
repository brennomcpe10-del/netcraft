# NetCraftBR — VIP dry-run v1: Explorer / Elite / Supreme (Preview only, OFF)

## Objetivo e estado

O teste em `Mundo Eterno` já confirmou a comunicação HTTPS do Core 2.3.38 com a Preview da loja e a confirmação de um código no jogo. O passo seguinte **não instala um VIP real**. Este módulo calcula e registra **uma previsão fictícia de concessão por 30 dias** com controle de idempotência.

**Fora de escopo:** pagamentos, checkout comercial, webhook, fila de entrega, credenciais Xbox, comando de concessão, chamada `Server.VIPSystem`, BDS poll/ACK/NACK, mudança de rank real, alteração de `main`, ativação em Production ou alteração do Core. O NetCraftCore **continua v2.3.38 LAB OFF**.

## Roteiro prático de homologação no painel Preview

1. Entre no painel administrativo da Preview da branch `redesign-mobile-solaris` e abra **Pedidos -> Teste: Vincular compra no Minecraft**.
2. Com o jogador conectado ao Mundo Eterno, gere um **novo código fictício** para o gamertag correto e confirme em **Benefícios -> Vincular compra** no jogo. Use o código antes de 10 minutos. Os comprovantes de códigos antigos, emitidos antes de `proofExpiresAt` ser implementado, são recusados para simulação por segurança.
3. Clique em **Consultar confirmação no jogo**. Deve mostrar `verified_in_game`. A vinculação tem prova transitória por **15 minutos contados da confirmação**, não uma identidade Xbox permanente.
4. Selecione **Explorer** e clique em **Simular VIP (sem entrega real)**. O painel informa gamertag, `ncbr:vip_explorer`, início fictício, fim fictício exato 30 dias depois e **VIP NÃO ENTREGUE**.
5. Um segundo clique/reenvio do mesmo recibo/tier não cria outra simulação; escolher outro tier para o mesmo recibo é bloqueado. Para simular **Elite** ou **Supreme**, emita **um novo código** e repita as etapas. Limite: **5 códigos por jogador a cada 24h**, com apenas um código ativo por vez.
6. Testes de segurança adicionais automatizados: código usado/repetido, nick diferente, sessão expirada, nonce reutilizado, total de 30 dias imutável, campos extras forjados, mudança de tier, requisições fora da Preview, ausência de login administrativo e duas solicitações simultâneas em transação Firestore Emulator.

## Contratos e isolamento

- `server/delivery/previewGameLinkLab.ts`: mantém recibo de vinculação (novo campo `proofExpiresAt`), limitado a uma sessão de 15 minutos.
- `server/delivery/previewVipDryRunLab.ts`: exige comprovante `verified_in_game` ainda válido, gamertag e digest de sessão internos. Aceita **apenas** `{receiptId,tier}`; o cliente não escolhe destinatário, tag, ID do produto, preço, duração, início ou fim.
- `server/routes/previewGameLinkLab.ts`: `POST /api/delivery/lab-link/simulate-vip` e `GET /api/delivery/lab-link/simulation/:id` são exclusivos da Preview, branch autorizada, com flag `NCBR_PREVIEW_GAME_LINK_LAB_ENABLED=true` **e token de administrador**. Não fazem nenhuma chamada a Mercado Pago.
- Somente nova coleção `previewDeliveryVipDryRunV1`, com chave idempotente `receiptId`. Dados de vínculo permanecem em `previewDeliveryLinkLabV1*`. **Não criar nem atualizar** `pixCommercialOrders`, `pixCommercialDeliveries`, `users`, `orders` nem dados de VIP reais.
- Cliente recebe `simulation:true, dispatchEnabled:false, grantsEnabled:false, paymentsEnabled:false, liveVipGranted:false`. Serviço grava os mesmos bloqueios. Não existe um executor BDS/Bedrock para esta simulação.
- Consulta e simulação são protegidas pelo acesso administrativo; a rota comercial de Pix permanece desativada na Preview. **A Preview ainda compartilha projeto Firebase com Production**: o novo namespace de teste é isolado por nome, mas NÃO por projeto físico. A migração para banco separado continua requisito antes da ativação comercial.

## Planos previstos (apenas cenário fictício)

| Plano | Produto aprovado Preview | Tag prevista | Duração simulada |
|---|---|---|---|
| Explorer | `vip-1791128040888-vvek` | `ncbr:vip_explorer` | 30 dias |
| Elite | `vip-1791128072288-kztd` | `ncbr:vip_elite` | 30 dias |
| Supreme | `vip-1791128111086-kw5n` | `ncbr:vip_supreme` | 30 dias |

Esses IDs são os **identificadores aprovados para o laboratório Preview**; não autorizam automaticamente a comercialização.

## Evidências automatizadas

- `tests/delivery-preview-game-link-lab.test.tsx` — código + desafio + expiração + anti-replay + rejeição de outro jogador.
- `tests/delivery-preview-vip-dry-run-lab.test.tsx` — três tiers, 30 dias, nome correto, sessão ativa, idempotência, adulteração e nenhuma entrega.
- `tests/delivery-preview-game-link-route-off.test.tsx` — rotas bloqueadas fora da Preview/sem acesso administrativo e sem poll/ACK comercial.
- `tests/delivery-preview-vip-dry-run-firestore.integration.ts` — transações simultâneas reais no Firestore Emulator, uma única simulação.
- `.github/workflows/delivery-release-candidate.yml` — CI do emulador exige a nova prova de concorrência e mantém **release OFF**.

**Resultado correto é um registro de simulação fictício, não um VIP no Minecraft.** A futura etapa separada de concessão em um clone do servidor, sem recompensas reais, exigirá teste independente de identidade estável, reconciliação e ACK antes de qualquer pagamento comercial.
