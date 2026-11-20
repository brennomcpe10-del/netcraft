# NetCraft Delivery 0.4.0 — BP/RP LAB OFF

**Não instalar na MagnoHost/servidor principal.** Este é um pacote **independente** para clone BDS; não contém nem modifica o NetCraftCore original.

- BP: script principal apenas registra `CLONE_PACKAGE_OFF_NO_GRANTS`. O arquivo `scripts/core_delivery_engine.js` é uma biblioteca não importada pelo entrypoint; ninguém recebe itens ou VIPs ao instalar.
- RP: companion de textos sem substituir texturas, menus, compassos nem recursos do NetCraftCore.
- Versões BP/RP, `header.version`, `modules[].version` e dependência BP→RP correspondem exatamente a **[0,4,0]**.
- IDs UUID são novos e exclusivos para não colidir com BP/RP originais.
- Dependência Script API: `@minecraft/server` 1.17.0; `server-net` e `server-admin` não são importados no pacote OFF.
- O executor só poderá ser importado pelo Core original em um *clone*, depois de integrar uma validação de conta/identidade do jogador, os registros reais de VIP e uma ponte autenticada de pagamento.
- O método Core usado pelo clone é `Server.VIPSystem.grantDeliveryVIPLab`. Não há garantia de existência/compatibilidade na versão atual do Core; o código falha sem ele.
- A substituição do Core principal, testes reais no BDS 1.26.61.1 e entregas de produção **não foram realizados**. A validação estática/ZIP não substitui a homologação BDS.
