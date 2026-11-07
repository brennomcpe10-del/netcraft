# v2.3.29 — Identidade Xbox: contrato LAB OFF e bloqueios

A v2.3.28 confirmou que a autenticação HTTPS/HMAC funciona em um **simulador Node.js local**. A v2.3.29 agrega um contrato de vínculo sintético separado da execução real do BDS.

## Resultado e escopo

- O pacote local de homologação v2.3.29 testa vínculo entre pedido, perfil sintético e identificador de jogador sintético.
- Nome digitado no checkout / gamertag, sozinho, **nunca** comprova a identidade.
- Provas sintéticas assinadas, expiradas ou reutilizadas são rejeitadas; vínculos conflitantes exigem revisão.
- Gravação do vínculo sintético é persistida no teste Node, e conferida após reinstanciar o armazenamento.
- No Core BDS, `scriptevent ncbr:lab_identity_probe_v2329 STATUS_SOMENTE_LEITURA` é exclusivamente um diagnóstico sem dados pessoais, comandos de entrega ou rede.
- `tests/delivery-v2329-identity-failclosed.test.tsx` testa que o executor só concede **ao jogador fictício** quando a função de identidade confiável autoriza e `isOfflineClone()` retorna true; o grant real não é acessível.
- O BDS 1.26.61.1 permanece isolado e com proteções degradadas; **não instalar em produção**.

## Limites / próximos requisitos

A identidade da Microsoft/Xbox **não foi verificada**; o simulador usa identificadores e uma chave de teste gerados localmente. Identificadores persistentes da Script API e gamertags não substituem um login/autenticação Xbox. Uma futura ponte autenticada deverá vincular, de maneira verificável, a identidade comprovada pela conta Microsoft/Xbox à conexão observada pelo servidor, ao pedido aprovado e ao recibo persistente, sem depender de nomes editáveis.

**Nenhum** endpoint público, token comercial, Live Pix, real grant, Cloudflare Worker de produção, MagnoHost, ou mudança em `main` foi introduzido. O fluxo continua `dispatchEnabled:false` e `networkEnabled:false`.

A homologação do lado de Windows ainda precisa confirmar a instalação da versão 2.3.29 e o diagnóstico da API; não confundir aprovação dos testes Node locais com validação BDS.
