# NetCraft Delivery — comprovação de sessão dentro do Minecraft (2026-11-07)

**Estado: código/contrato candidato, LAB OFF.** Sem ativação de Mercado Pago comercial, Vercel Production, Worker ou MagnoHost. Branch `redesign-mobile-solaris`; o Core v2.3.35 LAB OFF atualmente instalado **não executa** o novo comando de vinculação. Nenhuma compra real foi efetuada, nenhum VIP entregue. Não alterar Cabeças PvP, Mina Principal ou Arena PvE nesta fase.

## O que foi implementado no backend

- `server/delivery/commercialGamePairing.ts` mantém pares transacionais em coleções **exclusivamente comerciais e isoladas**: `pixCommercialPlayerLinkSlots` e `pixCommercialPlayerLinkCodes`. Exige Firestore transacional, segredo HMAC próprio de pelo menos 32 bytes e um pedido persistido criado pelo checkout comercial confiável.
- O navegador, que já possui o segredo individual `x-checkout-key` do pedido, poderá chamar `POST /api/pix/commercial/orders/link-code`. Não recebe permissão de entrega: somente um código `NC-XXXX-XXXX-XXXX-XXXX` de 80 bits, válido por 10 minutos. No banco entra apenas o HMAC do código; 5 emissões por pedido a cada 24 horas. Não registrar o código em logs.
- **Dentro do jogo**, o próprio Core deverá receber o código de um jogador online, ler **`player.name` e `player.id` do objeto autenticado pelo BDS** e enviar `{code,gamertag,sessionId}` por `POST /api/delivery/bds/link` ao gateway privado HTTPS. **Nunca aceitar `gamertag` ou `sessionId` do navegador como principal autenticado.**
- A chamada BDS exige a mesma `SecretString` de transporte, nonce emitido e persistido por `POST /api/delivery/bds/challenge`, assinatura interna do gateway, verificação de replay e transação de consumo do código. Código usado, expirado, nome divergente ou não aprovado não cria vínculo.
- O vínculo dura 15 minutos e vale **apenas para a sessão BDS indicada**, não para qualquer jogador com o mesmo nick. Essa sessão deve ser confirmada no Core; `player.id` **não é um identificador permanente de conta Microsoft/Xbox/XUID**. Reconexão, expiração ou mudança de sessão exigem revalidação.
- `poll` agora admite opcionalmente `sessionId`; o backend comercial só oferta VIP quando `authorizeOrderForDispatch` confirmar a sessão vinculada, além de exigir pagamento aprovado pela **Orders API**, catálogo exato, destinatário e antifraude. A reserva persiste a sessão; o `ACK` deve usar **a mesma sessão**. A ligação expirada após a reserva entra em revisão, nunca gera retry ou nova recompensa cega.
- O overlay em `minecraft/delivery-core-v2330-clone/overlay/scripts/delivery/` oferece `link`, `poll` e `ack` com suporte ao `sessionId`, preservando assinaturas legadas para fixtures. Este overlay **não foi integrado ao Core instalado**.

## Contrato mínimo de simulação

1. Checkout autenticado cria um pedido `pending` em Firestore isolado; comprador recebe somente seu código temporário. **Pedido pendente nunca concede VIP**.
2. BDS apresenta o código digitado pelo jogador como prova de acesso à sessão ativa; gateway verifica token, nonce, corpo e vínculo com a conta do jogo. Código válido é consumido atomicamente.
3. Mesmo que tenha vínculo, apenas `processed/accredited` confirmado pela Orders API com coletor, valor, moeda e catálogo corretos gera uma entrada transacional na fila.
4. Quando o mesmo jogador estiver online, o BDS consulta via `poll({gamertag,online:true,sessionId:player.id})`; sessões divergentes recebem zero ofertas.
5. Executor Core real grava recibo write-ahead antes de atualizar o VIP, confere rank, vigência, elegibilidade e vínculo; `ACK` usa o mesmo `player.id` e token de reserva. Reenvio do mesmo ID nunca concede duas vezes.

## Bloqueios para produção (NÃO contornar)

- Falta instalar e testar no Core v2.3.35+ o comando/menu que aceite um código do **jogador real** e envie `link` pelo gateway privado com `player.name/id`, inclusive tratamento de desconexão, troca de sessão e logs sanitizados. A prova do site apenas **não** é um login Xbox.
- Falta conferir `@minecraft/server-net`, `@minecraft/server-admin` e permissões no BDS final em execução; os testes anteriores de HTTPS confirmaram **GET/POST de diagnóstico**, não autorização de entrega.
- `NCBR_COMMERCIAL_GAME_LINK_HASH_SECRET` é um **novo segredo privado** exclusivo do gateway e deve permanecer apenas no cofre de ambiente, separado do bypass de Vercel, HMAC de requests e token BDS. **Não enviar esse valor por chat, não salvá-lo no GitHub nem em BP/RP**.
- O runtime comercial exige esse segredo e continua recusando Preview/LAB, Firestore compartilhado, credenciais faltantes, catálogo fora dos três VIPs aprovados ou ausência de sessão verificada. A rota não foi ativada em Vercel Production.
- Homologação real de Core com recibos, reinício, liberação de VIP em sessão autêntica, confirmação por gateway e rollback antes de liberar qualquer cobrança comercial.
- Não confundir `player.id` com XUID estável. Para uma política de **conta permanente** ainda será necessário implementar um mecanismo confiável de identidade Microsoft/Xbox; o candidato atual limita entrega à sessão ativa verificada no BDS e falha de forma restritiva em casos desconhecidos.

## Verificação

`tests/delivery-commercial-game-pairing.test.tsx`: código único, proteção do segredo, voucher expirado, nome errado, sessão errada, replay, cancelamento, limite de emissões e TTL.
`tests/delivery-commercial-linked-bds.test.tsx`: pagamento mock pendente/aprovado, token BDS inválido, nonce emitido, link game, poll de sessão inválida, ACK correto/incorreto, bloqueio de recompensa duplicada. Esses testes **não executam servidor Bedrock nem fazem compra no Mercado Pago**.

### Critério de aceite do próximo addon

Só criar uma versão v2.3.x consistente de BP+RP quando o módulo de comando do jogador e o Core VIP puderem ser integrados sem alterar os sistemas de PvP, minas ou arena. O primeiro teste real deve ser em **Mundo Eterno (MagnoHost teste)** com Delivery comercial **OFF** e pagamentos fictícios. Nunca modificar o servidor oficial ou permitir entrega real sem autorização expressa e evidências do ciclo completo.
