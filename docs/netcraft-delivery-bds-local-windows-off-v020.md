# NetCraft Delivery v0.2.0 — BDS local Windows, gate A (somente OFF)

> Este é um roteiro para uma futura execução autorizada em PC local. Nenhum procedimento foi executado no BDS. Não usar MagnoHost nem `main`/Production.

## Pré-condições obrigatórias
- Confirmar status **success** do workflow que gera o artefato `netcraft-delivery-bds-off-v020`; não presumir que apareceu antes do término da execução.
- Baixar artefato pela página do GitHub Actions do commit da branch `redesign-mobile-solaris`. Extrair o ZIP do artefato, obtendo `NetCraft_Delivery_Homologacao_OFF_v0.2.0.mcpack`.
- Conferir o nome do arquivo, manifest, módulo UUID `99ac2e49-b003-46fc-8473-55700984acc7` e hash SHA-256 local. Registrar apenas hash e versões; não registrar segredos.
- Usar uma instalação BDS de teste com versão compatível com o manifesto, mundo descartável, pasta e configurações próprias, sem cópia dos dados reais. Não reutilizar porta, IP público, token, paths, secrets ou banco do servidor principal. Fazer snapshot dessa instância de teste antes de qualquer alteração.
- Bloquear acesso à Internet de saída na instância local durante o gate A. Sem contas de jogadores reais, sem pagamento e sem entregas.

## Conferência do arquivo no Windows (PowerShell)
```powershell
Get-FileHash .\NetCraft_Delivery_Homologacao_OFF_v0.2.0.mcpack -Algorithm SHA256
```
O hash calculado é para identificação do arquivo local, não prova isoladamente a origem ou a segurança. Comparar com evidências da execução e inspecionar o manifest no ZIP antes de usar.

## Verificador automático offline
Após baixar e extrair o artefato, com uma cópia do repositório na branch `redesign-mobile-solaris`, rode no PowerShell:
```powershell
powershell -NoProfile -File .\\scripts\\verify-bds-off-artifact.ps1 -PackPath "C:\\CAMINHO\\NetCraft_Delivery_Homologacao_OFF_v0.2.0.mcpack"
```
O script confere a lista exata dos arquivos ZIP, UUIDs, versões, dependências e o entrypoint em modo OFF; também imprime o SHA-256. Ele não instala o addon, não acessa rede e não comprova compatibilidade com BDS. Não execute o pacote no servidor principal.

## Gate A — somente carregamento inerte
1. Iniciar o clone sem addon, confirmar que inicia e registrar versão do BDS.
2. Desligar o clone. Importar **somente** o behavior pack OFF e habilitá-lo no mundo descartável (não no mundo real). Não inserir segredo ou ativar integração HTTP.
3. Iniciar o clone e verificar a mensagem `modo OFF; nenhuma requisicao enviada` no console.
4. Confirmar a ausência de tráfego HTTP de saída, concessões, comandos, leitura de segredo, polling, ACK ou alterações de jogadores. O simples aparecimento da mensagem não comprova ausência de tráfego; observar o ambiente isolado.
5. Registrar PASS/FAIL e versão de módulos. Diante de qualquer falha, desligar o clone, remover o addon e restaurar seu snapshot.

## Próximos gates (não incluídos neste pacote)
O `secretHeaderProbe.js` está no pacote, mas não é importado pelo entrypoint. Portanto, o gate A **não comprova** compatibilidade real de `SecretString` com `HttpHeader`. A verificação de API exigirá build opt-in revisado separadamente, segredo sintético mantido fora de arquivos do addon, autorização de módulo por UUID apenas no clone e nenhuma conexão pública.

O gate HTTPS requer ainda outro ambiente isolado, sem Worker público, pagamentos, jogadores ou entregas. Não habilitar `ACK` ou gerar rewards.

## Resumo de autorização
Permitido agora: CI, empacotamento e inspeção de arquivos offline, preparação deste roteiro.
Não realizado: instalação BDS local, gate A/B/C, requisições HTTPS, alteração na MagnoHost, produção, `main`, credenciais reais.
