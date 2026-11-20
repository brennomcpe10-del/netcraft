# NetCraftBR — ponte VIP comercial (CANDIDATA, OFF)

Esta pasta contém bibliotecas JavaScript puras, incluindo:
- `vip_commercial_session_pump.js`: ponte candidata de entrega, inativa sem integração explícita.
- `commercial_lab_preflight.js`: auditoria local de interfaces, somente leitura.

A auditoria foi incorporada ao **NetCraftCore v2.3.76 LAB_OFF** para um teste
controlado no LOBBY. Ela não se conecta à loja nem ativa pagamentos ou entregas
comerciais; o arquivo isolado desta pasta não é um `.mcaddon`.
O pump comercial permanece desativado no LOBBY e no Survival.

## Contrato de integração futura

- Core `/resgatar CODIGO` invoca `linkPlayer(player, code)` com o objeto de
  jogador da Script API, nunca um nick informado por navegador.
- Transporte HTTPS com `@minecraft/server-net`, `SecretString` e desafio
  de nonce de uso único: referência
  `minecraft/delivery-core-v2330-clone/overlay/scripts/delivery/nick_bds_transport_challenge.js`.
- A ponte exige um `getStatus()` **confiável e independente** com os sete
  flags de lançamento comercial; `LAB_OFF` não satisfaz nenhum desses flags.
- `executor.execute(job)` deve usar a API de entrega própria do Core,
  não o mecanismo fictício `vip_clone_auto.js`. Ele precisa escrever
  recibo persistente `started` antes de modificar VIP e `applied` depois.
- `receiptStatus(id)` recupera esses recibos do mundo após reiniciar. Estado
  `started`, desconhecido ou confirmação ambígua **nunca** autoriza nova entrega.
- `verifyLinkedPlayer(player,job)` verifica identidade e sessão ativa também
  dentro do Core. O backend revalida Pix, sessão, catálogo e autorização.
- Em perda de ACK, a ponte apenas reenvia o ACK, não o VIP.
- Instalação exige os fontes do NetCraftCore atual (BP/RP) e testes em uma
  cópia isolada do mundo LOBBY antes de qualquer liberação comercial.

## Segurança

Não colocar tokens, dados de Firebase ou chaves Mercado Pago no código do
addon, GitHub ou arquivos de configuração públicos. Usar `secrets.json`
no BDS, conforme permissões oficiais, sem valores reais neste repositório.

Os endpoints comerciais da loja permanecem bloqueados até revisão e
homologação independente. **Este artefato não autoriza cobranças nem entregas.**

## Teste da v2.3.76 no LOBBY

Após instalar BP/RP v2.3.76 apenas no LOBBY e confirmar os manifests, um jogador
com a tag `admin` pode executar:

```mcfunction
/scriptevent ncbr:commercial_check_v1
```

O comando mostra apenas `OK` ou `PENDENTE` para o bloqueio LAB_OFF, interfaces
de vinculação, recibos persistentes e ranks VIP Explorer/Elite/Supreme. Não
lê credenciais, não contata a Vercel e não prova homologação de produção.
