# NetCraft Delivery — recuperação, duplicidade, revisão e auditoria (20–23)

Data: 2026-11-02. Escopo: branch `redesign-mobile-solaris`; serviço **comercial candidato apenas no Firestore Emulator**. Nenhum deploy de produção, entrega real, Pix real, MagnoHost ou alteração de `main`.

## 20. Recuperação após queda ou reinício

- O registro persistente `pixCommercialDeliveries` mantém o identificador determinístico `{orderId}-{lineIndex}`, o token original da reserva e o número de tentativas.
- A função **explícita** `recoverAfterRestart(limit)` consulta as reservas `leased` antigas (mais de 120 segundos); confirma de novo a condição do pagamento sempre que possível e as passa a `awaiting_receipt`.
- Uma reserva `awaiting_receipt` **não é recolocada automaticamente na fila**, mesmo com timeout. O comprovante persistente do Core pode ainda chegar pelo ACK/NACK assinado com o token original.
- Se o provedor estiver fora do ar, mantém a reserva pendente de comprovante e o diagnóstico `provider_check_failed`; nenhum retry automático e nenhuma recompensa liberada.
- O scanner não roda em background nem está montado no servidor comercial. A futura operação privada deverá chamá-lo de maneira supervisionada.

## 21. Conexão perdida durante a concessão

- Nunca há uma segunda reserva para o mesmo ID `leased` ou `awaiting_receipt`. Mesmo após restart, ACK válido do token original confirma uma única vez; ACK repetido retorna `duplicate:true`.
- Somente NACK de um erro comprovadamente pré-entrega (`player_offline`, `inventory_full`, `inventory_unavailable`, `vip_not_configured`, `vip_not_loaded`) acompanhado de `receipt:none` pode voltar ao estado `queued`, com backoff e nova checagem de pagamento.
- Recibo `started`/`applied`/`unknown`, falha parcial, perda de ACK sem comprovante e qualquer dúvida são **revisão manual**, nunca retentativa cega.
- O executor lab `minecraft/delivery-v031-core-lab/core_delivery_lab_v031.js` continua usando recibo write-ahead por ID e impedindo repetir kits ou VIPs já aplicados, incluindo após reinício do engine; isso ainda exige homologação no BDS real.

## 22. Estornos, chargebacks, disputas e revisão

- A inspeção autenticada da Orders API detecta estorno/chargeback antes de qualquer aprovação; estados de disputa como `in_mediation`, `disputed` ou `under_review` bloqueiam autorização de novas entregas.
- Ao reconciliar o pagamento, jobs existentes ficam `blocked`. Entrega já reconhecida (`acknowledged`) fica `refunded_after_ack`: isso requer avaliação financeira/manual e **não** representa uma reversão automática no Minecraft.
- Um registro com disputa ou bloqueio não é reaberto por uma notificação posterior de aprovação. Ação do administrador e evidências do Core são exigidas no fluxo comercial futuro.
- Falha ao conferir o pagamento durante ACK impede considerar a entrega finalizada sem revisão; o serviço nunca confia apenas em estado local ou webhook.

## 23. Auditoria e diagnóstico sem credenciais

- `server/delivery/deliveryAudit.ts` grava eventos da máquina de estados **na mesma transação** que cria, oferece, bloqueia, devolve ou confirma jobs.
- `pixCommercialDeliveryAudit` armazena somente código de evento, motivo de uma lista permitida, hashes SHA-256 dos IDs, timestamp, ambiente e `dispatchEnabled:false`. Não registra gamertag, e-mail, CPF, código Pix, resposta bruta do provedor, credenciais, tokens HMAC, `leaseToken`, detalhes de inventário ou mensagens completas de exceção.
- `diagnose(deliveryId)` devolve apenas estado, motivo seguro, tentativas, necessidade de comprovante/revisão e indicador de ambiente desligado. Não retorna o payload de recompensa nem identificador de pagamento.
- O diário não fica exposto em rotas públicas. Uma interface de administrador real exigirá autenticação, autorização, retenção e auditoria adicionais antes de existir.

## Testes e restrições

- `tests/delivery-commercial-staging.test.tsx`: queda/reinício, ACK tardio e repetido, perda de conexão, NACK seguro/ambíguo, erro do provedor, disputa, chargeback, não-reativação e redação de logs.
- `tests/pix-emulator.integration.ts`: transações reais no Firestore Emulator, reinício lógico com outro objeto de serviço, comprovante ACK e audit journal sanitizado.
- Nenhum desses testes prova **ainda** E2E comercial completo com Mercado Pago real, gateway HTTPS de produção, transporte BDS comercial ou entrega real após falha.
- **Liberação comercial permanece bloqueada** por `commercialBoundary.ts` e `labOnly()`; não há gatilho, rota pública ou flag capaz de acionar entregas comerciais por acidente.
