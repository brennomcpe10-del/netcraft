# NetCraftCore v2.2.7 — Entregas (homologação OFF)

Base fornecida: NetCraft_Core_v2.2.6_Minas_Geracao_XYZ.mcaddon.
Pacote preparado: NetCraft_Core_v2.2.7_Delivery_Executor_LAB_OFF.mcaddon.
SHA-256: c39fbf0515456211de7deda56f1aae857f7f4e01967f6c19424dc918967a7384.

## Alterações efetivas no addon

- Motor de entrega de itens vanilla no inventário, com pré-checagem de slots e sem /give.
- Recibos persistentes gravados ANTES de aplicar itens ou VIP. Replays bloqueados; estado incerto exige revisão manual.
- Integração ao VIPSystem original: ranks cadastrados, prazos e renovação, sem mexer em cargos de criadores.
- Testes locais com admin apenas em cópia do mundo; eventos de teste com itens fixos (2 lingotes de ferro) e 1 dia de VIP cadastrado.
- Resource Pack original preservado, salvo atualização da versão do manifest. Arquivos restantes de minas, menus e proteção preservados.

## Limites atuais

Este pacote NÃO chama Mercado Pago, site, Cloudflare ou APIs externas. Nenhum pagamento ou ACK é processado. Entrega automática OFF; não instalar no servidor principal.
A homologação no Bedrock real ainda é pendente; só foram executados testes JavaScript e validação de integridade ZIP.

## Contrato futuro, sem ativação

Job canônico: {contract:'netcraft.delivery.v1',id:'<orderId>-<lineIndex>',orderId:'64 hex',gamertag:'Jogador',kind:'items',items:[{itemId:'minecraft:iron_ingot',quantity:2}]}.
VIP: kind:'vip', rankTag:'ncbr:vip_<cadastrado>',days:1..3650.
A fila pixTestDeliveries atualmente tem dispatchEnabled:false, e não deve ser reutilizada como fila comercial real.

## Próxima entrega de desenvolvimento

Ligar a fila de pedidos aprovados e autenticados ao executor, em ambiente isolado BDS, com validação de pagamentos, leasing, ACK, offline, reembolsos e registro auditável. Não aceitar jobs baseados apenas no nick ou em comandos do jogador.

Não alterar main, Production, MagnoHost, credenciais reais nem dados existentes sem autorização.