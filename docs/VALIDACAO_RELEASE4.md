# Evidência de validação — Release 4

Validação local em 03–04/11/2026, com Chrome/Selenium, Node.js v24.3.0, npm 11.4.2 e Supabase de desenvolvimento do grupo. Horários em Brasília.

**299 cenários distintos tiveram resultado aprovado**, considerando a regressão cumulativa e a reexecução das suítes afetadas. Não houve uma execução única de 299 testes sem falhas.

- Revisão funcional: `e22947e` — complemento de RFC14/RFC15/RF03.
- Revisão dos ajustes de teste: `d7d7050`. Alterou somente testes e auxiliares; aplicação e schema não mudaram entre as rodadas.
- A suíte nova `cs.test.js` passou isoladamente (16 testes) e novamente dentro da regressão cumulativa.

## Execuções

| Rodada | Início | Término | Resultado |
|---|---|---|---|
| Regressão cumulativa | 03/11, 23:42:24 | 04/11, 00:09:01 | 294 aprovados, 5 testes com falha e 1 falha no hook de limpeza; nenhum ignorado |
| Reexecução das quatro suítes afetadas | 04/11, 00:11:39 | 04/11, 00:16:42 | 52 aprovados, zero falhas e zero ignorados, incluindo a limpeza |

Durações: 26 min 37 s e 5 min 03 s. Os 52 testes repetidos incluem os cinco casos que falharam e os demais cenários das mesmas suítes. A união por arquivo e nome completo contém 299 casos aprovados, sem contar repetições como novos testes.

Comandos executados sequencialmente, com API e frontend ligados:

```powershell
npm run test:e2e -- --reporter json-stream
npx mocha tests/e2e/eventos.test.js tests/e2e/prazos.test.js tests/e2e/relatorios.test.js tests/e2e/transacoes.test.js --reporter json-stream
```

Logs originais na máquina de validação: `%TEMP%/lastro-release4-cs-regression.jsonl` e `%TEMP%/lastro-release4-cs-recheck.jsonl`. Não são dependências para executar a suíte.

## Ocorrências e correções

1. **Quatro verificações de período (prazos e relatórios):** os arquivos guardavam a data ao serem importados. A execução atravessou a meia-noite e os registros novos ficaram fora do filtro de ontem. Os testes agora preservam o início da janela e calculam a data final na consulta. Subtotais, comissões, filtros e pagamentos passaram na reexecução.
2. **Consulta de passaporte na suíte de eventos:** o texto de assinatura válida não apareceu na espera original de dez segundos. A espera específica passou a vinte segundos, sem recarregar nem repetir a operação; se falhar, registra o estado visível da página. O cenário passou verificando também a deduplicação de consultas em trinta minutos. A causa exata do atraso inicial não foi comprovada.
3. **Limpeza de transações:** uma tentativa adicional de login administrativo retornou 401, embora logins seguintes tenham funcionado. A limpeza passou a reutilizar a sessão válida dos auxiliares. Os registros da rodada interrompida foram removidos pelo prefixo exato daquela execução. A suíte de transações e sua limpeza passaram na reexecução. Os testes de autenticação continuam fazendo login real, sem cache.

Não foram ignorados testes nem configuradas tentativas automáticas para transformar falhas em aprovação. Frontend, API e schema permaneceram estáveis durante cada execução.

## Cenários distintos aprovados por arquivo

| Suíte | Aprovados |
|---|---:|
| alertas.test.js | 13 |
| auth.test.js | 14 |
| categorias.test.js | 10 |
| clientes.test.js | 9 |
| conservacao.test.js | 5 |
| consignacoes.test.js | 9 |
| cs.test.js | 16 |
| custodias.test.js | 10 |
| email.test.js | 7 |
| entregas.test.js | 12 |
| eventos.test.js | 8 |
| growth.test.js | 12 |
| habito.test.js | 11 |
| indicacoes.test.js | 9 |
| laudos.test.js | 11 |
| links.test.js | 14 |
| listaespera.test.js | 7 |
| listas.test.js | 14 |
| parcerias.test.js | 7 |
| passaportes.test.js | 17 |
| pecas.test.js | 18 |
| prazos.test.js | 13 |
| relatorios.test.js | 12 |
| release3-growth.test.js | 11 |
| transacoes.test.js | 19 |
| usuarios.test.js | 11 |
| **Total** | **299** |

## Outras verificações

- Build e lint aprovados após os ajustes. O Vite informa aviso de bundle principal de aproximadamente 579 kB; a geração foi concluída.
- `git diff --check` aprovado.
- Migração `schema-release4-cs.sql` aplicada e reaplicada com sucesso no Supabase do grupo. `test-support.sql` atualizado no ambiente de desenvolvimento.
- Inspeção visual de dossiês, recuperação do cliente e indicadores operacionais; a inspeção anterior já cobria consignação, parcerias, onboarding e saúde da base.
- Verificação final: frontend e healthcheck da API retornaram HTTP 200; pesos restaurados em 40/30/30; nenhuma peça E2E permaneceu na lista do vendedor de testes. Nenhum processo Mocha permaneceu executando.
- `npm audit` reportou zero vulnerabilidades na raiz e no backend na verificação inicial de 03/11. Este complemento não alterou dependências nem lockfiles.

## Alcance

A suíte usa Selenium, API real e Supabase de desenvolvimento. E-mail usa SMTP de captura local e servidores temporários próprios, sem encaminhar mensagens externas. Não comprova entrega por um provedor real nem leitura do destinatário.

As regras e o roteiro estão no [guia da Release 4](RELEASE4.md). Foram incluídos os critérios adicionais do Kanban para dossiês, recuperação e RF03. Revenda permanece fora do escopo por decisão do solicitante.

A evidência não substitui homologação do grupo, atualização do DRE/cronograma, integração da branch, tag oficial, implantação em produção ou experimentos com participantes reais. A execução anterior de 283 testes sem falhas está preservada no histórico Git anterior a este complemento.
