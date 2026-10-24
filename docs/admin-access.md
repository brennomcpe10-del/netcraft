# Administração pelo celular

A administração usa `POST /api/admin/login` e valida a sessão em `GET /api/admin/verify`. A senha é lida exclusivamente de `ADMIN_KEYWORD` no backend. Não há senha padrão, recuperação pelo navegador nem senha com prefixo `VITE_`.

## Preparar a prévia

No projeto **netcraft**, configure uma variável **Sensitive/Secret** chamada `ADMIN_KEYWORD`, com a senha escolhida. Selecione somente **Preview** e a branch **redesign-mobile-solaris**. Refaça o deploy dessa branch depois de salvar. Não altere Production nem main.

Abra a URL da prévia seguida de `/admin`, ou use **Menu → Administração**. A proteção de acesso do próprio Vercel, quando ativada, é uma etapa distinta do login administrativo do NetCraftBR.

O formulário diferencia senha incorreta, segredo ausente, resposta inválida da API e falha de conexão. A mensagem de configuração ausente não revela a senha. A sessão assinada é salva em `sessionStorage`, validada ao recarregar e limpa ao sair. Alterar `ADMIN_KEYWORD` invalida as sessões anteriores. A revogação explícita por logout do backend continua local à instância; para invalidar tokens já copiados entre instâncias, rotacione o segredo. Uma falha temporária de conexão não apaga a sessão salva nem concede acesso.

## Primeiro produto

1. Entre em **Administração → Categorias**.
2. No cartão **KITS FARM**, toque em **Gerenciar produtos**.
3. Toque em **Novo produto**. A categoria já estará selecionada.
4. Informe nome, descrição, preço e conteúdo (uma linha por benefício/item). Envie uma imagem do celular ou cole uma URL HTTPS.
5. Escolha a ordem, a disponibilidade e o limite de unidades do carrinho.
6. Toque em **Salvar produto** e aguarde a confirmação. Em caso de falha, a edição fica aberta.
7. Volte à loja e abra **KITS FARM**. Produtos ativos aparecem pelo listener do Firestore, sem alteração de código. Produtos inativos permanecem apenas no painel.

Não é criado nenhum produto de exemplo na base real. A descrição de conteúdo não executa comandos e a configuração de recompensa permanece um rascunho, sem entrega automática.

## Categorias e exclusão

Em **Categorias**, crie/edite título, descrição, imagem, ordem e visibilidade. Imagens enviadas são comprimidas. O painel aguarda o carregamento do Firebase antes de permitir alterações. O backend valida dados e limites de tamanho, salvando somente o campo de categorias com merge para preservar outros metadados.

A exclusão exige confirmação. Excluir uma categoria preserva seus produtos e pedidos; encontre os produtos em **Loja → Todas as categorias** e escolha outra categoria. Excluir um produto usa seu identificador exato na coleção `products`, sem apagar pedidos ou produtos de nome semelhante.

## Verificação reproduzível

- `npm ci`
- `npm test` (inclui testes HTTP de autenticação e interação React; a integração externa é pulada sem emulador)
- `npm run lint`
- `npm run build`
- Inicie o emulador Firestore em `127.0.0.1:8085`, projeto `demo-netcraft-admin-test`; execute `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node --import tsx --test tests/firestore-integration.test.tsx`.
- Para navegador real: disponibilize Playwright/Chromium, execute o servidor local com `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`, `VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8085` e uma senha temporária em `ADMIN_KEYWORD`; rode `TEST_ADMIN_PASSWORD=<mesma senha temporária> FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node tests/admin-mobile.e2e.cjs`. O script aceita `TEST_CHROME_PATH` para um executável Chromium instalado.

O modo de emulador aceita somente loopback e usa um projeto `demo-*` distinto do Firebase real. Ele não é habilitado no frontend de produção e os testes não modificam `server/data/database.json`.

## Limites a considerar

As regras existentes em `firestore.rules` permitem escrita direta pública em várias coleções. A proteção da API não corrige essas regras preexistentes. Elas foram preservadas nesta alteração para não quebrar os fluxos atuais de contas, pedidos e administração que ainda escrevem pelo SDK do navegador. Antes de habilitar vendas e entregas automáticas, é necessário migrar esses fluxos para autorização adequada e restringir as regras em um ambiente separado.

A validação no emulador demonstra o fluxo de persistência, mas não comprova as permissões, o segredo ou as regras atualmente instalados no Firebase/Vercel reais. O acesso ao projeto Vercel foi negado com 403 durante esta etapa, impedindo inspecionar variáveis e testar a prévia remota autenticada.
