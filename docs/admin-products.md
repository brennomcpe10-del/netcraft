# Cadastro de kits e itens

1. Entre no painel administrativo. A configuração `ADMIN_KEYWORD` do backend continua necessária; não foi alterada nesta etapa.
2. Em **Categorias**, crie/edite o nome, imagem, descrição, ordem e visibilidade. Use **Gerenciar produtos** no cartão de uma categoria para abrir sua lista.
3. Em **Novo produto**, informe nome, categoria, preço, descrição, imagem por URL/envio e conteúdo (uma linha por item/benefício). A imagem tem prévia no editor.
4. Defina **Ordem na categoria** para organizar a listagem. O mesmo editor permite mover o produto para outra categoria.
5. Produtos novos começam inativos e sem nome/conteúdo fictícios. Salve como rascunho ou marque Disponível para compra quando a configuração real estiver completa. Ative/desative também pela lista, sem excluir os dados.
6. A lista permite filtrar categoria, buscar, editar e excluir com confirmação. Exclusão usa o ID exato do produto, preservando produtos homônimos e pedidos anteriores.

## Conteúdo e futura entrega

O conteúdo descritivo aparece nos detalhes da loja. A seção avançada de itens/quantidades continua sendo um rascunho para integração futura, sem executor ou promessa de entrega automática. Identificadores sugeridos vêm do addon anexado; não substituem teste no Bedrock.

Links Pix/LivePix atuais podem ser mantidos/editados. Os links existentes cobram valores fixos: antes de disponibilizar uma nova venda, configure a cobrança específica correta ou aguarde a próxima etapa de Pix dinâmico. Cupons e pagamento coletivo do carrinho permanecem indisponíveis.

## Persistência e integridade

O painel de produtos agora grava pela API administrativa. Sucesso só é apresentado depois de a operação no Firestore concluir; erros mantêm o editor aberto e não informam sucesso. Criação não sobrescreve documento com o mesmo ID; edição exige documento existente e preserva metadados antigos. Campos conhecidos, categoria, preço, ordem, limites e rascunho de recompensa são validados no backend.

A vitrine continua recebendo mudanças pelas assinaturas Firestore existentes. O carrinho conserva referências/quantidades e a cotação verifica o catálogo no backend. Produtos desativados ou quantidades inválidas não passam pela cotação. Não foram alteradas as regras, credenciais, contas ou dados em produção. As permissões amplas do Firestore continuam sendo uma pendência para a futura automação segura.

## Validação realizada

Testes locais usam repositório em memória e DOM simulado. Cobrem cadastro, ativação/desativação, edição de preço, categoria e ordem, conteúdo, vitrine acompanhando o estado salvo, falha de gravação sem falso sucesso, exclusão por ID e totais/limites do carrinho. Não houve gravação no Firebase real. Upload de imagem em navegador, login real, persistência em um Firebase de testes, layout em dispositivos e pagamentos não foram executados.
