# NetCraftBR Pix — etapas 13 e 14: idempotência e testes do ciclo

Ambiente: branch `redesign-mobile-solaris`, Firestore TEST e Mercado Pago simulado/test_user. **Nenhuma rota de pagamento comercial, deploy de Production, MagnoHost ou entrega real é habilitada.**

## 13 — Identidade e idempotência

- O checkout usa SHA-256 da chave `Idempotency-Key` como ID estável; requisições diferentes com a mesma chave são rejeitadas.
- Uma reserva transacional `creationLease`/ `creationLeaseUntil` (90 s) permite apenas um POST externo ativo por chave. Repetições simultâneas consultam o pedido existente e não geram novos POSTs.
- Uma criação interrompida pode ser retomada **apenas com a mesma chave imutável do Mercado Pago**. Nunca gerar novo ID ou nova chave para contornar timeout da API.
- `pixTestProviderOrderBindings` e `pixTestProviderPaymentBindings` são índices únicos por ID do provedor, vinculando uma order/um pagamento a apenas um checkout local. Um vínculo divergente gera HTTP 409 sem gerar jobs.
- Cada entrega de teste tem ID determinístico `{orderId}-{lineIndex}`, criado transacionalmente somente após GET autenticado com `processed/accredited` e valores integralmente pagos. Jobs de teste têm `dispatchEnabled: false`.
- Após reembolso, expiração ou cancelamento, jobs existentes são bloqueados. Nenhum retry desbloqueia uma entrega já bloqueada.
- A interface acompanha a criação de cobrança enquanto ainda não há ID do provedor.

## 14 — Suíte automatizada

`tests/pix-idempotency-cycle.test.tsx` (incluído no `npm test`):
- três requisições simultâneas com a mesma chave; apenas um POST ao provedor;
- repetições após sucesso; consultas simultâneas após aprovação; apenas um job;
- estorno e tentativa posterior de aprovação sem restaurar o job;
- falha de rede, lease em andamento e retomada após expiração da lease usando a mesma chave do provedor;
- identidade de pagamento/order duplicada entre dois checkouts bloqueada;
- rejeição, falha, cancelamento e expiração nunca geram jobs.

`tests/pix-emulator.integration.ts` (GitHub Actions — Firestore Emulator real):
- concorrência transacional real entre requisições, bindings persistentes únicos, GETs simultâneos, jobs por linha e bloqueio após reembolso.

**Limite importante:** as garantias acima cobrem a camada TEST e os contratos de entrega offline existentes. Para vendas comerciais, ainda são necessários banco comercial isolado, credenciais reais autorizadas, idempotência no executor BDS real, inspeção de pagamentos/reembolsos e homologação de ponta a ponta. Cobranças reais continuam OFF.

## Observação de operação

Se um POST externo falhar sem resposta conclusiva, o checkout pode mostrar `creating` até expirar a reserva. O cliente deve **reutilizar a mesma tentativa**; descartá-la não cancela a cobrança no provedor. Não programe retentativas com novas chaves.