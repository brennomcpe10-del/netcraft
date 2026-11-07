# Loja por categorias e carrinho

## Interface implementada

A página inicial e a entrada Loja mostram categorias; os produtos só aparecem após escolher uma delas. Há botão de voltar e busca limitada à categoria. A página inicial segue: cabeçalho com entrar/carrinho → banner curto → categorias com imagens → produtos marcados em destaque (quando houver) → conexão copiável → suporte → FAQ → rodapé. Não há vitrine de todos os VIPs antes das categorias, contadores de zero produtos. O cadastro anterior permanece intacto.

Categorias são configuradas na aba Categorias do painel e persistidas em `settings/storeCategories` pela API administrativa autenticada. Podem ser criadas, editadas, ordenadas, ocultadas e removidas; remover não apaga produtos. Produtos de categorias removidas continuam preservados e devem ser reclassificados pelo painel. Produtos usam `category`; VIPs podem escolher `categoryId` e mantêm `vips` quando esse campo não existe. Sem documento configurado são usados cartões padrão, com todas as categorias ativas visíveis por padrão. O administrador pode optar por ocultar uma categoria sem produtos.

Carrinho preserva referências e quantidades em localStorage, sem preço ou recompensa como autoridade. Mantém a seleção entre páginas e recargas, agrupa linhas, limita VIP a uma unidade e respeita `allowQuantity`/`maxQuantity` de produtos. O contador soma unidades. Adicionar não interrompe a navegação. Remoção e quantidades atualizam totais.

`POST /api/cart/quote` consulta produtos reais no Firestore e verifica disponibilidade, quantidades e preços em centavos. Rejeita valores/comandos/recompensas enviados nas linhas. Sem conferência do backend não é permitido seguir para checkout. Cotação não cria pedido, não altera pagamento e não entrega nada.

## Limitação de pagamento explícita

Os links Pix/LivePix existentes têm valores fixos por produto. Nesta etapa o checkout existente funciona apenas para uma linha com uma unidade conferida. Carrinhos com múltiplas linhas/unidades ficam salvos, com o pagamento conjunto bloqueado e explicação visível. Cupons não são apresentados como descontos aplicáveis a cobranças fixas. A API recusa cupom nessa cotação.

O pedido/pagamento único com múltiplos produtos e cupons exige a integração dinâmica e testes isolados. Não foi simulado um pagamento coletivo por links individuais. O sistema futuro precisa registrar linhas de pedido com snapshots autorizados no backend e entregas independentes identificadas por pedido+linha; reprocessamentos preservam essas chaves. VIP inicia na aprovação; itens aguardam jogador/inventário disponível e confirmação real.

Regras amplas do Firestore, documentadas em catalog-and-delivery.md, continuam sendo bloqueador para automatizar autorização de pedidos/recompensas. Nada foi ativado em produção. Não foram executadas compras reais ou escritas de dados de teste no Firebase.

## Artes de categoria

Arquivos finais: `public/categories/vips.webp` e `public/categories/items.webp`. Criados com a ferramenta integrada de geração de imagens, depois otimizados em WebP de 640 px. As imagens são substituíveis no painel; categorias vazias não são exibidas.

Prompts: (1) Minecraft voxel-style scene with emerald-accented diamond-armored adventurer, diamond sword, treasure chest and emerald crystals, dark forest, emerald rim light, square composition, no text/logo/watermark; (2) Minecraft voxel-style still life of enchanted diamond sword, netherite axe and emerald enchanted book floating above treasure chest in a dark stone workshop, emerald rim light, square composition, no text/logo/watermark. Ambos solicitam leitura em tamanho pequeno e texturas de blocos pixeladas.

## Testes e limites

Testes cobrem categorias vazias/inativas, ordenação, categorias próprias, integridade comercial, armazenamento do carrinho, limites, indisponibilidade, total em centavos e rejeição de preços/comandos do cliente. Build e TypeScript são verificados separadamente. Não substituem QA visual em dispositivos, persistência autenticada em Firebase isolado ou testes de pagamento/Bedrock.

## Correção após gravação de 11:29

A imagem de produto tinha tamanho intrínseco que podia extrapolar a área de mídia e cobrir nome/preço. A mídia agora tem altura fixa, recorte e imagem posicionada dentro de limites explícitos; identidade e preço ficam em bloco próprio abaixo. A etiqueta de duração saiu da imagem e permanece apenas nos detalhes do VIP.

A loja abre categorias por padrão e não há aba de produtos misturados. Todas as categorias ativas podem aparecer mesmo vazias, conforme a nova direção; ao abrir uma vazia há uma mensagem honesta, sem produtos de exemplo. A categoria legada `outros` mantém os dados e é apresentada como ITENS AVULSOS quando ainda tem o título padrão, sem uma divisão separada de kits. Produtos podem ser reclassificados pelo administrador.

O teste de interação usa DOM simulado para clicar em KITS FARM, adicionar unidades, voltar, abrir PLANOS VIPS e manter/restaurar o carrinho. Ele verifica nomes, preços e ausência de duração na área da imagem. Não equivale a teste visual em navegador real nem comprova layout nos celulares.
