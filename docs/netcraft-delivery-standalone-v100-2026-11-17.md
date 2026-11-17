# NetCraftBR Delivery Standalone v1.0.0 (2026-11-17)

## Objetivo
Após reinstalação dos arquivos do BDS MagnoHost, o sistema de resgate passa a ser um **Behavior Pack separado**, sem tocar na bússola nem nos menus do NetCraftCore. A Preview já possui a rota de laboratório e o painel de emissão de códigos temporários. O painel foi atualizado nesta branch para orientar o uso de `/resgatar`.

## Comandos e compatibilidade
- `/resgatar` abre um formulário nativo para inserir o código.
- `/resgatar NC-XXXX-XXXX-XXXX-XXXX` confirma diretamente via HTTPS.
- `/ncbr:resgatar` é a variante com namespace, e `/resgatestatus` exibe o estado da sessão.
- Não requer OP e não exige alterar o código ou resource pack do NetCraftCore. Script module UUID: `8f695fa8-7940-4dc0-b9e5-64f1543b070f`.

## Segurança e escopo entregue
- Padrão `NCBR_DELIVERY_MODE=OFF`, com pagamentos comerciais, entrega de itens e alteração de VIP **sempre OFF** neste artefato.
- Modo opcional **PREVIEW_LINK_LAB**, exclusivo para recibo sintético e URL Preview autorizada. O jogador digita um código criado no painel admin. O BDS faz HTTPS `/api/delivery/bds/challenge` seguido por `/link`, com token em `secrets.json` e nonce de uso único.
- Vincula a `player.name` e `player.id` da sessão ativa, sem aceitar identidade inventada pelo cliente. `player.id` não é identidade Xbox permanente.
- Valores de `@minecraft/server-admin` ficam em `config/<script UUID>/variables.json` e `secrets.json`; permissões de rede ficam exclusivamente em `config/<script UUID>/permissions.json`. Não mudar `config/default/` para conceder rede a todos os addons.
- O pacote não leva segredos; não escreve tags, placares, inventário, dinamyc properties ou cargo VIP.

## Validações
- Código estático e testes Node locais: normalização, manutenção OFF, identidade, servidor sem concessão, troca de sessão, timeout/concorrrência e rate limit.
- Ainda exige teste ao vivo em um BDS isolado com Script API, permissões específicas, Preview protegida e código real de laboratório.
- **Não é um executor comercial**. A integração com os VIPs e kits reais só será possível depois de examinar o .mcaddon atualmente instalado do NetCraftCore e implementar um contrato entre os dois pacotes, com idempotência e ACK durável.

## Site e implantação
Branch de homologação `redesign-mobile-solaris`; o campo do painel `Pedidos > Teste: Resgatar codigo no Minecraft` apresenta a nova instrução. As variáveis antigas de Preview podem continuar na Vercel, mas a configuração local do BDS foi apagada com a reinstalação e precisa ser refeita com os tokens apropriados. Não ativar checkout e entregas comerciais por consequência desta mudança.

## Pendências imediatas
1. Revisar o manifest e os scripts da versão atual do NetCraftCore para expor escritor de VIP/kit via contrato permitido (sem compartilhar estado JS entre packs por suposição).
2. Instalar BP separado e configurar Script API, HTTPS e SecretString no novo servidor, primeiro em OFF e depois em laboratório.
3. Testar códigos corretos/incorretos, alias, formulário, sessões/reconexões, ACK, duplicação e restart. Somente depois considerar entregas autorizadas.

A distribuição testável do pacote e as configurações de exemplo ficam no artefato gerado da conversa, sem credenciais.