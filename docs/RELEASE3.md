# Release 3 — Laudos, categorias e suporte aos pilotos

Escopo: release 03 do cronograma informado pelo grupo em 03/11/2026. As regras de laudos/categorias seguem o PDF `LASTRO_Proposta_Tecnica_com_Matriz_de_Riscos_1`. O grupo confirmou o suporte à execução dos experimentos e ao registro de evidências; entrevistas, convites e testes com participantes serão realizados pelo grupo.

## Entrega no sistema

| Requisito | Onde demonstrar | Cobertura |
| --- | --- | --- |
| RFC05 / RFS17–20 | Painel → Laudos periciais | Perito cadastra parecer, valor, data e fotos; consulta por peça/perito/período; autor corrige e renova assinatura; autor/admin remove laudo incorreto antes da vinculação. |
| Integração ao passaporte | Laudo → Vincular ao passaporte; peça → Passaporte | Exige passaporte da mesma peça. Vinculação preserva conteúdo, impede edição/remoção e renova a assinatura do passaporte. Comprador abre o laudo vinculado. |
| RFC10 / RFS33–36 | Administrador → Categorias de peças | Cadastro, consulta, edição de nome/atributos e remoção sem vínculos. Vendedor consulta e usa atributos no cadastro de peça. |
| RF01 | Relatórios e financeiro → Transações por categoria | Mantém agrupamento, subtotais, total e filtros; agora aceita categorias mantidas pelo administrador. |
| X1 | Vendedor → Nova peça → Manter como acervo privado | Privado por padrão no formulário; não entra na fila de publicação. Dono autoriza publicação e ainda depende de curadoria. Compartilhamento continua campo a campo. |
| X2 | Growth → Pilotos X1–X5 → Selecionar passaporte-exemplo | Configuração de um link autorizado, nível de verificação e conservação; página pública `/passaporte-exemplo`; evidências dos quatro critérios de leitura. |
| X3 | `/peritos-fundadores` e Growth → Pilotos | Apresentação do programa; registro de convite/resposta pelo grupo e associação opcional a um laudo piloto efetivamente assinado. |
| X4 | Perito → Indicações; administrador → Pilotos | Registro de diagnóstico vinculado a indicação de vendedor feita por perito; conversão observada e tempo até diagnóstico. |
| X5 | `/lista-de-espera?v=a` e `?v=b`; Pilotos | Versões sem/com bolsas; inscrições por versão, interesse em bolsas e variação percentual. |
| A5 / RNF06 | Growth → Painel de growth; Indicadores | Peritos distintos com laudo assinado nos últimos 60 dias. Dicionário em `DICIONARIO_EVENTOS.md`. |
| RNF05 | Exportação já existente da coleção/passaportes | Inclui os laudos estruturados vinculados aos passaportes do proprietário. |
| RFC16–20 e RFC21 parcial | Compartilhamento, lista de espera, indicações, indicadores, experimentos e alertas | Funcionalidades anteriores preservadas e verificadas pela regressão. |

## Regras e limites para explicar na apresentação

- A assinatura é um HMAC de integridade calculado no banco, associado ao perito autenticado, como no passaporte existente. Não é assinatura ICP-Brasil nem certificado externo do perito.
- A administração credencia o perito por meio do cadastro com perfil Perito. Não foi criada uma verificação automática de credenciais profissionais.
- Fotos dos laudos e de peças cadastradas como privadas ficam em buckets privados. A API fornece URLs temporárias; um arquivo já obtido por um destinatário não pode ser recolhido. Fotos de peças privadas compartilhadas têm URLs de 5 minutos; revogar o link impede novas consultas, mas uma URL já emitida pode durar até sua expiração.
- Tornar uma peça antiga privada copia as fotografias do armazenamento público para o privado e remove os arquivos públicos. Fotografias de exemplo ou externas precisam ser removidas/substituídas pelo proprietário nesse fluxo.
- Renomear categoria preserva os vínculos e os critérios das listas. Remover um atributo com valor preenchido é bloqueado para não perder classificação; atributos vazios removidos são limpos nas peças para permitir futuras edições. Categorias em uso por peças ou listas não são excluídas.
- Anexos de laudos antigos continuam disponíveis; não viram laudos estruturados automaticamente, porque o sistema não pode inferir parecer, valor, data e signatário de um PDF.
- Pilotos não são concluídos automaticamente. Evidências de demonstração ficam identificadas e fora dos resultados reais. Registros incorretos são anulados com motivo, preservando histórico. Entrevistas, convites e preenchimento de resultados reais são atividades do grupo.
- O exemplo do X2 usa um link já autorizado pelo proprietário. Sem escolha do grupo ou após revogação/vencimento, a página informa indisponibilidade.
- RFC21 continua com envio na plataforma. Esta entrega não adiciona e-mail.

## Preparar o ambiente

Em projeto que já recebeu as migrações anteriores até conservação, aplicar no SQL Editor:

1. `backend/database/schema-release3.sql`.
2. `backend/database/schema-release3-growth.sql`.
3. `backend/database/test-support.sql`, apenas no banco de desenvolvimento/testes.

Não reaplicar `seed.sql` em um banco existente. As duas migrações da release são transacionais e reaplicáveis. Reaplicar a primeira exige reaplicar a segunda para manter a fórmula final do A4.

Para executar localmente, usar dois terminais:

```powershell
# Terminal 1, a partir da raiz
cd backend
npm start
```

```powershell
# Terminal 2, na raiz
npm run dev
```

Para a apresentação e a validação Selenium, mantenha a API com `npm start`, sem reinício automático. Use `npm run dev` no backend durante o desenvolvimento e evite alterar arquivos enquanto a suíte estiver rodando.

## Selenium

Com frontend e API ativos, na raiz do repositório:

```powershell
# Apenas o que foi acrescentado na release 3
npm run test:e2e:release3

# Toda a regressão, incluindo os requisitos anteriores
npm run test:e2e
```

Para mostrar o navegador ao professor:

```powershell
$env:E2E_HEADLESS = 'false'
npx mocha tests/e2e/categorias.test.js
npx mocha tests/e2e/laudos.test.js
npx mocha tests/e2e/release3-growth.test.js
```

Execute as suítes sequencialmente, sem outro Selenium no mesmo banco. Elas usam usuários de desenvolvimento e dados com prefixos E2E. A suíte dos pilotos configura um exemplo temporário somente quando não houver exemplo ativo escolhido pelo grupo; dados de teste são removidos ao final.

## Roteiro para o Meet

1. Mostrar no cronograma que a release 3 acrescenta laudos e categorias aos CRUDs anteriores, mantendo RF01. Abrir RFS17–20 e RFS33–36 no DRE.
2. Como administrador, criar uma categoria e dois atributos. Como vendedor, cadastrar uma peça dessa categoria, preencher atributos e demonstrar a opção privada. Mostrar que comprador não vê a peça e administrador não a publica sem autorização do dono.
3. Autorizar publicação como vendedor e aprovar na curadoria como administrador. Consultar a peça no catálogo e seus atributos. Mostrar que a categoria em uso não pode ser removida.
4. Como perito, emitir um laudo com foto, corrigir seu valor/parecer e consultar por filtros. Emitir o passaporte e vincular o laudo. Mostrar que as ações de editar/remover desapareceram e a assinatura do passaporte é válida.
5. Como comprador, abrir o passaporte e o laudo. Como administrador, gerar o RF01, filtrando a nova categoria, e o painel de growth com A5.
6. Em Pilotos X1–X5, registrar uma demonstração, mostrar a exclusão dos resultados reais, os critérios de leitura, a ligação ao laudo piloto/indicação e as duas versões da lista de espera.
7. Executar os arquivos Selenium por requisito, mostrar o resultado e o commit. Atualizar cronograma, percentual executado, bugs e Status Report com as evidências verificadas.

## Fechamento acadêmico

O commit desta entrega não substitui atualização do cronograma nem homologação. Baseline, Status Report, registros de bugs e tag da release precisam corresponder à versão aprovada pelo grupo. Não se deve marcar entrevistas/contatos como concluídos usando resultados de demonstração.

A release 4 não foi iniciada neste trabalho; depende do próximo comando do responsável.
