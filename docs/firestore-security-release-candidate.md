# NetCraftBR — regras candidatas para ativação comercial (NÃO APLICADAS)

Esta alteração adiciona **firestore.proposed-admin-only.rules** apenas como referência de revisão.
O arquivo ativo `firestore.rules` e todas as regras publicadas no Firebase
continuam inalterados. O projeto atual usa o mesmo banco em Preview e Production.

## O que a candidata prepara

- Bloqueia todas as escritas pelo SDK Firebase do navegador, inclusive as coleções
  editoriais (`events`, `news`, `settings`, `stats`, `community`, `socialLinks`,
  `homeConfig`, `pagesConfig`, `menuItems`, `appearanceConfig`,
  `faqItems`, `system` e `test`).
- Mantém apenas leituras editoriais que já eram públicas; pagamentos, cupons,
  ordens, perfis e dados de teste permanecem privados.
- A API administrativa autenticada usa Firebase Admin SDK e deve ser o único
  caminho de edição. O Admin SDK não depende das regras de cliente.

## Bloqueios antes de publicar

1. Inspecionar os consumidores do SDK cliente na versão atual de Production.
   Migrar cada gravação legítima restante para uma rota autenticada do servidor,
   especialmente conteúdo editorial e configurações.
2. Homologar cada operação do painel e do site em projeto Firebase isolado,
   com testes reais do emulador para todas as regras candidatas.
3. Preparar backup/versionamento do ruleset, plano de reversão e janela de manutenção.
4. Obter autorização explícita para a mudança no projeto Firebase. Este commit
   não a concede nem executa deploy.
5. Validar separadamente Pix, autenticação, webhook, identificação do jogador,
   assinatura do serviço Delivery, BDS clonado, recibos de idempotência,
   reembolso após concessão e monitoração; não ativar vendas só por passar regras.

A existência deste arquivo **não** significa que a infraestrutura comercial
esteja pronta. A Preview permanece com pagamentos reais e entregas reais OFF.
