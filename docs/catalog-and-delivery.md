# Catálogo e recompensas — estado desta etapa

A interface permite editar os dados comerciais, imagem, categoria, disponibilidade e `rewardDraft` de produtos pelo painel existente. Kits e pacotes têm várias linhas de identificador e quantidade. VIPs mantêm seu cadastro específico. Não foram criados produtos fictícios nem alterados os dados existentes.

`rewardDraft` é somente configuração editorial, sem autorização de entrega. A API administrativa verifica formato, identificadores, limites e campos permitidos; não executa comandos. Sugestões em `src/data/core-item-identifiers.json` foram extraídas dos JSONs de itens do behavior pack do Bloco 2 v2.0.30 anexado. Outros addons não foram fornecidos. Um identificador presente no arquivo não comprova disponibilidade no servidor; há inclusive arquivos do namespace legado originspe, cuja oferta não foi ativada nem recomendada automaticamente.

## Antes de pagamentos e entrega

O painel de produtos agora usa a API administrativa e só confirma sucesso após persistência. Entretanto, as regras atuais de Firestore ainda permitem escrita ampla em produtos/pedidos, e outros fluxos administrativos legados mantêm gravações diretas. Não é seguro usar esses documentos públicos como fonte autorizada de recompensas ou status pagos. A integração futura deverá proteger essas gravações, usar autenticação administrativa verificável e manter versões aprovadas das recompensas somente no backend. Esta etapa não muda regras de produção nem introduz executor.

O backend deverá calcular valores e selecionar a recompensa por produto autorizado. Checkout nunca enviará comandos, itens ou quantidades como autoridade de entrega. Cada pagamento verificado gerará uma chave única de entrega e um snapshot aprovado. Tentativas, falhas, confirmações e reprocessamento deverão preservar essa chave. Jogadores offline ou sem espaço permanecerão pendentes; não tratar envio ou timeout como confirmação. Testes Bedrock deverão demonstrar recuperação após falha entre inserir item e confirmar recebimento antes de prometer ausência de duplicações.

Logs administrativos de entrega e botão de reprocessamento ficam para a integração real, sem botões simulados nesta interface. VIPs precisam reutilizar a expiração existente, calculada a partir da aprovação do pagamento.

## Verificação

Testes de catálogo, filtros, preservação de preços, recompensas e renderização do editor rodam sem Firebase e sem gravação de dados. Validação visual em dispositivos, autenticação administrativa real, persistência em Firebase isolado, pagamentos e entrega Bedrock não foram executados nesta etapa.

## Autenticação administrativa

Removida a senha padrão embutida e o aceite da senha como bearer token. Configure `ADMIN_KEYWORD` no ambiente do backend antes de testar o painel. Sem essa variável, o login administrativo retorna 503 e tokens são rejeitados. Não foi alterada nenhuma variável no Vercel. As regras amplas do Firestore continuam sendo um bloqueador separado para a integração de entrega.
