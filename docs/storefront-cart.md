# Loja por categorias e carrinho

## Interface implementada

A página inicial segue: cabeçalho com entrar/carrinho → banner curto → categorias com imagens → produtos marcados em destaque (quando houver) → conexão copiável → suporte → FAQ → rodapé. Não há vitrine de todos os VIPs antes das categorias, categorias vazias nem contadores de zero produtos. O cadastro anterior permanece intacto.

Categorias são configuradas na aba Categorias do painel e persistidas em `settings/storeCategories` pela API administrativa autenticada. Podem ser criadas, editadas, ordenadas, ocultadas e removidas; remover não apaga produtos. Itens sem categoria continuam em Todos até reclassificação. Produtos usam `category`; VIPs podem escolher `categoryId` e mantêm `vips` quando esse campo não existe. Sem documento configurado são usados cartões padrão, apenas para categorias com produtos ativos.

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
