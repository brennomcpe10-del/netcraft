# NetCraft Delivery — procedimento de implantação, backup e rollback (ITEM 36)

**NetCraftCore:** o pacote Bedrock do laboratório não substitui o Core oficial, e a integridade dos seus BP/RP precisa ser confirmada antes de qualquer release.

**Estado: preparação documental / somente laboratório. NÃO EXECUTAR implantação, alteração de Production ou de MagnoHost nesta etapa.** Branch de desenvolvimento: `redesign-mobile-solaris`. O CI apenas testa e arquiva manifestos, não faz backup da produção nem publica serviços. A operação abaixo é um roteiro para uma futura janela de release expressamente aprovada.

## 0. Autorizações, responsáveis e limites

- Responsável técnico e responsável por pagamentos devem aprovar, por escrito, o commit SHA, a versão do Core (BP **e** RP), o ID dos projetos Firebase de staging e produção, a conta Cloudflare, o ambiente Vercel e uma janela de manutenção com plano de comunicação.
- Exigir resultados **verdes de todos os jobs** dos workflows de segurança, compilação/regressão, regras Firestore, emuladores, navegador e BDS clone real; `success` de um subconjunto nunca autoriza lançamento.
- Exigir inventário de produtos reais → recompensa aprovada → entidade Xbox/Microsoft vinculada. Não inferir jogador do gamertag digitado no checkout. Validar upgrade/renovação/reembolso VIP e os casos de entrega incerta sem reprocessar.
- Inspecionar as regras e consumidores da versão em produção. Firebase Preview ainda compartilha parte dos dados com Production; nunca ativar a regra candidata no projeto compartilhado até migrar as escritas.
- Manter `dispatchEnabled:false`, Worker e BDS comercial OFF até depois de autenticação, homologaçao, backup e autorização. Sem envio de segredos a CI ou logs. Se qualquer pré-requisito falhar: **abortar**.

## 1. Preparação de staging isolado (SEM produção)

1. Criar projeto Firebase **novo e distinto** para staging, com serviço de conta e permissões mínimos; guardar as credenciais exclusivamente no cofre do provedor/host e nunca no GitHub ou em arquivos versionados. Registrar projeto, database ID e responsáveis.
2. Implantar **somente nesse projeto novo**, após revisão, `firestore.delivery-isolated.rules`. O CI valida as mesmas regras em emulador; nunca executar `firebase deploy` no projeto Production por consequência de um push.
3. Confirmar que o Worker `wrangler.delivery-private-candidate.toml` continua sem routes, sem worker.dev e com `NC_DELIVERY_DEPLOYMENT_LOCK=OFF`. Não configurar DNS, namespace real, segredo nem cron de entrega.
4. Para um teste em clone BDS, validar scripts, versão do servidor, importação BP/RP, storage dinâmico, testes de itens, VIP, offline, erro parcial, reconexão e reembolso. Retirar as credenciais de teste depois.

## 2. Backup obrigatório e verificação antes de qualquer mudança real

**A rotina abaixo é uma lista operacional, não um backup realizado nesta rodada.** O operador autorizado deve salvar um inventário assinado (referências, IDs e hashes SHA-256) em armazenamento criptografado fora de produção e verificar restauração amostral em ambiente separado.

- **GitHub/Vercel:** registrar SHA da `main` e da branch de release, ID da implantação Production atual, aliases/dominios e variáveis de ambiente **por nome**, sem exportar valores para logs. Guardar artefato previamente implantado ou ID imutável para `vercel rollback`.
- **Firestore:** identificar todos os bancos/datasets em uso, exigir exportação consistente para bucket de backup com retenção, permissão mínima e projeto alvo explicitamente conferido; por exemplo, `gcloud firestore export gs://BUCKET-PRIVADO/EXPORT-IDENTIFICADO --project=PROJETO-CONFERIDO --database=DATABASE-CONFERIDO` **somente após aprovação**. Capturar o ruleset e índices publicados com seus identificadores de versão. Validar o manifesto do export e testar importação em **projeto descartável**; não confiar apenas no status "exportado". Seguir documentação do provedor para a sintaxe e permissões da versão CLI instalada.
- **Cloudflare:** registrar ID e versão da implantação Worker, rotas, bindings, Durable Objects, migrações SQLite, armazenamento persistente, regras DNS e configurações de proteção. Um rollback de Worker **não desfaz** migrações de schema ou alterações em Durable Objects.
- **Minecraft/MagnoHost:** parar gravações ou usar mecanismo de snapshot consistente, obter backup do mundo completo, pastas `behavior_packs` e `resource_packs`, `world_behavior_packs.json`, `world_resource_packs.json`, propriedades de mundo, configurações, permissões e dependências; registrar hash e versões dos manifests BP/RP. Preservar integrações externas do Discord (banimentos) e TikTok (eventos) sem copiar segredos para o relatório.
- **Pedidos/entregas:** exportar de forma controlada o estado de pedidos, jobs, ACKs, leases, alertas e recibos (incluindo intervalos de tempo/IDs) com proteção de dados pessoais. Não apagar nem restaurar leases ou recibos isoladamente. Backups de Firestore e Minecraft precisam representar um ponto de recuperação **coerente** para não repetir recompensas.

Inventário mínimo para o registro de aprovação: SHA commit; ID/hash do arquivo Bedrock; versões e UUIDs dos manifests; ID/hash do export Firestore; ID do ruleset; ID da implantação Vercel/Cloudflare; localização do backup BDS; responsável que validou a restauração; timestamp UTC; autorização formal. Nunca incluir tokens, CPF, payloads de cobrança ou URL com autenticação.

## 3. Sequência futura de release controlado (NÃO EXECUTAR AGORA)

1. Colocar compras, pagamentos e concessões em pausa antes de congelar o backup. Verificar jobs em estados `leased`, `awaiting_receipt` e `review_required`. Se existir confirmação incerta, exigir reconciliação manual.
2. Executar os backups de todos os sistemas, conferir integridade e testar restauração num clone.
3. Aplicar mudanças de regras **apenas ao projeto Firebase alvo conferido**; verificar acesso por cliente, API Admin autenticada e isolamento.
4. Preparar Worker privado e autenticação mútua/segredos injetados em runtime, sem ativar despacho. Confirmar `health` privado e execução monitorada.
5. Implantar BP/RP compatíveis em cópia de BDS, verificar inicialização, tags de VIP, vinculação de identidade, comportamento de inventário e persistência de recibos.
6. Preparar uma implantação Vercel Production imutável e validada antes de promover domínio. Se usar `vercel promote`, só promover uma implantação **de produção** já testada (não Preview). Revisar variáveis sem imprimi-las.
7. Executar canário com teste supervisionado e isolado, sem Pix real e sem recompensas comerciais, e comparar totais de pedido, job, comprovante e estoque. Habilitar tráfego real somente depois de autorização explícita separada.
8. Monitorar o período de implantação e resposta a incidentes: erros de checkout, autenticação BDS, pagamentos aprovados, reembolsos, backlog, avisos `manual_review` e duplicações. Falha → pausar concessões, nunca repetir jobs incertos.

## 4. Rollback: seguro, consistente e auditável

**Gatilhos:** erro de autenticação ou preço, qualquer indício de concessão duplicada, pedido sem comprovante, divergência Firestore/Core, falha de webhook ou incapacidade de consultar o provedor, exposição de segredo ou mudança não autorizada de dados.

1. **Parar primeiro:** bloquear compras e a ponte comercial; manter `dispatchEnabled:false`. Impedir novas ofertas, mas preservar a fila, os dados já pagos e os recibos.
2. **Classificar estado de pagamentos:** consultar a Orders API usando credenciais do servidor; listar pagamentos aprovados, expirados, cancelados, estornados e em disputa; manter revisão manual para qualquer concessão incerta. **Não reenviar recompensas** só porque ocorreu timeout ou reversão da versão.
3. **Aplicação/Vercel:** com ID imutável identificado, voltar ao último deployment Production aprovado (`vercel rollback <ID-VALIDADO>` após conferir projeto e conta). Esse comando exige permissão do operador autorizado. Uma reversão de alias não reverte banco/Worker. Confirmar roteamento e possíveis efeitos de auto-promotion.
4. **Cloudflare:** voltar à versão anterior validada do Worker e restaurar configurações de rota/bindings se houve alteração. Para Durable Objects/SQLite, **não** restaurar dados históricos automaticamente; planejar migração compensatória e teste de consistência.
5. **Firebase:** restaurar o ruleset anterior pelo ID salvo, sob projeto alvo conferido. Se houve escrita corrupta, aprovar restauração granular após comparar export e eventos novos; importação Firestore não deve sobrescrever pedidos/recibos mais recentes sem reconciliação formal. Não importar backup de staging em Production.
6. **Minecraft:** restaurar BP/RP **do mesmo par/versionamento** e, só quando necessário, mundo do backup coerente. Nunca restaurar o mundo isoladamente enquanto dados de delivery pós-backup continuam habilitados. Suspender concessão até conciliar jobs e recibos dos dois lados.
7. **Verificação pós-rollback:** confirmar site, políticas Firestore, Worker desligado, integridade da cópia, IDs de pedidos preservados, alertas, webhook, integração Discord e integração TikTok. Anotar incidente e comparar hashes antes/depois.

**Critério de encerramento:** quem aprovou confirma ausência de novas concessões comerciais, dados recuperados sem duplicação, trilha auditável e plano para os pagamentos já realizados. Nenhuma linha acima foi executada na infraestrutura pública.

## 5. Evidências

- `node scripts/check-delivery-release-gates.mjs`: gera somente inventário **local do código** com hashes em `dist/release-gates/release-readiness.json`, não backup da infraestrutura.
- `node scripts/build-delivery-homologation-ci-report.mjs`: gera relatório de checks **da própria execução**; não equivale a uma aprovação de release.
- `.github/workflows/delivery-release-candidate.yml`: CI somente leitura; nenhum deploy ou rollback automático.
- `docs/netcraft-delivery-homologation-final-37.md`: evidências CI verificadas e bloqueios restantes.

## 6. Verificação de publicação comercial (2026-11-05 — OFF)

Em 2026-11-05 a rota comercial foi verificada na Preview protegida da Vercel. Evidências de resposta HTTP: `GET /api/health` = **200**, `GET /api/pix/commercial/config` = **503** (`release_blocked`), `GET /api/delivery/bds/poll` = **503** (`delivery_release_off`). O probe read-only `GET /api/pix/commercial/health` responde **200**, com `status: code_deployed_only` e `paymentOrDeliveryAuthorization: false`. Esse 200 NÃO habilita uma cobrança.

**O domínio público `netcraft-ten.vercel.app` continua na branch `main` e NÃO contém a API comercial.** A branch `redesign-mobile-solaris` tem centenas de commits de diferença em relação a `main`: não promovê-la integralmente a Production só para liberar uma rota. O último deploy Production não foi alterado.

Preflight operacional antes de qualquer mudança de tráfego:

1. Garantir que `FIREBASE_SERVICE_ACCOUNT_JSON` da loja antiga esteja disponível de modo seguro em **Production**, mantendo `FIREBASE_SERVICE_ACCOUNT_JSON` da Preview com seu escopo atual. Não confundir com `NCBR_COMMERCIAL_FIREBASE_SERVICE_ACCOUNT_JSON`, já presente em Production e destinada EXCLUSIVAMENTE ao Firebase comercial isolado. Em 2026-11-05 a primeira variável existia apenas na Preview associada à branch; não é possível adicionar Production ao escopo mantendo esse filtro de branch.
2. Planejar uma publicação específica da API ou revisar integralmente o corte da branch, com testes de regressão da loja/painel e rollback. Não alterar `main`, domínio principal ou Production automaticamente sem esse corte.
3. Confirmar o mapeamento autoritativo de produtos, preços, kits e VIPs, as credenciais privadas BDS, a assinatura HMAC, a conexão do addon Bedrock em servidor de testes, retenção de recibos/ACK e política de recuperação. As flags `NETCRAFT_DELIVERY_RELEASE_APPROVED` e `NCBR_COMMERCIAL_CHECKOUT_APPROVED` permanecem ausentes.
4. Somente após uma API comercial de produção validada: cadastrar URL HTTPS em Mercado Pago Developers, evento **Order (Mercado Pago)** e clicar **Salvar** para gerar a assinatura secreta. Guardar a assinatura em `NCBR_COMMERCIAL_MP_WEBHOOK_SECRET` **Production / Sensitive**, sem enviar segredo ao chat.
5. Simular a notificação assinada sem conceder recompensas, verificar idempotência e observabilidade. Habilitar vendas/entregas exige revisão separada e responsável por pagamentos.

**Estado do release:** branch e Preview testadas, Prod inalterada, pagamentos comerciais OFF, entrega Minecraft OFF. Os códigos de resposta acima não comprovam um E2E real nem substituem autorização para processar pagamentos.
