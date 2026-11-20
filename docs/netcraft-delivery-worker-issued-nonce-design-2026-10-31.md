# NetCraft Delivery — desafio de nonce isolado (sem deploy)

## Estado e objetivo

O CI anterior `41211991771` foi aprovado. A documentação Microsoft confirma que `HttpHeader` aceita `SecretString`, mas **não demonstra** uma API criptográfica `getRandomValues` disponível no runtime BDS 1.26.61.1. Por isso foi adicionado, apenas à branch de testes, um endpoint alternativo `POST /delivery/challenge` no Worker do sandbox.

O endpoint só atende quando `NC_SANDBOX_ENABLED=true` no ambiente **local isolado** e quando o cabeçalho de token de teste é válido. O nonce de 16 bytes é gerado com `crypto.getRandomValues` pelo Worker. Se o gerador criptográfico não existir, o Worker falha fechado com HTTP 503. Não há fallback para `Math.random`.

O cliente BDS futuramente pediria um challenge por HTTPS com `SecretString` em `HttpHeader`, validaria o formato de 32 hexadecimais, e **imediatamente** usaria esse nonce em `POST /delivery/poll`, acompanhado de timestamp de 13 dígitos. O Durable Object existente aceita o nonce uma vez; replays recebem HTTP 401. O `poll` sempre retorna zero entregas. O `ACK` responde HTTP 409.

## Limitações obrigatórias antes de qualquer teste real

- A nova rota foi **somente commitada no repositório**; o Worker Cloudflare público não foi alterado, implantado ou habilitado.
- A rota ainda não mantém um registro de emissão nem TTL do challenge. A janela de ±60s é do **timestamp da requisição**, não expiração comprovada do challenge. Não declarar TTL de challenge ou validade criptográfica completa da emissão até incorporar armazenamento de emissão e consumo no Durable Object.
- O nonce emitido pelo Worker deve ser tratado como um valor descartável de uso único, protegido no trajeto por HTTPS. A confidencialidade do token em SecretString é requisito independente.
- `/delivery/challenge` não ativa o BDS nem autoriza itens. O BDS precisa de uma implementação revisada de duas etapas antes de usar o protocolo; o cliente atual ainda espera nonce fornecido externamente.
- A emissão de challenges autenticados não tem ainda rate limiting ou autorização de uso em produção. Não habilitar publicamente.
- Testes unitários com mocks não demonstram compatibilidade runtime BDS nem prova ponta-a-ponta MagnoHost→Cloudflare.

## Condições de liberação

CI completo, teste local `workerd` do challenge (incluindo reinício/replay), controle de emissão e abuso, revisão de segurança do endpoint, pacote BDS específico OFF por padrão, infraestrutura HTTPS exclusivamente de teste, sem credenciais reais e permissão isolada ao módulo. Somente então, com autorização expressa, usar **servidor clonado** para testes de SecretString e HttpHeader.

Nada neste trabalho altera main, pagamentos, Production, dados, credenciais, MagnoHost, addon instalado nem Worker público.
