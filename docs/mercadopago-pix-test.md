# Pix NetCraftBR — Checkout Transparente via Orders API, somente Preview

## Contrato e segurança

Novos checkouts usam exclusivamente `POST /v1/orders` e `GET /v1/orders/ORD…` no backend Express. O navegador envia IDs, quantidades, gamertag e dados do pagador; preços, disponibilidade, limites e cupom são conferidos pelo servidor no catálogo existente. Um único Pix paga todo o carrinho. Os valores da order e da transação são strings decimais com duas casas. A requisição contém `type: online`, `processing_mode: automatic` e `transactions.payments[0].payment_method: {id: pix, type: bank_transfer}`, com `expiration_time: PT45M`.

Itens são serializados com SKU (`external_code`), título, descrição, quantidade e preço. O desconto autorizado é distribuído em centavos; eventual arredondamento divide somente a apresentação de uma linha em dois preços. A soma enviada corresponde exatamente ao total líquido. Os produtos, preços originais, quantidades e recompensas internas não são modificados. Unidades integralmente descontadas permanecem no pedido interno, mas não geram itens de valor zero na requisição ao provedor. `metadata`, `notification_url`, `transaction_amount`, `payment_method_id` e a data absoluta do antigo contrato não são enviados.

As credenciais existentes continuam exclusivamente no backend de Preview. `VERCEL_ENV=production` bloqueia operações. Antes de qualquer POST, `GET /users/me` precisa confirmar a conta de teste quando o token é APP_USR. Tokens e mensagens brutas do provedor nunca são devolvidos em respostas ou logs; somente etapa, HTTP e código de erro sanitizado. Não há fallback para credenciais de produção.

A resposta é conferida contra o pedido privado: ID ORD, referência externa, `user_id` do recebedor, Brasil (BRA/MLB), BRL se explicitamente retornado, valor da order e valor da única transação Pix. O ID PAY fica vinculado à linha de pagamento e não pode ser substituído. A API não documenta `live_mode` como campo obrigatório de Orders: a proteção de teste depende da conta autenticada, não de um booleano no webhook.

## QR e respostas assíncronas

O ID da order é persistido assim que a criação autenticada é conferida. Respostas `processing`/`created` sem transação são aceitas como processamento pendente, sem repetir o POST. O GET posterior preenche a transação e o QR.

O código é extraído de `transactions.payments[0].payment_method.qr_code` e a imagem de `qr_code_base64`. O procedimento oficial de teste pode retornar base64 vazio; nesse caso a imagem PNG é gerada com qrcode a partir do texto recebido e verificado na API. Não é criado código de pagamento fictício. A ausência temporária dos dois dados mantém a interface em processamento e a consulta continua.

## Reconciliação, status e webhook

O POST nunca aprova o pedido local. Aprovação exige um GET autenticado com order e pagamento `processed/accredited`, `total_paid_amount` integral e `paid_amount` integral. `action_required/waiting_transfer` continua pendente; `processing` e `created` continuam em processamento. Cancelamento, expiração, recusa, reembolso parcial/total e chargeback possuem tratamento explícito. Divergências impedem confirmação. Respostas mais antigas não sobrescrevem versões mais novas; devoluções bloqueiam a fila preventivamente.

Configure **Order (Mercado Pago)** em Suas integrações → Webhooks para a URL Preview `/api/pix/webhook`. A documentação chama o tópico de orders, mas o payload e query usam `type=order`; ambos são aceitos. Não se usa notification_url no body. A assinatura HMAC SHA256 confere `data.id`, x-request-id e ts com `MERCADOPAGO_WEBHOOK_SECRET`. A notificação assinada é somente um sinal: o backend busca novamente `/v1/orders/ORD…` e confere o recurso contra o registro privado. Dados monetários/status enviados no corpo não confirmam nada. Sem segredo, assinatura válida ou acesso externo permitido pela proteção da Vercel, o webhook não é processado; a consulta do comprador permanece disponível.

IDs locais continuam SHA-256 da chave privada da compra. A chave do provedor é um UUID estável derivado do ID local; retries usam a mesma chave e o mesmo contrato. Mudança de comprador, nome, linhas ou cupom na mesma chave é recusada. Eventos de conciliação são auditados em subcoleção privada com ID determinístico e origem `authenticated_orders_get`.

## Dados existentes e coexistência

Nenhuma coleção histórica é apagada, recriada ou convertida. Novos registros em `pixTestOrders` têm `apiVersion: orders-v1`, `providerOrderId` e ID PAY separado. Registros antigos com pagamento numérico permanecem consultáveis por GET na Payments API e aceitam somente notificações legacy do tópico payment. Não existe novo POST na Payments API. Pedidos antigos nunca são reinterpretados como IDs ORD ou automaticamente recriados na nova API.

Reservas de cupons de teste continuam em `pixTestCouponUsage`; os contadores reais dos cupons não são consumidos. Pedidos e entregas de teste permanecem fora do faturamento histórico e das coleções públicas. Reservas não são liberadas automaticamente após falhas ambíguas: qualquer liberação exige conciliação.

## Entrega Minecraft e data de aprovação

`pixTestDeliveries` mantém um registro determinístico por linha, com quantidade, gamertag e snapshot editorial. `dispatchEnabled` permanece false. Não há conexão, comando, ativação VIP ou entrega no servidor Minecraft.

A referência pública de Orders expõe `last_updated_date`, mas não garante um timestamp imutável da aprovação. Portanto, novos pedidos registram `approvalObservedAt` quando a confirmação é vista; `approvedAt` não é inventado a partir da data da consulta, criação ou última atualização. A fila fica com `requiresApprovalTimestamp: true` quando necessário. Antes de qualquer integração real com o Core, será obrigatório reconciliar a data efetiva da aprovação. Datas históricas existentes são preservadas.

As regras legadas do catálogo e dos cupons ainda permitem gravações públicas: a migração de autorização desses gerenciadores continua sendo requisito antes de habilitar dinheiro ou entregas reais. Nenhuma regra de produção foi publicada nesta etapa.

## Testes locais e verificação oficial na Preview

- `npm run lint`, `npm test`, `npm run build`.
- Testes de contrato, transporte, proteção contra conta real, valores, cupons, status, QR vazio, respostas assíncronas, coexistência e webhook HTTP assinado com consulta autenticada (mocks).
- `tests/pix-emulator.integration.ts`: transações concorrentes, carrinho misto, reserva de cupom, outbox sem duplicação, auditoria e regras privadas, exclusivamente em demo-netcraft-admin-test no emulador local.
- `tests/pix-ui.e2e.cjs`: navegação mobile 320/360/430, QR, recuperação de falha e retomada após atualizar a página, com respostas Pix interceptadas. Isso não prova aceitação do Mercado Pago.
- `npm run test:pix:preview`: usa as credenciais já existentes **dentro da Vercel Preview**, exige recebedor test_user e realiza o procedimento oficial com `50.00`, `test_payer@example.com` e `first_name: APRO`, usando o mesmo construtor de contrato do carrinho. A linha técnica enviada em items não é cadastrada na loja e não é persistida no Firebase. Consulta em seguida a order criada e valida toda a resposta. Nenhum segredo ou dado do pagador é registrado, e não há fila de entrega para esse diagnóstico.

O comando de build da branch executa lint, testes, build e a verificação oficial. A verificação falha com código não zero se a API não fornecer uma resposta autenticada válida, impedindo um deploy rotulado como aprovado sem essa evidência. Fora da Preview ela recusa execução com código não zero, sem utilizar credenciais locais. Quando passa, um recibo sanitizado é gerado em `/pix-orders-sandbox-check.json`, contendo somente operações/status HTTP, estado observado, presença do QR e horário, sem tokens nem identificadores do comprador. A obtenção de resposta válida não é uma liquidação bancária real.

Referências oficiais consultadas:
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/migrate-payments-to-orders
- https://github.com/mercadopago/openapi (contrato de Orders)
