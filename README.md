# Lastro

A luxurious, high-end web application for curating rare art, iconic objects, and extraordinary pieces. Built with React, Vite, and Tailwind CSS.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

## Design System
- **Typography:** Italiana (Serif) & Inter (Sans-serif)
- **Colors:** Deep obsidian (`#0a0a0a`), warm off-white (`#f0ebe1`), and elegant champagne-gold (`#A69076`).
- **Layout:** Fully responsive, modern asymmetrical grids with precise micro-interactions.

## Backend e banco de dados (Supabase)

1. Copie `backend/.env.example` para `backend/.env` e preencha `SUPABASE_URL` e `SUPABASE_KEY` (chave anon/public).
2. No SQL Editor do Supabase, execute os arquivos de `backend/database/` nesta ordem:
   - `schema.sql` (RFC01 e RFC02);
   - `schema-rfc03-rfc04.sql` (passaportes e transações);
   - `seed.sql` (usuários e dados de desenvolvimento, somente na preparação do ambiente);
   - `schema-rnf06-rfc16.sql` (eventos e compartilhamento);
   - `schema-rfc22-rfc21.sql` (listas e alertas);
   - `schema-rfc06.sql` (custódia);
   - `schema-financeiro.sql` (relatórios e contas);
   - `schema-rfc12-rfc13.sql` (entrega e pagamento retido simulado).

   Em um projeto existente que já recebeu as migrações de listas e alertas, aplique apenas os três últimos scripts. Eles são aditivos e podem ser reaplicados. Não recrie o banco nem reaplique o seed para atualizar o projeto. Vendas históricas confirmadas continuam concluídas; a migração não inventa pagamentos ou lançamentos financeiros retroativos.
3. Inicie a API e o frontend:
   ```bash
   # Terminal 1, dentro de backend/
   npm ci
   npm run dev

   # Terminal 2, na raiz do repositório
   npm ci
   npm run dev
   ```

O frontend usa `VITE_API_URL` (padrão `http://localhost:3000`) e o backend aceita as origens de `FRONTEND_URL` (padrão `http://localhost:5173`) no CORS.

Usuários de teste criados pelo seed (senha de desenvolvimento em `backend/database/seed.sql`): `admin@`, `vendedor@`, `comprador@` e `perito@lastro.com`.

## Testes end-to-end (Selenium)

Com a API e o frontend em execução e o Chrome instalado:

```bash
npm run test:e2e
```

Para rodar uma suíte só (por exemplo, ao demonstrar um requisito), informe o arquivo:

```bash
npx mocha tests/e2e/links.test.js
```

- Configurável por `E2E_BASE_URL` (padrão `http://localhost:5173`), `E2E_API_URL` (padrão `http://localhost:3000`) e `E2E_HEADLESS=false` para ver o navegador.
- As suítes cobrem RFC01 a RFC04, RFC06, RFC07, RF01, RF02, RFC11 a RFC13, RFC16, RFC21, RFC22 e RNF06 e criam os próprios dados (peças com prefixo `E2E `).
- Para apagar esses dados ao final (peças vendidas não podem ser removidas pela aplicação), execute a versão atual de `backend/database/test-support.sql` no ambiente de testes, inclusive se já instalou uma versão anterior. Ela inclui a limpeza das novas entidades, restrita aos dados de teste. **Não use esse arquivo em produção.** As suítes devem rodar sequencialmente, sem outra execução simultânea no mesmo banco.

## Regras de negócio implementadas

- **Passaporte digital (RFC03, RFC07):** o perito emite o passaporte com certificados (obrigatório), laudos, notas fiscais, fotografias e proprietários anteriores. O conteúdo é assinado digitalmente (HMAC-SHA256 com segredo guardado só no banco) e a assinatura é verificada a cada consulta. Perito e administrador atualizam o passaporte e a assinatura é renovada.
- **Privacidade (RNF04):** a identidade dos proprietários e as notas fiscais só aparecem a terceiros se o dono permitir.
- **Transações (RFC04, RFC12, RFC13):** o comprador (ou o administrador, em nome dele) registra a proposta; a peça entra em negociação (uma proposta ativa por vez). O vendedor aceita a proposta, o comprador registra o pagamento simulado, o vendedor informa o envio e o comprador confirma recebimento e confere a peça. Somente a aprovação conclui a venda, libera o pagamento, gera a comissão e transfere a propriedade/passaporte. Comprador ou vendedor podem cancelar antes do pagamento. O percentual de comissão (`comissao_percentual`, inicialmente 10%) é fixado no pagamento, com arredondamento para centavos; o repasse é o valor pago menos a comissão.
- **Links de compartilhamento do passaporte (RFC16):** o proprietário atual da peça (vendedor ou comprador) gera link e QR code escolhendo os campos públicos; identidade dos proprietários e valor ficam privados por padrão. A consulta em `/p/<código>` não exige cadastro, mostra só os campos liberados (documentos aparecem sem os arquivos, com o hash) e cada acesso é registrado, separando link e QR code. O dono altera os campos e a validade ou revoga o link, que deixa de dar acesso na hora. Quando a peça é vendida, os links do antigo dono são encerrados.
- **Eventos de uso (RNF06):** login, consultas ao passaporte (logado, por link ou QR), emissão, atualização e transferência do passaporte, links, cadastro de peças, decisões da curadoria e transações são registrados com data, origem e indicação de gatilho externo (link, QR, alerta ou e-mail). A consulta de um usuário ao mesmo passaporte conta uma vez a cada 30 minutos. O administrador vê no painel apenas o resumo agregado por período.
- **Lista de desejos (RFC22):** o comprador cria listas por categoria e faixa de valor ou salva uma peça consultada (em lista existente ou nova). A lista mostra as peças salvas com a situação (disponível, em negociação, vendida ou indisponível) e as peças publicadas pela curadoria que combinam com os critérios, destacando como novas as publicadas depois da criação da lista. Excluir a lista exclui os alertas vinculados. O administrador vê só a demanda agregada por categoria e as peças mais salvas.
- **Alertas e lembretes (RFC21):** o comprador recebe alerta de peça nova compatível com uma lista (semanal por padrão) e o vendedor, lembrete das peças do estoque com passaporte incompleto, isto é, sem passaporte, laudo pericial, nota fiscal ou fotografia (mensal por padrão). O envio é feito na plataforma, como notificação, quando o usuário entra e só se houver novidade; nenhum aviso se repete antes do próximo período. Todo alerta pode ser desligado com uma ação, alterado (frequência e canal; o e-mail fica para uma próxima versão) ou excluído. O administrador vê a taxa de desativação (alertas desligados ou excluídos enquanto ligados, sobre os criados). O lembrete de conservação depende da coleção privada (RFC23) e entra junto com ela.

## Entrega dos requisitos essenciais

| Requisito | Implementação e acesso | Demonstração automatizada |
| --- | --- | --- |
| RFC06 / RFS21–24 | Administrador → **Custódia física**: entrada, consulta por peça/local/situação, mudança de localização e saída com histórico | `tests/e2e/custodias.test.js` |
| RF01 | Administrador → **Relatórios e financeiro** → Transações por categoria: período, categoria, situação, subtotais e total geral | `tests/e2e/relatorios.test.js` |
| RF02 / RFC11 | Na mesma tela, **Financeiro**: receitas/despesas por competência e categoria, contas a pagar/receber, liquidação e cancelamento com justificativa | `tests/e2e/relatorios.test.js` |
| RFC12 / RFC13 | **Transações**: envio pelo vendedor, recebimento e conferência pelo comprador, retenção/liberação/estorno simulado e decisão do administrador | `tests/e2e/entregas.test.js` |

Regras detalhadas para revisão do grupo:

- **Custódia:** apenas uma guarda ativa por peça. Datas de entrada e saída não podem estar no futuro; a saída não pode anteceder a entrada. A retirada encerra a guarda, preservando o histórico; uma nova entrada cria outro registro. Peças com histórico de custódia não são apagadas pela aplicação.
- **Relatórios:** o RF01 usa a data da proposta no horário de Brasília, incluindo os dois extremos do período. O total soma as situações selecionadas e exibe separadamente as vendas concluídas. O financeiro usa a competência do lançamento; contas em aberto são a pagar/receber, liquidadas são pagas/recebidas e canceladas ficam no histórico, fora dos totais. O saldo realizado é recebido menos pago para as competências selecionadas.
- **Receitas e despesas:** a comissão de uma venda nova é lançada automaticamente uma única vez na conclusão, já liquidada. Taxas de emissão/manutenção de passaporte e despesas com peritos, parceiros e operação são lançadas manualmente pelo administrador. Não há cobrança automática por emissão de passaporte. O valor integral da compra, o dinheiro retido e os repasses pertencem aos participantes e são apresentados separadamente da receita da Lastro.
- **Entrega e contestação:** o comprador só pode conferir após registrar recebimento. Uma contestação exige motivo e mantém o pagamento retido. O administrador informa a justificativa e decide liberar (concluir venda e transferir) ou estornar (cancelar e devolver a disponibilidade, mantendo o proprietário). A decisão de estorno pressupõe a resolução operacional da devolução; não há integração com transportadora.
- **Limites acordados para RFC12/RFC13:** o PDF disponibilizado não detalha esses dois requisitos; o fluxo acima foi aprovado pelo responsável pela implementação nesta entrega. Pagamento e estorno são simulações, sem gateway ou movimentação de dinheiro. Não existe liberação automática por prazo, nem cancelamento automático após pagamento. Esses critérios precisam constar no DRE que o grupo apresentar.
- **Integridade:** as transições são autorizadas também no banco, bloqueiam alterações fora de ordem e usam transações/bloqueios para evitar pagamento, comissão ou transferência duplicados. Histórico, custódia e contas não aceitam gravação direta pelo cliente. A aprovação da entrega mantém a integração existente de transferência do passaporte e revogação dos links do dono anterior.

Para demonstrar somente esta entrega, com os dois servidores ligados:

```powershell
$env:E2E_HEADLESS = 'false'
npm run test:e2e:essenciais
```

Também é possível executar cada arquivo da tabela com `npx mocha <arquivo>`. A suíte `transacoes.test.js` foi adaptada para validar a integração do RFC04 com a nova conferência.

Validação em 29/10/2026: **162 testes passando** na suíte completa (128 anteriores adaptados + 34 novos; aproximadamente 13 minutos), com Chrome e Supabase de desenvolvimento. `npm run build` passou. `npm run lint` terminou sem erros, com dois avisos preexistentes de símbolos não usados (`next` em `backend/server.js` e `History` em `DigitalPassportDemo.jsx`).

Roteiro manual: registrar uma custódia e movimentá-la; criar uma proposta de compra; entrar como vendedor para aceitar; como comprador para pagar; como vendedor para registrar envio; como comprador para receber e aprovar. Por fim, entrar como administrador e conferir a venda agrupada, a comissão financeira e o histórico. Uma segunda transação permite demonstrar contestação e estorno.

A entrega do código não substitui a atualização do cronograma (% executado), o alinhamento do DRE ou a criação da tag da release após a revisão/integração pelo grupo. Os requisitos de growth e hábito que ficaram com outro integrante continuam sendo uma frente separada.
