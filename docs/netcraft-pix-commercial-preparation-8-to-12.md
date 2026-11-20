# NetCraftBR Pix — etapas 8 a 12 (candidata, sem ativação comercial)

**Branch de trabalho:** `redesign-mobile-solaris`. Este código **não
habilita pagamentos comerciais, não entrega itens no BDS e não altera
Production/MagnoHost**.

## 8. Checkout separado

- `/api/pix/config` e `/api/pix/orders` continuam usando somente
  `pixTestOrders`, test_user verificado e comprador fictício da Preview.
- `GET /api/pix/commercial/config` devolve HTTP 503 com os gates ausentes.
- `POST /api/pix/commercial/orders` e `POST /api/pix/commercial/webhook`
  devolvem HTTP 503 **mesmo se alguma variável de ambiente de comércio for
  definida**. Não existem rotas públicas capazes de iniciar cobranças reais.
- Tipos e namespaces futuros estão em
  `server/payments/commercialBoundary.ts` (`pixCommercialOrders`,
  `pixCommercialWebhookReceipts`, `pixCommercialDeliveries`). Não são
  coleções criadas nem usadas pelo checkout atual.

## 9. Webhook autenticado e antirrepetição

- `server/payments/mercadoPago.ts`: HMAC SHA-256, timestamp máximo
  de cinco minutos, identidade de recurso e request-id. Cabeçalhos
  com campos `ts`/`v1` duplicados são rejeitados.
- `server/payments/webhookReplay.ts`: claim transacional armazenado em
  `pixTestWebhookReceipts`, bloqueio concorrente, resultado concluído e
  liberação segura após erro. O ID do recibo usa somente SHA-256 de valores
  canônicos, sem armazenar a assinatura ou chave secreta.
- Um reenvio exato de notificação concluída recebe 200 **sem consultar
  novamente o provedor**. Uma nova notificação com request-id próprio
  é reconciliada normalmente. Se o processamento estiver em andamento,
  o servidor retorna 503 para permitir tentativa posterior.
- O corpo do webhook **nunca** autoriza pagamento; sempre é feita
  nova consulta autenticada ao Mercado Pago.

## 10. Orders API e identidade do recebedor

- `pixService.reconcile` consulta `GET /v1/orders/{id}` e compara
  collector, ID da order, referência externa, BRL, valor exato, método Pix
  e transação vinculada antes de alterar o registro de teste.
- `commercialInspection.ts` oferece **somente leitura** de uma
  order comercial futura com recebedor real verificado, sem gravar dados
  nem liberar recompensa. É intencionalmente desacoplado das rotas de
  pagamento até homologação comercial.

## 11–12. Pagamentos não aprovados e reversões

- Apenas `processed/accredited` em order e pagamento, **com valores
  totalmente creditados**, pode resultar em `approved`.
- Criado, processando, expirado, falho, rejeitado e cancelado não são
  confirmações de crédito.
- Reembolso (inclusive parcial) e chargeback recebem estado `refunded`.
- Uma reversão do estado anteriormente aprovado mantém o histórico de
  observação, mas bloqueia todos os jobs sintéticos existentes.
  Um job já bloqueado não é automaticamente desbloqueado por notificações
  posteriores. Estorno não retorna para `approved`.
- Mesmo um pedido de teste com estado `approved` gera apenas
  `dispatchEnabled:false`.

## Testes

- `tests/pix.test.tsx`: autenticação, cobranças duplicadas, consulta
  autenticada, fraudes no corpo de webhook, reenvios distintos, reversões,
  expiração, rejeição e reembolso.
- `tests/pix-commercial-safety.test.tsx`: rotas comerciais inertes, replay,
  intervalo de HMAC, validação do cabeçalho e recuperação após falha.
- `tests/pix-commercial-inspection.test.tsx`: consulta comercial **mock**
  para 7 estados e múltiplas alterações maliciosas do recurso.
- `tests/pix-emulator.integration.ts`: transações reais do Firestore
  Emulator para lease concorrente, ACK de webhook e repetição.

## Bloqueios reais para abrir vendas

1. Projeto Firebase comercial isolado de verdade, permissões e regras
   homologadas; credenciais de conta recebedora legítima para produção.
2. Implementar a transação comercial executável em backend privado, webhooks
   comerciais separados e replay/estorno persistidos **no banco comercial**.
   Os módulos atuais ainda são candidatos e não executam cobranças reais.
3. Segurança e disponibilidade do gateway de entregas remoto, mapeamento
   de kits/VIPs no Core, idempotência por recibo e validação no BDS clonado.
4. Revisão de chargeback/reembolso após concessão, manutenção, recuperação,
   monitoramento, backup e plano de rollback.
5. Homologação de ponta a ponta com conta e banco autorizados antes de
   qualquer liberação de Production. Não incluir segredo em commits ou prints.

Fontes oficiais:
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/order-status

**Status:** código de segurança e laboratório preparado, comércio real OFF.

## Reforço de regressão (2 de novembro de 2026)

- A verificação **histórica** da Payments API não transforma mais pagamentos
  cancelados/rejeitados/pendentes em aprovados só porque houve crédito anterior.
  Reversões bloqueiam jobs de teste e exigem revisão; a identidade do recebedor
  de teste também é novamente conferida.
- Uma aprovação posterior não reabre automaticamente jobs já bloqueados por
  estorno, expiração ou cancelamento. O checkout comercial segue indisponível.
- A exceção de assinatura com maiúsculas do simulador de Preview passou a
  exigir cabeçalho HMAC canônico, rejeitando campos ts/v1 duplicados.
- Novos testes de regressão cobrem esses cenários; produção e entregas reais
  permanecem desativadas.
