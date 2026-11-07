# NetCraftBR — homologação Preview/MagnoHost do vínculo v2.3.37 (SEM pagamentos)

**Ambiente exclusivo:** branch `redesign-mobile-solaris`, Vercel Preview, servidor de testes MagnoHost `Mundo Eterno`. O Core instalado v2.3.36 continuará funcional até o usuário atualizar para v2.3.37. **Não alterar o servidor oficial, Main, Production, Mercado Pago real, Cloudflare público, cabeças PvP, Mina Principal ou arena PvE.**

## O que esta homologação demonstra

1. Um administrador autenticado no painel da Preview vai até **Pedidos -> Teste: Vincular compra no Minecraft**, informa o gamertag exato conectado e gera `NC-XXXX-XXXX-XXXX-XXXX`. **É código fictício**, não existe Pix, pedido comercial, pagamento nem recompensa.
2. O servidor de testes com Core 2.3.37 tem **Benefícios -> Vincular compra**. Somente o `Player` real online fornece `player.name` e `player.id`. O Core envia via `@minecraft/server-net` ao endereço HTTPS `/api/delivery/bds`.
3. Primeiro o Core faz `POST /challenge` com `SecretString` BDS e bypass Vercel em **dois headers separados**. O backend gera nonce criptográfico, gravado em `previewDeliveryLinkLabV1Nonces`, retornando `simulation:false,dispatchEnabled:false` exigidos pelo contrato de transporte, **não** uma concessão.
4. O Core faz `POST /link` com nonce e body `{code,gamertag,sessionId}`. Backend consome nonce **mesmo em falha**, consome código exclusivamente para o gamertag exato, persiste recibo em `previewDeliveryLinkLabV1Receipts`, retorna `verified_in_game` sem conceder nada. Código expira em 10 minutos e só serve uma vez.
5. O administrador clica **Consultar confirmação no jogo**; o status passa a `verified_in_game`. Um segundo uso, nome divergente ou código expirado é rejeitado. **Não há endpoints Preview de poll/ACK/NACK**; permanecem bloqueados pelo router comercial.

## Isolamento, credenciais e limitações

- Todos os registros novos usam o prefixo **`previewDeliveryLinkLabV1`**. Não se leem nem se modificam `orders`, `pixTestOrders`, `pixCommercialOrders`, filas ou outros dados existentes.
- **A Preview e Production ainda compartilham projeto e banco Firebase** no momento desta etapa; estes testes escrevem apenas documentos de nova coleção exclusiva de homologação no mesmo projeto, não em um projeto Firebase separado. Esta é uma limitação declarada do ambiente existente. Os documentos de homologação nunca são usados pelo comércio.
- As rotas só funcionam com `VERCEL_ENV=preview`, `VERCEL_GIT_COMMIT_REF=redesign-mobile-solaris` e `NCBR_PREVIEW_GAME_LINK_LAB_ENABLED=true`. Production permanece inacessível.
- O token privado `NCBR_PREVIEW_BDS_LINK_TOKEN` é exclusivo da Preview e de MagnoHost LAB, sem reutilizar o bypass global da Vercel, o token Mercado Pago ou segredo de qualquer webhook. Somente no ambiente protegido. Não publicar em commits, BP/RP, logs nem chat.
- Na MagnoHost, o módulo de script do BP tem UUID `bacf7af0-3528-5c77-a991-8bf0613b038a`; configurar `variables.json` e `secrets.json` em `/home/container/config/<script-module-uuid>/`. `NCBR_DELIVERY_LINK_ENABLED` deve ser `true` SOMENTE durante a homologação. `NCBR_DELIVERY_URL` precisa apontar para a Preview READY correta com `/api/delivery/bds`. Em `secrets.json`, fornecer `NCBR_DELIVERY_BDS_TOKEN` dedicado ao LAB, mais `NCBR_DELIVERY_PREVIEW_BYPASS` obtido da credencial de automação de Vercel existente. Não confundir os dois valores.
- A configuração de `permissions.json` de `@minecraft/server-net` precisa permitir apenas `/challenge` e `/link` HTTPS do alvo de Preview correto, `force_https=true`. Não substitua outras permissões existentes sem mesclar.
- **`NCBR_DELIVERY_ENABLED=OFF` sempre.** O módulo `nick_bridge_entry.js` de v2.3.37 mantém `COMMERCIAL_DISPATCH_LAB_LOCKED=true` mesmo que alguém tente ativar flags; nunca executa a bomba de entrega de VIP.
- Uma sessão `player.id` autenticada no BDS não é um identificador Microsoft/Xbox permanente. Este LAB mede apenas a vinculação transitória e a resposta HTTPS; não habilita comércio real.

## Falhas esperadas (seguras)

- Core instalado com `NCBR_DELIVERY_LINK_ENABLED=false`: mensagem de serviço em preparação, sem HTTP.
- URL/permission/bypass/token incorreto: falha de vinculação genérica, sem vazamento de credenciais ou VIP.
- Preview desativada ou branch errada: HTTP 503; Production não recebe código.
- Código com outro nick, expirado ou usado: recusado. Nonce repetido: recusado.
- `POST /api/delivery/bds/poll`, `ack` e `nack` na Preview: HTTP 503, independentemente do token.
- Sem credencial Firebase Preview disponível: HTTP 503; não cria estado falso nem libera benefícios.

## Testes de qualidade

`tests/delivery-preview-game-link-lab.test.tsx` verifica emissão CSPRNG, código mascarado no Firestore, nonce transacional, sessão e nick, replay, expiração, 5 tentativas por dia e ausência de acesso a coleções comerciais.

`tests/delivery-preview-game-link-route-off.test.tsx` verifica que em Production, sem flags e com `poll/ack/nack` a rota não oferece nada, mesmo quando o LAB está ativado.

Este teste deve ser concluído **antes** de homologar qualquer VIP fictício. Não ativar Pix comercial nem recompensas com base apenas neste resultado.
