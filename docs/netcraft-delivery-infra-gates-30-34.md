# NetCraft Delivery — gates 30–34 (2026-11-02)

Branch exclusiva: `redesign-mobile-solaris`. **Nada foi publicado no Firebase ou Cloudflare, e nenhum serviço ou alerta externo está ativo.** Produção, loja comercial, Mercado Pago real, Minecraft e MagnoHost permanecem inalterados.

## 30. Separação entre teste e produção

- `server/security/firebaseEnvironmentPlan.ts` contém uma validação estrita de **três projetos Firebase distintos**: laboratório `demo-*`, staging e produção.
- Banco de dados e IDs são registrados como metadados apenas. O arquivo `firebase.delivery-staging.example.json` é um modelo de configuração, não um projeto criado.
- `stagingReadinessFromEnv()` recusa ambiente incompleto ou um único projeto compartilhado. Não reutiliza automaticamente a configuração da Preview antiga.
- `paymentDatabase()` e o Firebase atualmente em uso pela loja não foram migrados e continuam sob restrições anteriores. A separação real ainda requer a criação dos projetos Firebase isolados, concessão de credenciais por ambiente, migração segura e homologação.

## 31. Regras Firestore

- `firestore.delivery-isolated.rules` é **somente candidata**. Toda escrita pelo SDK cliente é negada.
- Coleções comerciais `pixCommercialOrders`, `pixCommercialDeliveries`, `pixCommercialDeliveryAudit`, `pixCommercialDeliveryAlerts`, `pixCommercialDeliveryNonces` e vínculos de identidade são privadas; pedidos legados, cupons, perfis e dados de teste também.
- Conteúdo editorial e catálogo seguem legíveis em caminhos públicos conhecidos, mas suas alterações dependem da API do servidor. Subcoleções e coleções desconhecidas são negadas.
- `firestore.rules` permanece intocado. A implantação do ruleset candidato só poderá ocorrer **em projeto separado**, após migração dos consumidores de escrita do navegador e revisão formal de segurança.
- `tests/delivery-security-firestore.integration.ts` exercita leitura, criação, remoção e isolamento no Firebase Emulator com o SDK cliente sem autenticação. O CI verifica o arquivo candidato; **não executa `firebase deploy`**.

## 32. Cloudflare Worker privado

- `sandbox/cloudflare/wrangler.delivery-private-candidate.toml` não tem rotas, contas ou zonas configuradas; `workers_dev=false` e `preview_urls=false`.
- `sandbox/cloudflare/delivery-private-candidate.worker.mjs` responde somente `503`, independentemente de configuração; não processa Pix, BDS, assinaturas, pedidos ou concessões.
- Não há deploy, registro DNS, segredo, Durable Object comercial ou conexão Firebase. A implementação final do gateway ainda depende de autenticação TLS entre BDS e serviço, separação por projeto, auditoria e revisão de lançamento.

## 33. Credenciais e logs

- `node scripts/verify-delivery-secrets.mjs` detecta chaves privadas e padrões reconhecidos de tokens, literais de credenciais de servidor e vazamentos óbvios em `console.*`.
- O relatório imprime apenas **código da regra, caminho do arquivo e linha**, nunca a string encontrada.
- O scanner cobre fontes de backend, infraestrutura, addons e frontend nesta revisão; o CI o executa sem acessar credenciais reais.
- A API key pública do SDK Firebase no frontend é um identificador visível por design, não uma credencial de serviço. Credenciais privadas **nunca** devem ser commitadas no repositório; precisam de secret manager, revisão de histórico, rotação e scanning especializado antes da produção.
- Esse scanner é uma verificação inicial, **não** comprova ausência absoluta de todas as formas de vazamento, nem substitui verificação externa de logs.

## 34. Monitoramento e alertas da fila

- `server/delivery/deliveryQueueMonitor.ts` verifica fila **apenas no emulador**: lease expirado, recibo pendente, revisão manual, estorno pós-entrega, esgotamento de tentativas e atraso em fila.
- O supervisor produz registros privados `pixCommercialDeliveryAlerts` com nível, sinal, contagem e hash da referência; sem gamertag, Pix, CPF, tokens ou payload.
- Janela de deduplicação de **15 minutos**; transação Firestore impede alertas duplicados na mesma janela.
- Limite de 200 registros por estado em cada varredura e indicador explícito `limitExceeded`; não há promessa de observabilidade integral quando o limite é excedido.
- A função `scan()` é **manual e inativa** até a instalação de um agendador privado. Notificações (Discord/e-mail) e painel de atendimento dependem de canal autenticado e autorização; não estão ligadas à produção.
- Testes validam limiares, deduplicação, ausência de dados privados e bloqueio do monitor em Production.

## Validação e próximos bloqueios reais

- Unit tests: `tests/delivery-infra-30-34.test.tsx` e `tests/delivery-secret-guard.test.tsx`.
- CI: job independente **Delivery candidate Firestore client permissions (emulator only)**, somado a varredura de credenciais.
- Nenhum job do CI realiza implantação `firebase deploy`, `wrangler deploy`, muda `main`, altera credenciais reais, mexe no Worker público ou entrega recompensas comerciais.
- Para implantação definitiva ainda faltam projetos staging/prod isolados, migração de dados e rotas, revisão dos consumidores da aplicação, segredos de serviço em cofre, supervisão agendada com canal de alerta aprovado e testes E2E do BDS clone.
