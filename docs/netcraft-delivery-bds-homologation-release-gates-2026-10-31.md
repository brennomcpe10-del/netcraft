# NetCraft Delivery — homologacao BDS 1.26.61.1 (NAO INSTALAR AINDA)

## Estado em 2026-10-31

O GitHub Actions `41155237530` foi aprovado. A branch `redesign-mobile-solaris` contem o pacote inerte `minecraft/delivery-simulation/preflight-pack/`, com header UUID `6c521552-24ef-4339-9212-e2a349ace991` e module UUID `99ac2e49-b003-46fc-8473-55700984acc7`. O entrypoint `scripts/main.js` apenas registra uma mensagem de modo OFF. As funcoes de teste de cabeçalho não são importadas nem executadas.

O protótipo `minecraft/delivery-simulation/bedrockSecretHeaderTransport.js` permanece fora de todos os packs instalados; o novo contrato **falha fechado**: somente `{"simulation":true,"deliveries":[]}` pode ser aceito no POST /delivery/poll. Mesmo se /delivery/ack devolver HTTP 200, o resultado local e `ack_disabled` — nunca sucesso. Qualquer lista de entregas e rejeitada. Timestamp com desvio superior a 60 segundos e rejeitado antes da tentativa de rede.

## Testes que ainda faltam (nao autorizar instalacao ainda)

1. CI da branch deve aprovar `delivery-bds-https-transport-failclosed.test.tsx` e a suite inteira; se falhar, corrigir antes de qualquer preparo de BDS.
2. Validar empiricamente que o BDS 1.26.61.1 e `@minecraft/server-admin` suportam `SecretString` diretamente no construtor `HttpHeader` sem revelar texto em logs. O teste anterior HTTP 200 para example.com nao valida esse requisito.
3. Confirmar a origem HTTPS isolada, permissões por UUID de modulo, rota, certificado e ambiente de teste sem tocar no Worker Cloudflare publico. O atual Worker publicado continua `NC_SANDBOX_ENABLED=false`.
4. Resolver a origem de nonce criptograficamente seguro e a confianca no timestamp do BDS. Nonce gerado manualmente ou `Math.random` nao serve para homologacao.
5. Somente apos validacao e autorizacao explicita: backup e servidor clone de teste; token exclusivamente de teste em `secrets.json` configurado no BDS, nunca no addon/GitHub/chat; `permissions.json` apenas para UUID do pack de homologacao; switch OFF ate inspecao.
6. Confirmar no servidor clonado POST autenticado sem entregas, nonce duplicado recusado, timestamp expirado recusado, jogador offline sem efeito e ACK indisponivel. Nunca aplicar este fluxo diretamente ao ambiente de producao sem revisao separada.

## Regras inalteradas

Nada de alterações em main, Production, MagnoHost, Worker Cloudflare publico, credenciais reais ou pagamentos. O transporte nao concede VIP, kit ou item. A simulacao de ACK nao equivale a idempotencia de entrega real. Nao ha homologacao ponta-a-ponta concluida.
