# Correção do upload estático

PNG/JPG/WebP agora usam compressImageFile (WebP com transparência, até 512 px e segunda tentativa em 320 px) e persistem uma imagem pequena no Firestore já utilizado pelas categorias. Limite do arquivo original: 10 MiB; bytes persistidos: até 170000. O backend confere tipo real, dimensões e tamanho. Não usa Storage, Firebase Admin SDK ou FIREBASE_SERVICE_ACCOUNT_JSON para enviar, salvar, ler ou restaurar imagens estáticas.

O bloqueio anterior era estrutural: services() exigia credenciais administrativas antes de qualquer leitura/gravação, e PUT lia a configuração antiga antes mesmo de considerar um novo upload ou uma restauração. Agora os caminhos estáticos e animados são separados e a configuração estática tem prioridade na leitura pública. Nenhuma variável de serviço precisa ser reconfigurada para PNG/JPG/WebP.

A configuração é salva com transação em settings/siteIdentity, com payload e assinatura HMAC calculada apenas no backend usando ADMIN_KEYWORD. A API exige uma sessão administrativa para upload/gravação, aceita apenas referência de upload assinada, ignora URLs arbitrárias enviadas pelo navegador e recusa configurações com assinatura adulterada. O cabeçalho usa apenas /api/identity, não dados crus do Firestore. Restaurar salva uma configuração padrão assinada; não ressuscita automaticamente o logo antigo do Storage.

A assinatura protege a autenticidade da configuração aceita pelo backend; não substitui regras de autorização do banco. As regras preexistentes permitem escrita pública em settings. Não foram ampliadas nem implantadas regras durante esta correção. Escritas diretas indevidas podem causar indisponibilidade e cópias de configurações antigas assinadas podem ser reapresentadas. Restringir essas escritas exige migrar a autorização atual do banco, sem quebrar o cadastro existente de categorias/produtos. Se ADMIN_KEYWORD for rotacionado, salve o logo novamente para renovar a assinatura. Não exponha esse segredo ao frontend.

GIF, SVG e vídeo permanecem no Storage e mostram mensagem específica se ele estiver indisponível; não são convertidos em imagem estática nem colocados no Firestore como arquivos. Logos anteriores no Storage continuam disponíveis como fallback somente enquanto não houver configuração nova salva. Objetos antigos no Storage não são apagados por esta correção; não há exclusões de produtos, categorias, pedidos ou arquivos existentes.

A interface mantém a prévia sem publicar antes de Salvar, conserva enquadramento e publica imediatamente o resultado confirmado pelo backend. Falha de gravação não mostra sucesso. Falha de leitura não substitui a marca já carregada por uma configuração não validada.

## Testes

- npm test: 40 passaram, um teste de integração geral é pulado sem emulador.
- npm run lint e npm run build: passaram.
- tests/logo-static.e2e.cjs, Chromium real + Firestore Emulator, projeto demo-netcraft-admin-test: PNG/JPG/WebP enviados pelo formulário, comprimidos, gravados e lidos após atualizar e em novo contexto de navegador; restauração; autenticação; adulteração de assinatura; URL arbitrária ignorada; mensagem de GIF indisponível; larguras 320/360/430 px.
- O teste propositalmente define FIREBASE_SERVICE_ACCOUNT_JSON como texto inválido, comprovando que a persistência estática não depende do Admin SDK. Não altera a variável real.

Para reproduzir o E2E: iniciar o Firestore Emulator em 127.0.0.1:8085; rodar o servidor com FIRESTORE_EMULATOR_HOST e VITE_FIRESTORE_EMULATOR_HOST nesse endereço, ADMIN_KEYWORD temporário e credenciais de serviço propositalmente inválidas. Executar o script com TEST_ADMIN_PASSWORD, TEST_CHROME_PATH e TEST_LOGO_FIXTURES apontando para fixtures logo.png, logo.jpg, logo.webp e logo.gif. O script aceita apenas o endereço local e o projeto demo.

A validação automatizada não escreve no Firebase real. A prévia remota ainda pode estar protegida pelo acesso do próprio Vercel; a confirmação de funcionamento na nuvem depende do acesso a essa prévia.
