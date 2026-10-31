# NetCraft Delivery v0.2.0 — gate de teste BDS clonado (OFF)

## Evidência automatizada
- Branch exclusiva: `redesign-mobile-solaris`.
- CI GitHub Actions `41217869923`, commit `7dc4a41eec82dbf3550a00577f2f22961313d21e`: concluído com sucesso.
- TypeScript, testes automatizados, build da loja, emulador Pix/Firestore e inspeção do .mcpack OFF aprovados.
- Esses resultados **não** validam `SecretString` → `HttpHeader` em BDS real e não autorizam instalação no servidor principal.

## Etapa seguinte — somente clone offline e com autorização separada
1. Preparar instância **separada** de Bedrock Dedicated Server 1.26.61.1, mundo descartável, rede e arquivos isolados. Fazer backup *do clone* antes de configurar o pack. Não copiar mundo, credenciais, pastas de configuração ou segredos da produção.
2. Verificar a origem do pacote `dist/bds-off/NetCraft_Delivery_Homologacao_OFF_v0.2.0.mcpack`, produzido pelo workflow em ambiente isolado. A inspeção no CI confere apenas os quatro arquivos explicitamente permitidos.
3. Confirmar que `manifest.json` usa module UUID `99ac2e49-b003-46fc-8473-55700984acc7` e entrypoint `scripts/main.js`; **não** conceder permissões globais. O entrypoint deve apenas registrar `modo OFF`.
4. **Gate A — carregamento inerte:** o clone inicia sem tentativas de rede, sem leitura de segredos, sem teleporte/comandos, sem mensagens privadas a jogadores e sem itens/VIPs concedidos. Se não iniciar ou solicitar API indisponível, registrar somente erro sanitizado e interromper.
5. **Gate B — compatibilidade de API (build de teste separado, autorização separada):** inspecionar disponibilidade de `@minecraft/server-admin`, `@minecraft/server-net` e suporte a `SecretString` no `HttpHeader`. Usar segredo exclusivamente sintético no armazenamento seguro do clone, nunca nos scripts, arquivos Git, logs ou chat. A mera construção do header **não** comprova autenticação via HTTPS. A versão OFF atual não chama o probe.
6. **Gate C — somente depois de aprovar A/B e revisar origem HTTPS totalmente isolada:** realizar teste com payload vazio, desafio único, expiração/replay, token incorreto, jogador offline e `ACK` bloqueado. Manter pagamentos, entrega de itens/VIP, produção e Worker público desabilitados.

## Bloqueios (não prosseguir se algum ocorrer)
- Falta de BDS clone e ambiente autorizados, API `SecretString`/header indisponível, autorização de módulo ampla, impossibilidade de verificar a ausência de saída de rede ou origem HTTPS não isolada.
- Qualquer tentativa de apontar para MagnoHost principal, Cloudflare público, cobranças reais, banco de dados de clientes, ações em jogador real ou credenciais de produção.
- Nonce inseguro (`Math.random` ou valor fixo), timestamp não confiável, ACK habilitado ou qualquer resposta contendo entregas.

## Registro mínimo de evidências
Salvar apenas: versão BDS, versão das APIs, hash SHA-256 do .mcpack, UUID do módulo, resultado PASS/FAIL de cada gate e erro sanitizado. Nunca salvar token, cabeçalho, payload autenticado, nome/ID de jogador ou dados de pagamento.

## Retorno seguro
Em qualquer falha, interromper **somente o clone**, remover o pack de teste e suas permissões específicas, descartar segredo sintético do clone e restaurar snapshot do clone. Nenhuma ação é necessária no servidor principal porque não foi alterado.

## Estado
Preparação documental aprovada para futura execução manual isolada; gates A/B/C **não executados neste documento**. Sem deploy, sem autorização para ativar entregas.
