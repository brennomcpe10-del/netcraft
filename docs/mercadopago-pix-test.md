# Checkout Pix Mercado Pago — somente testes

## Uso na Preview

Abra a loja → adicione produtos → Carrinho → Pix automático. Informe gamertag, e-mail e CPF do comprador de teste, cupom opcional e gere a cobrança. A resposta do Mercado Pago fornece QR Code e Copia e Cola. **Não tente pagar esses códigos em banco real.** O mesmo navegador retoma o pedido após atualizar a página; a chave privada de consulta permanece em sessionStorage e não é enviada em URLs.

O backend usa a API oficial `POST /v1/payments` com `X-Idempotency-Key`, `GET /v1/payments/:id` e `GET /users/me`. `MERCADOPAGO_ACCESS_TOKEN` precisa ser TEST-. `VERCEL_ENV=production` sempre bloqueia a integração. `MERCADOPAGO_PUBLIC_KEY` não é necessário no fluxo Pix servidor a servidor e não é exposto. Não existe chave de configuração que habilite produção nesta implementação.

A persistência utiliza o Firebase Admin SDK com o `FIREBASE_SERVICE_ACCOUNT_JSON` já existente e confere o projeto da credencial. Credencial ausente/inválida causa erro explícito, nunca fallback para pedidos em RAM ou confirmação otimista. A função de upload estático de logos continua independente do Admin SDK.

## Confirmação e notificações

Endpoint: `POST /api/pix/webhook?data.id=ID_DO_PAGAMENTO`.

A assinatura HMAC é validada com `MERCADOPAGO_WEBHOOK_SECRET`, x-request-id e x-signature, com tolerância de cinco minutos. Esse segredo é próprio do webhook, diferente do access token. Se não estiver disponível, notificações são rejeitadas; a consulta autenticada do comprador ainda reconcilia diretamente com a API. Não envie nenhum segredo pelo chat.

Quando `VERCEL_BRANCH_URL` está disponível, a criação informa essa URL de callback. Uma Preview protegida pela autenticação Vercel pode bloquear notificações externas antes que cheguem ao Express. A consulta do comprador evita depender desse callback durante a avaliação. Sem um webhook acessível e seu segredo, não há reconciliação em background quando o comprador fecha a página. Isso deve ser validado antes de produção.

O corpo recebido nunca aprova pedidos. Cada reconciliação consulta a API e compara ID, referência externa, metadata, valor em centavos, BRL, Pix, live_mode=false e recebedor associado ao token, incluindo o recebedor gravado no pedido. Aprovação exige date_approved válida. Não são armazenados CPF/e-mail do comprador; apenas hash da requisição, gamertag, itens e dados necessários de pagamento.

## Persistência e idempotência

- `pixTestOrders`: pedidos privados de teste, separados dos pedidos históricos e do faturamento real.
- `pixTestDeliveries`: uma entrada determinística por linha do pedido, com quantidade, snapshot editorial, approval timestamp e dispatchEnabled=false. Não executa comandos, não entrega itens, não inicia contador paralelo e não concede VIPs.
- As regras negam acesso cliente a ambas as coleções. Admin SDK efetua as transações. Não foram publicadas regras ou configurações Firebase de produção.
- A chave UUID da compra gera o identificador SHA-256 do pedido e a chave de idempotência do provedor. Repetir a mesma compra reaproveita a cobrança; reutilizar a chave com outro conteúdo é rejeitado. Falha ambígua deve ser repetida com a mesma chave.
- Aprovação e criação das entradas da fila ocorrem em transação. Repetições preservam approvedAt e a fila. Reembolso parcial, total ou chargeback bloqueia todas as entradas preventivamente para revisão futura. Um retorno pendente atrasado não desfaz aprovação; reembolso não é revertido.
- A validade VIP deverá usar approvedAt como origem quando o adaptador NetCraft Core existir. Os textos legados de duração e rewardDraft são editoriais, **não** recompensas autorizadas para execução. Renovação e expiração serão validadas com o addon antes de habilitar dispatch.
- Cupons são conferidos e reservados em transação (usedCount) para impedir ultrapassar maxUses. Uma reserva não é liberada automaticamente em falhas ambíguas, cancelamento ou expiração; exige conciliação antes de eventual liberação, para não permitir exceder o limite. A regra de expiração é a validade do cupom no momento da compra.
- O endpoint público antigo simulate-payment retorna 410 para todos os pedidos. As rotas administrativas antigas operam apenas na coleção orders e não conseguem alterar os novos pedidos privados. Nenhum pedido de teste é espelhado na coleção pública orders.

## Limitações que impedem ativação real

O catálogo legado e os cupons ainda possuem permissões públicas de gravação no firestore.rules existente. Embora o navegador não envie preços nem recompensas ao checkout e os novos registros financeiros sejam privados, a migração da autorização de todo o catálogo para backend é obrigatória antes de produção. Os dados históricos e as regras dessas coleções não foram alterados para não interromper os gerenciadores existentes. Credenciais reais são bloqueadas independentemente disso.

O sandbox Pix pode rejeitar operações ou manter pagamentos pendentes. Uma resposta de teste não equivale a liquidação bancária. Não há endpoint público para forçar aprovação. Erros do provedor são exibidos sem expor credenciais ou dados da requisição. Os testes de aprovação, expiração e estorno usam mocks isolados.

## Verificações executáveis

- `npm run lint`, `npm test`, `npm run build`.
- `tests/pix.test.tsx`: transporte, idempotência, cálculo, assinatura, divergências e fila.
- `tests/pix-emulator.integration.ts`: executar com node --import tsx em FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 e regras firestore.rules carregadas, projeto demo-netcraft-admin-test. Produtos ilustrativos existem **somente** no emulador local, jamais são cadastrados na loja real.
- `tests/pix-ui.e2e.cjs`: Playwright, servidor local com o emulador e os fixtures anteriores, TEST_CHROME_PATH apontando para Chromium. Usa interceptação das respostas Pix, verifica QR, retomada e mobile 320/360/430. Não deve ser apresentado como pagamento sandbox aprovado.

Referências oficiais: https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/integration-configuration/integrate-pix e https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/additional-content/your-integrations/notifications/webhooks .
