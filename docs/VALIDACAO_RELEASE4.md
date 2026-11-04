# Evidência de validação — Release 4

Execução real em ambiente local, com Chrome, Node.js v24.3.0, npm 11.4.2 e Supabase de desenvolvimento do grupo.

- Início: 03/11/2026, 20:48:03 (Brasília).
- Término: 03/11/2026, 21:11:55 (Brasília).
- Duração: 23 min 53 s.
- Resultado: **283 testes aprovados; 0 falhas; 0 ignorados; 72 grupos**.
- Revisão: alterações da Release 4 incluídas no mesmo commit deste relatório, sobre a base 8f41936 (Release 03).
- Frontend e API permaneceram estáveis durante a execução; nenhuma alteração de código ou schema foi feita durante a rodada final.

Comando executado na raiz, com API e frontend ligados:

```powershell
npm run test:e2e -- --reporter json-stream
```

## Resultado por arquivo

| Suíte | Testes aprovados |
|---|---:|
| alertas.test.js | 13 |
| auth.test.js | 14 |
| categorias.test.js | 10 |
| clientes.test.js | 9 |
| conservacao.test.js | 5 |
| consignacoes.test.js | 9 |
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

## Demais verificações

- `npm run build`: aprovado. O Vite informa aviso de tamanho do bundle principal (aproximadamente 552 kB); isso não impediu a geração.
- `npm run lint`: aprovado, sem avisos.
- `npm audit`: zero vulnerabilidades reportadas na raiz e no backend na data da validação.
- Inspeção visual das quatro telas novas: consignação, parcerias, onboarding e saúde da base.

## Correções comprovadas durante a validação

- O formulário de indicadores agora aguarda as fórmulas antes de permitir salvar. Um teste determinístico reproduziu a falha anterior e passou após a correção.
- Links de e-mail preservam destino e origem após login, inclusive quando a sessão expirou. Destinos externos são rejeitados.
- A rodada final foi executada integralmente depois das correções, sem reutilizar os resultados de rodadas interrompidas.

## Alcance da evidência

A suíte usa navegador Selenium e a API real com Supabase de desenvolvimento. E-mail usa SMTP de captura local e API/frontend temporários próprios: valida o transporte sem encaminhar mensagens externas. Não comprova entrega por um provedor real nem leitura do destinatário.

As regras iniciais de RFC14/RFC15/RF03 e as limitações operacionais estão no [guia da Release 4](RELEASE4.md). Este resultado comprova os cenários automatizados; não substitui homologação do grupo, atualização do DRE/cronograma, implantação em produção ou experimentos com participantes reais.
