# NetCraft Delivery → NetCraftCore — itens 24 a 28 (0.4.0, LAB OFF)

**Branch:** `redesign-mobile-solaris` exclusivamente. **Não substituir/addonar o NetCraftCore de produção, não implantar na MagnoHost, não ativar Pix comercial.**

## 24. Preparação da integração

- `minecraft/delivery-core-v040-clone/core_delivery_engine.js` implementa um **adaptador independente** de entrega para uma cópia BDS.
- Usa contrato `netcraft.delivery.v1` com ID determinístico `{orderId}-{lineIndex}`, recibo write-ahead em propriedade dinâmica e resposta `applied`, `already_applied`, `manual_review` ou motivo pré-entrega.
- Nada é importado automaticamente pelo entrypoint da BP. A futura ponte privada precisa de aprovação de pagamento, reserva, autenticação, autorização de Core e confirmação ACK/NACK; ainda não há um conector comercial instalado em BDS.
- **O Core original atual (BP/RP) não está versionado no repositório da loja**; não foi possível incorporar o motor às classes reais sem alterar seu código. O método `Server.VIPSystem.grantDeliveryVIPLab` aparece somente na arquitetura clone anterior, não foi validado na versão instalada do Core.

## 25. Kits da loja

- `server/delivery/verifiedRewardRegistry.ts` fornece `makeRewardRegistry` e `mappedDelivery`.
- Todo kit exige mapeamento **aprovado** entre ID real do produto da loja e itens vanilla/quantidades. O pedido nunca define sozinho a recompensa; o snapshot pago deve coincidir com o registro interno.
- Limites: até 36 itens distintos, 2.304 unidades por entrega, estoque/inventário verificado no executor. Item de addon customizado requer tratamento e homologação próprios.
- **Nenhum ID comercial real foi inventado ou ativado.** `kit` e `kit-verified` usados em testes são somente fixtures de laboratório. Os produtos ativos da loja ainda precisarão de validação e aprovação individual.

## 26. Explorer, Elite e Supreme

| Plano | Rank autorizado no executor clone | Vigência de referência |
|---|---|---|
| Explorer | `ncbr:vip_explorer` | 30 dias |
| Elite | `ncbr:vip_elite` | 30 dias |
| Supreme | `ncbr:vip_supreme` | 30 dias |

- O registro exige associação **explícita** `productId → rankTag, duration:'30 dias', days:30`. Não deduz planos por texto comercial.
- O motor confirma que o rank existe no `VIPSystem` do Core e chama `grantDeliveryVIPLab` **somente depois de escrever o recibo**. A mesma ID não estende VIP duas vezes. Uma nova ID válida do mesmo rank pode renovar pelo método de prazo do Core.
- Trocar para rank diferente (upgrade/downgrade, substituição de benefícios ou interferência com cargo especial) **não é feito automaticamente**: `vip_upgrade_review_required` até existir política homologada. Não conceder uma tag bruta sem API de VIP.
- Os testes usam implementações simuladas da API de VIP. A concessão real na MagnoHost permanece OFF.

## 27. Jogador correto

- O executor usa comparação **exata e sensível a maiúsculas/minúsculas** com o gamertag fornecido no pedido autenticado.
- Exige exatamente um jogador online correspondente e um callback de identidade `verifyLinkedPlayer(player, job)` **fornecido pelo próprio Core**. Sem comprovação confiável da conta, retorna `identity_unverified`, sem recibo nem recompensa.
- Um nome de jogador digitado no carrinho não substitui a confirmação da identidade Microsoft/Xbox. O mecanismo de vinculação persistente da conta real ao comprador permanece pendente de implantação no Core original.
- O registro de pagamento e a ponte de entrega nunca podem aceitar `rankTag`/itens declarados pelo cliente sem o registro de autorização no backend.

## 28. Pacotes e compatibilidade

- Preparação independente `minecraft/delivery-core-v040-clone`: **Behavior Pack e Resource Pack v0.4.0**, manifests formato 2, BP e RP versões `header.version=[0,4,0]` e `modules[].version=[0,4,0]`.
- UUIDs dos dois headers/módulos são exclusivos; dependência BP → RP referencia o header UUID do RP e a mesma versão. Script BP exige `@minecraft/server:1.17.0`, conforme o preflight BDS já preparado no projeto.
- `scripts/main.js` só imprime `CLONE_PACKAGE_OFF_NO_GRANTS`; o executor é biblioteca não importada. Não usa `@minecraft/server-net` ou `@minecraft/server-admin` neste pacote OFF.
- `node scripts/package-netcraft-delivery-v040.mjs` gera `dist/bds-off/NetCraft_Delivery_Core_Clone_LAB_OFF_v0.4.0.mcaddon` contendo as BP/RP empacotadas, verifica versionamento/UUID/dependências, valida a estrutura dos ZIPs e calcula SHA-256 em `netcraft-delivery-v040-integrity.json`.
- CI `.github/workflows/preview-quality.yml` publica um artefato `netcraft-delivery-core-clone-lab-off-v040` para inspeção. Isso é **um pacote inerte de laboratório**, não um upgrade da versão v2.2.x/v2.3.x do NetCraftCore original.

### Verificações adicionais obrigatórias antes da integração definitiva

1. Obter a **versão atual e completa** do NetCraftCore (BP e RP), com manifests e `VIPSystem` reais; validar suas versões antes de modificar e nunca gerar versões duplicadas.
2. Confirmar os IDs dos produtos reais da loja, seus `rewardDraft`, kits personalizados e regra de duração/renovação/upgrade dos três VIPs.
3. Homologar no BDS clonado a mesma versão do Bedrock Dedicated Server que será usada em produção; confirmar dependências Script API, vinculação de identidade Xbox, persistência de recibos e segurança da transferência.
4. Validar o cenário Pix aprovado → backend isolado → conexão autenticada → Core clone → ACK seguro, além de offline, inventário cheio, reinícios, estornos e falhas parciais.
5. Revisar segurança e autorizar explicitamente a liberação comercial antes de qualquer deploy. **Não usar flags para contornar os bloqueios de produção.**

**Estado:** fontes de integração, regras, testes e empacotamento preparados; **nenhum addon oficial do NetCraftCore foi atualizado**, nenhuma recompensa comercial real foi liberada.
