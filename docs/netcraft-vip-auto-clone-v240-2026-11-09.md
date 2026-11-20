# NetCraftBR — entrega VIP automática em CLONE v2.3.40 (PREVIEW / PAGAMENTOS OFF)

## Objetivo

Este laboratório, exclusivamente na branch `redesign-mobile-solaris`, permite validar o caminho **vincular código no Minecraft clone → painel do site → pedido fictício → poll HTTPS do clone → concessão VIP pelo Core clone → ACK no painel**, **sem Pix, sem pedido comercial e sem alterar o Mundo Eterno**.

Foi preservado o NetCraftCore v2.3.38 oficial. O novo artefato é outro clone, **v2.3.40**, com BP/RP, módulos, versões e UUIDs próprios. Não substitui a v2.3.39 do teste manual. O Core original mantém `COMMERCIAL_DISPATCH_LAB_LOCKED=true`; toda a rotina automática nova está atrás de guardas exclusivas do clone.

## Limites fundamentais

- Nunca instale o clone no Mundo Eterno, Production ou no mundo principal. Use BDS **separado**, mundo novo, allow-list, somente o testador.
- O clone deve ter somente BP/RP deste novo pacote, sem o Core v2.3.38 ou 2.3.39 simultaneamente.
- Sem gatilho para dinheiro real. O pagamento e as filas comerciais continuam **OFF**.
- A Preview ainda compartilha projeto físico Firebase com outros ambientes; todos os novos registros usam **somente** `previewCloneVipAutoV1Jobs`, `previewCloneVipAutoV1Slots` e `previewCloneVipAutoV1Nonces`. Não são jobs comerciais.
- A identidade é somente **sessão Bedrock autenticada** pelo clone, verificada via HMAC do código emitido no site. Não é autenticação permanente Microsoft/Xbox. Antes de ativar produção, é necessário um vínculo persistente independente, reconciliação Mercado Pago e homologação com pagamentos.
- Se uma reserva fica incerta após falha, fica `manual_review`; **nunca** se reenvia a concessão cegamente. O clone faz retentativa de ACK na mesma execução, mas uma queda antes dele exige revisão manual.

## Backend e interface

- `server/delivery/previewCloneVipAutoLab.ts`: exige recibo de vínculo confirmado dentro de 15 minutos, envia somente três tiers aprovados (Explorer, Elite, Supreme), cada um 30 dias, com identidades fixas server-side.
- Autenticação exclusiva de clone com `NCBR_PREVIEW_CLONE_BDS_TOKEN` (sensitive), nonce aleatório de uso único, TTL de 60s, HTTPS obrigatório. Além disso, a sessão do clone precisa ser **exatamente a mesma** que confirmou o código, usando HMAC com o token dedicado `NCBR_PREVIEW_BDS_LINK_TOKEN`.
- `POST /api/delivery/lab-clone-vip/queue` (admin), `GET .../status/:receiptId` (admin), e `POST .../bds/{challenge,poll,ack,nack}` (clone SecretString).
- Rotas ativadas somente com `VERCEL_ENV=preview`, branch exata e `NCBR_PREVIEW_CLONE_AUTO_ENABLED=true` + `NCBR_PREVIEW_GAME_LINK_LAB_ENABLED=true`; nunca Production.
- Uma fila por recibo, uma reserva por vez, lease 90s. O painel mostra `queued_clone`, `offered_clone`, `acknowledged_clone` ou `manual_review`, conforme confirmação.
- `src/components/PreviewGameLinkLab.tsx`: opção adicional **Teste automático: Site → Minecraft CLONE** só quando laboratório explicitamente configurado. A opção antiga **Simular VIP (SEM entregar)** continua disponível e separada.

## Configuração do BDS clone (somente clone)

Clone v2.3.40: importar o novo `.mcaddon` em um mundo Bedrock **isolado**. Consultar o módulo de script UUID contido no `manifest.json` do BP e usar sua pasta `config/<script-uuid>/`.

Mesclar com `variables.json` (somente clone), sem sobrescrever configurações já existentes:

- `NCBR_VIP_CLONE_GUARD="I_ACK_ISOLATED_WORLD_2_3_40"`
- `NCBR_VIP_CLONE_GAMERTAG="Halzin5212"`
- `NCBR_VIP_CLONE_AUTO_ENABLED=true`
- `NCBR_DELIVERY_ENABLED="OFF"`
- `NCBR_DELIVERY_LINK_ENABLED=true` — **necessário para confirmar o código no próprio clone**; não libera entregas comerciais
- `NCBR_DELIVERY_URL="https://<PREVIEW-READY>/api/delivery/bds"` — vinculação existente
- `NCBR_VIP_CLONE_AUTO_URL="https://<PREVIEW-READY>/api/delivery/lab-clone-vip/bds"`

Em `secrets.json`, **não em GitHub nem neste documento**, configurar as três chaves SecretString:

- `NCBR_DELIVERY_BDS_TOKEN` — mesmo token de vinculação da Preview já existente; exclusivamente em laboratório
- `NCBR_DELIVERY_PREVIEW_BYPASS` — segredo de automação da proteção de deployment Preview (não confundir com token BDS)
- `NCBR_VIP_CLONE_BDS_TOKEN` — token novo, exclusivo deste clone, igual ao `NCBR_PREVIEW_CLONE_BDS_TOKEN` da Preview (entregue apenas no ZIP privado para a máquina do testador)

Em `permissions.json` da pasta UUID do novo script, garantir módulos `@minecraft/server`, `@minecraft/server-ui`, `@minecraft/server-admin`, `@minecraft/server-net` e as seis URIs HTTPS permitidas em `module_permissions["@minecraft/server-net"].allowed_uris`: `/api/delivery/bds/challenge`, `/api/delivery/bds/link`, `/api/delivery/lab-clone-vip/bds/challenge`, `/poll`, `/ack`, `/nack` no MESMO domínio de Preview. A configuração entregue no ZIP traz exemplos para mesclar, nunca alterar permissões globais além do necessário.

## Teste manual no servidor Bedrock isolado

1. Iniciar servidor **clone** novo com os packs e a configuração do laboratório. No console procurar `[NCBR VIP CLONE AUTO V240] READY_CLONE_ONLY_NO_COMMERCIAL_DISPATCH` e `[NCBR DELIVERY LINK] READY_LAB_OFF_NO_AUTOMATIC_GRANTS`.
2. Entrar com o gamertag exato `Halzin5212` e colocar tag `admin` somente no clone.
3. Abrir painel administrativo da Preview, gerar um código de vinculação para `Halzin5212`, entrar em **Benefícios → Vincular compra** dentro do **clone**, digitar e confirmar.
4. No site consultar `Código confirmado dentro do Minecraft`. No painel de teste automático selecionar Explorer e clicar **Enviar pedido FICTÍCIO ao clone**.
5. Com o jogador ainda online, o clone reserva a oferta, aplica VIP Explorer 30 dias e envia ACK. Atualizar o status no painel, deve indicar `acknowledged_clone`. O menu VIP do clone mostra o plano e a duração.
6. Reiniciar o clone e confirmar que a tag e prazo persistiram. Nenhuma segunda entrega deve acontecer.
7. Elite e Supreme devem ser testados em **mundos de teste limpos** diferentes (ou snapshots restaurados) para não contornar a política de upgrades/downgrades. Cada tier usa um novo código e um novo recibo da Preview.

## Verificações automáticas

- `tests/delivery-preview-clone-vip-auto.test.tsx`: mapeamentos, expiração, nonce único, sessão errada, ACK duplicado, quarentena.
- `tests/delivery-preview-clone-vip-route-off.test.tsx`: Preview/Production, HTTPS, admin e token.
- `tests/delivery-preview-clone-vip-firestore.integration.ts`: Firestore Emulator com duas consultas simultâneas, apenas um lease e ACK.
- `tests/delivery-vip-clone-auto-pump.test.mjs`: concessão única em três tiers, erro de rede no ACK, clonagem incorreta ou pacote fraudado.
- `scripts/package-netcraft-delivery-v040.mjs` original continua independente e inativo. O artefato v2.3.40 específico é compilado a partir do clone fornecido no projeto, nunca implantado por CI no Mundo Eterno.

**Critério de aprovação final dessa etapa:** confirmação manual no BDS clone de cada plano, scoreboard/menu VIP, validade de 30 dias, recibo após reinício e estado `acknowledged_clone` no painel. O teste não libera Production ou cobranças comerciais.
