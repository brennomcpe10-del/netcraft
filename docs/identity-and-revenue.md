# Identidade Visual e faturamento

Em Administração → Identidade Visual, envie um arquivo, confira a prévia, selecione enquadramento/posição e salve. Remover/restaurar também precisa salvar; descartar mantém a configuração publicada. O nome NETCRAFTBR permanece.

Limites: imagens PNG/JPG/WebP/SVG simples até 1 MiB; GIF até 2 MiB; MP4/H.264 ou WebM/VP8/VP9 até 3 MiB e 8 segundos; máximo 2048 × 2048 px. O backend verifica assinatura, dimensões e duração. SVG usa lista restrita de elementos/atributos, sem scripts, estilos, entidades ou referências externas, e é exibido por img, nunca HTML inline.

Vídeos usam autoplay, loop, muted e playsInline; pausam fora da área visível/página oculta. Movimento reduzido e falhas de mídia usam o N estático. O arquivo original fica no Firebase Storage, em site-identity/<UUID>.<ext>. O Firestore guarda somente referência e enquadramento em siteIdentity/current. O endpoint público /api/identity lê a configuração por Admin SDK. Não é necessário liberar escrita do navegador nessa coleção.

## Configuração necessária no Preview da branch

Além de ADMIN_KEYWORD, configure a variável secreta FIREBASE_SERVICE_ACCOUNT_JSON com o JSON completo de uma conta de serviço do mesmo projeto Firebase. Alternativa para ambientes com credenciais em arquivo: GOOGLE_APPLICATION_CREDENTIALS (Application Default Credentials). Nunca use prefixo VITE_, comite o JSON ou envie credenciais pelo chat.

A conta precisa ler/gravar o banco Firestore nomeado já existente e criar/ler/excluir objetos no bucket existente. O bucket precisa estar habilitado. Restrinja IAM ao projeto/bucket necessário. As regras de Storage devem negar escrita de clientes em site-identity/**; uploads validados usam Admin SDK/IAM. Não substitua regras de outros caminhos. A coleção siteIdentity deve continuar sem escrita pública; as regras atuais negam caminhos não declarados.

Sem credenciais/permissões, o logo padrão permanece e o painel apresenta erro, sem sucesso simulado. O acesso ao projeto Vercel retornou 403 durante a implementação; credenciais e regras na nuvem não foram alteradas/verificadas.

Upload e gravação exigem sessão administrativa. A referência do upload tem assinatura HMAC e validade de 30 minutos; o navegador não define livremente URLs ou caminhos. A existência do objeto é verificada antes de publicar. A substituição/restauração salva primeiro e então remove o arquivo anterior. Uploads abandonados antes de salvar podem permanecer no bucket: manutenção deve remover somente objetos antigos sem referência ativa, nunca todo o prefixo.

## Faturamento

O dashboard exibe total, mês atual e mês/ano selecionado, calculados no backend em centavos. Atualiza com alterações nos pedidos e ao retornar à aba. Não há valores fictícios na interface.

Pago/Entregue ou confirmação explícita entram; Pendente/Cancelado não entram. Reembolsado/Estornado descontam integralmente. refundedAmount indica devolução acumulada; refunds aceita devoluções confirmadas com ID e valor, sem somar IDs repetidos. Se ambos existem, utiliza o maior valor conhecido, evitando contar o mesmo reembolso duas vezes.

Datas: approvedAt, payment.approvedAt ou paidAt, com fuso explícito (ou Timestamp). Criação/entrega nunca substituem aprovação. Períodos usam America/Sao_Paulo. Devoluções reduzem o mês da aprovação original: relatório de receita líquida por aprovação, não extrato de caixa por data do reembolso.

Deduplica IDs reais de pagamento por provedor/método e aliases do mesmo pedido. IDs internos legados TX-* eram gerados pelo site e não provam duplicidade entre pedidos diferentes. Valores ausentes, estados conflitantes e devoluções inconsistentes são excluídos com aviso de relatório parcial. Valor conhecido sem data entra no total, mas não nos meses.

O histórico usa confirmações/datas já registradas. O sistema antigo permitia confirmação manual e podia registrar paidAt na entrega; não é possível reconstruir a data real do provedor quando não foi guardada. Não houve reconciliação externa dos pagamentos antigos; o painel informa essa limitação. Novas alterações registram paidAt apenas na confirmação nova, preservam a data existente e não inventam aprovação ao entregar pedidos antigos.

## Validação

npm test; npm run lint; npm run build. Testes cobrem limites de mês em Brasília, devoluções completas/parciais, duplicatas, informações ausentes, aprovação, formatos falsos, SVG ativo, assinatura e enquadramento.

O fluxo completo foi testado no navegador com Firestore emulado em 127.0.0.1:8085 e Storage emulado em 127.0.0.1:9199, projeto demo-netcraft-admin-test: salvar/recarregar, logo público, GIF/WebM, movimento reduzido, restauração, receita em tempo real, filtro de período e telas 320/360/430/768 px. MP4 foi validado e um vídeo acima de oito segundos foi recusado. Os testes não gravaram no Firebase real. A validação local não comprova IAM/credenciais/regras instaladas na nuvem.
