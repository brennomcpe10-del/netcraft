# NetCraft Delivery — itens 15 a 19 (candidata comercial, DESLIGADA)

**Data:** 2026-11-02. **Branch:** \`redesign-mobile-solaris\` exclusivamente. Nenhum deploy de Production, MagnoHost, Worker público, webhook comercial, credencial real ou entrega real foi realizado.

## 15. Pedido Pix autenticado → outbox persistente

- Serviço: \`server/delivery/commercialStagingService.ts\`. O método \`reconcileAndQueue(orderId)\` lê \`pixCommercialOrders\` do banco do laboratório e usa \`inspectCommercialOrder\` para buscar a ordem novamente no provedor injetado.
- Exige identificação do recebedor, status \`processed/accredited\` na order **e** transação, valor integral, referência externa/BRL/Pix corretos e \`catalogValidated:true\` no snapshot interno.
- Somente uma aprovação verificada gera as entradas transacionais \`pixCommercialDeliveries/{orderId}-{lineIndex}\`. Cada payload é validado/compilado antes de qualquer gravação, tem impressão digital SHA-256 e \`dispatchEnabled:false\`.
- Repetições, concorrência e mudanças de um payload já persistido não criam novos jobs nem alteram a entrega. Reembolso/revogação bloqueia jobs; reembolso após ACK marca \`refunded_after_ack\` para revisão. Não há envio automático.

## 16. Arquitetura candidata isolada

- O serviço tem métodos para reconciliação, fila, ofertas, ACK, NACK e requisição assinada, mas não possui rota pública, worker agendado, ponte comercial BDS, nem opção de ativá-lo por variável.
- \`labOnly()\` exige \`NODE_ENV=test\`, \`FIRESTORE_EMULATOR_HOST=127.0.0.1:8085\`, e proíbe \`VERCEL_ENV\`, token Mercado Pago e credenciais Firebase reais.
- A rota comercial do site continua respondendo HTTP 503; \`commercialBoundary.ts\` continua bloqueando lançamentos e pagamentos reais.
- Os nomes \`pixCommercialOrders\`, \`pixCommercialDeliveries\` e \`pixCommercialDeliveryNonces\` são apenas namespaces de **simulação no Firestore Emulator** neste estágio. Não são coleções criadas em Production.

## 17. Autenticação privada BDS ↔ Delivery

- \`server/delivery/bdsSignedRequest.ts\`: HMAC SHA-256 com chave de pelo menos 32 bytes, \`keyId\` versionado, corpo SHA-256, ação, timestamp e nonce de uso único, mais comparação em tempo constante.
- A identificação \`netcraft-delivery-v1\` e a ordem exata dos campos impedem confusão entre protocolos. Timestamp máximo ±60 segundos; \`pixCommercialDeliveryNonces\` registra o nonce em transação e impede replays inclusive entre reinícios de workers.
- \`minecraft/delivery-simulation/commercialCandidateSigner.js\`: função **pura e inativa** compatível com o JavaScript do Bedrock. Não contém credenciais nem código de rede. Exige secret fornecido pelo ambiente do servidor e nonce seguro/challenge fornecido pelo adapter futuro.
- O serviço exige um indicador interno de transporte HTTPS verificado (não confiado a cabeçalhos do cliente). **A verificação real de TLS, origem, autorização do servidor e rotação de segredos ainda dependem do futuro gateway privado**, que não está exposto/implantado.

## 18. Reserva transacional, ACK e NACK

- \`offer\` relê o pagamento do provedor, confere snapshot/linha, cria uma única reserva \`leased\` com token aleatório e incrementa tentativas atomizadas. Sem confirmação de pagamento, não reserva.
- \`acknowledge\` exige token correto e recibo \`applied\` ou \`already_applied\`; verifica novamente o provedor antes do ACK. ACK repetido é idempotente. Reserva ofertada mas ambígua **não** volta automaticamente à fila.
- \`nack\` aceita nova tentativa somente quando o Core atesta \`receipt:"none"\` e o motivo é um erro pré-entrega permitido. A fila passa a \`queued\` com espera de 5 segundos e limite de 20 ofertas. Outro tipo de falha entra em \`review_required\`.
- A reserva tem estado persistente em Firestore; reinício da aplicação não produz reentrega cega. A resolução de um token em estado incerto continua manual.

## 19. Jogador offline e falhas de inventário

- Jogador offline: sem reserva; pedido permanece aguardando.
- Inventário cheio ou indisponível **antes de criar recibo**: NACK seguro, nova tentativa no mesmo ID após backoff; nenhuma recompensa extra.
- Falha parcial, exceção após o recibo, item inválido ou status desconhecido: revisão obrigatória, sem retry automático.
- Falha após ACK ou reembolso tardio: registro de revisão; o sistema nunca afirma que conseguiu desfazer automaticamente um item/VIP já aplicado.

## Testes CI

- \`tests/delivery-commercial-staging.test.tsx\`: pagamento aprovado/pendente, identidade do recebedor, impressão digital, assinatura HMAC Bedrock/Node, nonce repetido/expirado, offline, concorrência de ofertas (memória serializada), ACK duplicado, NACK seguro, NACK ambíguo, estorno e bloqueio de ambiente.
- \`tests/pix-emulator.integration.ts\`: exercício adicional com transações Firestore **reais do emulador** envolvendo confirmação mock do provedor, uma fila, uma reserva, ACK idempotente, reembolso após ACK. Nunca executa Minecraft nem consulta contas reais.

## Faltas reais para habilitar vendas/entregas

1. Criar backend privado comercial e projeto/banco isolado, com credenciais aprovadas, autenticação TLS efetiva, verificação de host e monitoramento.
2. Homologar catálogo real, mapeamentos de kits/VIPs, política de reembolso e taxas de retry por produto. O mapeamento \`pix-vip\` nesta suíte é **apenas um fixture**.
3. Implementar/homologar o adaptador do BDS de produção consumindo somente mensagens permitidas, fazendo write-ahead receipt durável **antes de aplicar qualquer item**, com recuperação manual pós-falha e checagem de inventário.
4. E2E com **servidor Bedrock clonado** e transações Pix autorizadas, testes de reinício, jogadores offline e inventário cheio, observabilidade, rotação de credenciais e rollback.
5. Aprovação explícita de segurança e liberação antes de criar qualquer rota comercial executável. Um flag de ambiente por si só nunca libera o sistema.

**Status:** contrato e laboratório preparados; ativação comercial e entrega automática reais **OFF**.
