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
   - `schema-rfc12-rfc13.sql` (entrega e pagamento retido simulado);
   - `schema-rfc12-rfc13-prazos.sql` (prazos da conferência e da disputa, consulta e exclusão de pagamentos retidos);
   - `schema-growth.sql` (lista de espera, indicações, indicadores, experimentos e painel de growth);
   - `schema-habito.sql` (coleção privada, exportação, avaliações e relatório do hábito).

   Em um projeto existente que já recebeu as migrações de listas e alertas, aplique apenas os scripts seguintes a elas, na ordem acima. Eles são aditivos e podem ser reaplicados. Não recrie o banco nem reaplique o seed para atualizar o projeto. Vendas históricas confirmadas continuam concluídas; a migração não inventa pagamentos ou lançamentos financeiros retroativos.
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
- No Windows, os logs internos do Chrome ficam desabilitados no terminal para evitar mensagens repetidas do atualizador. A saída e as falhas do Mocha/Selenium continuam visíveis. Para investigar o navegador, execute com `E2E_CHROME_LOGS=true`.
- As suítes cobrem RFC01 a RFC04, RFC06, RFC07, RF01, RF02, RFC11 a RFC13 (inclusive os prazos da conferência e da disputa), RFC16 a RFC24, RF04, RF05, RNF05 e RNF06 e criam os próprios dados (peças com prefixo `E2E `). A função `e2e_ajustar_prazo`, também do `test-support.sql`, antecipa prazos de transações de teste para demonstrar prazos próximos e vencidos.
- Para apagar esses dados ao final (peças vendidas não podem ser removidas pela aplicação), execute a versão atual de `backend/database/test-support.sql` no ambiente de testes, inclusive se já instalou uma versão anterior. Ela inclui a limpeza das novas entidades, restrita aos dados de teste. **Não use esse arquivo em produção.** As suítes devem rodar sequencialmente, sem outra execução simultânea no mesmo banco.

## Regras de negócio implementadas

- **Passaporte digital (RFC03, RFC07):** o perito emite o passaporte com certificados (obrigatório), laudos, notas fiscais, fotografias e proprietários anteriores. O conteúdo é assinado digitalmente (HMAC-SHA256 com segredo guardado só no banco) e a assinatura é verificada a cada consulta. Perito e administrador atualizam o passaporte e a assinatura é renovada.
- **Privacidade (RNF04):** a identidade dos proprietários e as notas fiscais só aparecem a terceiros se o dono permitir.
- **Transações (RFC04, RFC12, RFC13):** o comprador (ou o administrador, em nome dele) registra a proposta; a peça entra em negociação (uma proposta ativa por vez). O vendedor aceita a proposta, o comprador registra o pagamento simulado, o vendedor informa o envio e o comprador confirma recebimento e confere a peça. Somente a aprovação conclui a venda, libera o pagamento, gera a comissão e transfere a propriedade/passaporte. Comprador ou vendedor podem cancelar antes do pagamento. O percentual de comissão (`comissao_percentual`, inicialmente 10%) é fixado no pagamento, com arredondamento para centavos; o repasse é o valor pago menos a comissão.
- **Links de compartilhamento do passaporte (RFC16):** o proprietário atual da peça (vendedor ou comprador) gera link e QR code escolhendo os campos públicos; identidade dos proprietários e valor ficam privados por padrão. A consulta em `/p/<código>` não exige cadastro, mostra só os campos liberados (documentos aparecem sem os arquivos, com o hash) e cada acesso é registrado, separando link e QR code. O dono altera os campos e a validade ou revoga o link, que deixa de dar acesso na hora. Quando a peça é vendida, os links do antigo dono são encerrados.
- **Eventos de uso (RNF06):** login, consultas ao passaporte (logado, por link ou QR), emissão, atualização e transferência do passaporte, links, cadastro de peças, decisões da curadoria e transações são registrados com data, origem e indicação de gatilho externo (link, QR, alerta ou e-mail). A consulta de um usuário ao mesmo passaporte conta uma vez a cada 30 minutos. O administrador vê no painel apenas o resumo agregado por período.
- **Lista de desejos (RFC22):** o comprador cria listas por categoria e faixa de valor ou salva uma peça consultada (em lista existente ou nova). A lista mostra as peças salvas com a situação (disponível, em negociação, vendida ou indisponível) e as peças publicadas pela curadoria que combinam com os critérios, destacando como novas as publicadas depois da criação da lista. Excluir a lista exclui os alertas vinculados. O administrador vê só a demanda agregada por categoria e as peças mais salvas.
- **Alertas e lembretes (RFC21):** o comprador recebe alerta de peça nova compatível com uma lista (semanal por padrão) e o vendedor, lembrete das peças do estoque com passaporte incompleto, isto é, sem passaporte, laudo pericial, nota fiscal ou fotografia (mensal por padrão). O envio é feito na plataforma, como notificação, quando o usuário entra e só se houver novidade; nenhum aviso se repete antes do próximo período. Todo alerta pode ser desligado com uma ação, alterado (frequência e canal; o e-mail fica para uma próxima versão) ou excluído. O administrador vê a taxa de desativação (alertas desligados ou excluídos enquanto ligados, sobre os criados). O lembrete de conservação depende da coleção privada (RFC23) e entra junto com ela.

## Growth e hábito

| Requisito | Implementação e acesso | Demonstração automatizada |
| --- | --- | --- |
| RFC17 / RFS57–60 e RFS54 | Página pública **/lista-de-espera** (landing e passaporte público levam a ela); administrador → **Lista de espera** | `tests/e2e/listaespera.test.js` |
| RFC18 / RFS61–64 | Painel → **Indicações**, para todos os perfis; origem da conta em **Usuários** | `tests/e2e/indicacoes.test.js` |
| RFC19, RFC20 e RF04 | Administrador → **Growth**: painel, indicadores e experimentos | `tests/e2e/growth.test.js` |
| RFC23, RNF05, RFC24 e RF05 | Comprador → **Minha coleção**; **Avaliações**; administrador → Growth → **Indicadores do hábito** | `tests/e2e/habito.test.js` |

- **Lista de espera (RFC17):** o visitante se inscreve sem cadastro, com perfil, categorias de interesse e consentimento. A versão da página (`?v=`, a versão `b` inclui bolsas, experimento X5) e a origem (`?origem=` ou `?utm_source=`) são registradas. O administrador filtra por perfil, categoria, versão, origem e período, vê o total por versão, edita dados e status (aguardando, convidado, cadastrado) e exclui a inscrição. A inscrição feita pelo link de um passaporte conta como cadastro originado do link (RFS54).
- **Indicações e origem (RFC18):** qualquer perfil indica um comprador ou vendedor e recebe o link do convite (lista de espera com o código). Quando o administrador cria a conta com o mesmo e-mail, a indicação passa a "conta criada", e o primeiro login a "conta ativada". Toda conta nova registra a origem: indicação, link, lista de espera (automáticas) ou conteúdo, anúncio e direto (informadas pelo administrador). Só a indicação não aceita pode ser corrigida ou cancelada.
- **Indicadores (RFC19) e painel (RF04):** o catálogo traz a North Star (passaportes vivos em 90 dias), as quatro métricas de proteção e os indicadores do funil do Plano de Growth (A1, A2, A4, A5, B1, B3, R1, R3, R4, F1 a F3, I2, I4, I5), cada um com fórmula calculada dos eventos de uso, meta e frequência. Alterar fórmula, meta ou frequência guarda o histórico; desativar preserva as medições. O painel, por período, etapa e lado, mostra valor, meta e status e os experimentos concluídos com resultado e decisão.
- **Experimentos (RFC20):** hipótese, etapa, indicador, critério de sucesso e notas de 1 a 10; o ICE Score é a média das três notas. O backlog X1 a X15 do Plano de Growth já vem cadastrado. Concluir exige resultado e decisão; só experimentos em backlog podem ser excluídos.
- **Coleção privada (RFC23) e exportação (RNF05):** o comprador registra as peças que já possui, uma a uma ou importando a planilha (CSV: nome; categoria; estado; valor; manutenção) como rascunhos, sem anunciá-las. Só o dono vê a coleção, o valor de referência e o que falta para o passaporte (fotografias, nota fiscal, laudo, certificado). Cada atualização vai para o histórico; a peça pode ter o passaporte solicitado e, depois disso, não pode ser excluída. O proprietário exporta a coleção e os passaportes das peças que possui em JSON.
- **Avaliações (RFC24):** depois da transação concluída, comprador e vendedor avaliam um ao outro uma vez (nota de 1 a 5 e comentário). Cada um vê as avaliações recebidas e a nota média; o autor altera o comentário em até 7 dias; o administrador remove avaliação ofensiva com o motivo, e ela sai da reputação.
- **Indicadores do hábito (RF05):** por coorte (mês de entrada), para comprador, proprietário ou vendedor: usuários habituais (sessão em todas as semanas do período; para o proprietário, atualização em todos os meses), dias até o primeiro investimento, sessões sem gatilho externo, passaportes atualizados em 90 dias, consultas vindas de link e desativação de alertas.
- **Pendente:** o lembrete de conservação do RFC21 ainda não foi implementado.

## Entrega dos requisitos essenciais

| Requisito | Implementação e acesso | Demonstração automatizada |
| --- | --- | --- |
| RFC06 / RFS21–24 | Administrador → **Custódia física**: entrada, consulta por peça/local/situação, mudança de localização e saída com histórico | `tests/e2e/custodias.test.js` |
| RF01 | Administrador → **Relatórios e financeiro** → Transações por categoria: período, categoria, situação, subtotais e total geral | `tests/e2e/relatorios.test.js` |
| RF02 / RFC11 | Na mesma tela, **Financeiro**: receitas/despesas por competência e categoria, contas a pagar/receber, liquidação e cancelamento com justificativa | `tests/e2e/relatorios.test.js` |
| RFC12 / RFC13 | **Transações**: envio pelo vendedor, recebimento e conferência pelo comprador, retenção/liberação/estorno simulado e decisão do administrador | `tests/e2e/entregas.test.js` |
| RFC12 / RFC13 (RFS37–39, RFS42, RFS44) | **Transações**: prazo de conferência declarado no aceite, prazo de 5 dias para a decisão da disputa, destaque e filtro dos prazos próximos, estado observado e exclusão da retenção registrada por erro. **Relatórios e financeiro → Financeiro**: pagamentos simulados por status e período | `tests/e2e/prazos.test.js` |

Regras detalhadas para revisão do grupo:

- **Custódia:** apenas uma guarda ativa por peça. Datas de entrada e saída não podem estar no futuro; a saída não pode anteceder a entrada. A retirada encerra a guarda, preservando o histórico; uma nova entrada cria outro registro. Peças com histórico de custódia não são apagadas pela aplicação.
- **Relatórios:** o RF01 usa a data da proposta no horário de Brasília, incluindo os dois extremos do período. O total soma as situações selecionadas e exibe separadamente as vendas concluídas. O financeiro usa a competência do lançamento; contas em aberto são a pagar/receber, liquidadas são pagas/recebidas e canceladas ficam no histórico, fora dos totais. O saldo realizado é recebido menos pago para as competências selecionadas.
- **Receitas e despesas:** a comissão de uma venda nova é lançada automaticamente uma única vez na conclusão, já liquidada. Taxas de emissão/manutenção de passaporte e despesas com peritos, parceiros e operação são lançadas manualmente pelo administrador. Não há cobrança automática por emissão de passaporte. O valor integral da compra, o dinheiro retido e os repasses pertencem aos participantes e são apresentados separadamente da receita da Lastro.
- **Entrega e contestação:** o comprador só pode conferir após registrar recebimento. Uma contestação exige motivo e mantém o pagamento retido. O administrador informa a justificativa e decide liberar (concluir venda e transferir) ou estornar (cancelar e devolver a disponibilidade, mantendo o proprietário). A decisão de estorno pressupõe a resolução operacional da devolução; não há integração com transportadora.
- **Prazos (RFS37 a RFS39):** ao aceitar a proposta, o vendedor declara o prazo de conferência, de 1 a 30 dias (padrão de 7, parâmetro `prazo_conferencia_dias`), que conta a partir do recebimento. A contestação só é aceita dentro desse prazo; a aprovação continua possível depois dele. A contestação abre o prazo de decisão do administrador, de 5 dias (parâmetro `prazo_disputa_dias`). Conferências e disputas com menos de 2 dias para o fim do prazo aparecem como "Perto da data limite", e as vencidas, como "Prazo vencido"; o filtro "Perto da data limite" lista as duas situações, ordenadas pelo prazo mais curto. Vencido o prazo de conferência sem resposta do comprador, o administrador pode liberar o pagamento com justificativa. Ao contestar, o comprador pode registrar o estado observado da peça.
- **Pagamentos retidos (RFS42 e RFS44):** cada parte vê na transação o status do seu pagamento. O administrador filtra os pagamentos por status (retido, liberado, estornado) e pela data da retenção. Uma retenção registrada por erro pode ser excluída pelo administrador, com motivo, antes do envio da peça e sem liberação nem devolução; a transação volta a aguardar o pagamento e a exclusão fica no histórico.
- **Limites para RFC12/RFC13:** pagamento e estorno são simulações, sem gateway ou movimentação de dinheiro (seção 1.2 do DRE). Não existe liberação automática por prazo, nem cancelamento automático após pagamento: o vencimento é sinalizado e a decisão é do administrador. As fotografias da conferência citadas nos atributos do RFS37 a RFS40 não foram incluídas nesta versão. A conferência só existe depois do recebimento e uma transação só pode ser cancelada antes do pagamento, por isso não há conferência a excluir (RFS40).
- **Integridade:** as transições são autorizadas também no banco, bloqueiam alterações fora de ordem e usam transações/bloqueios para evitar pagamento, comissão ou transferência duplicados. Histórico, custódia e contas não aceitam gravação direta pelo cliente. A aprovação da entrega mantém a integração existente de transferência do passaporte e revogação dos links do dono anterior.

Para demonstrar somente esta entrega, com os dois servidores ligados:

```powershell
$env:E2E_HEADLESS = 'false'
npm run test:e2e:essenciais
```

Também é possível executar cada arquivo da tabela com `npx mocha <arquivo>`. A suíte `transacoes.test.js` foi adaptada para validar a integração do RFC04 com a nova conferência.

Validação em 29/10/2026: **175 testes passando** na suíte completa (162 da entrega de custódia, financeiro e entrega + 13 dos prazos e pagamentos retidos; aproximadamente 18 minutos), com Chrome e Supabase de desenvolvimento. `npm run build` passou. `npm run lint` terminou sem erros, com dois avisos preexistentes de símbolos não usados (`next` em `backend/server.js` e `History` em `DigitalPassportDemo.jsx`).

Roteiro manual: registrar uma custódia e movimentá-la; criar uma proposta de compra; entrar como vendedor para aceitar; como comprador para pagar; como vendedor para registrar envio; como comprador para receber e aprovar. Por fim, entrar como administrador e conferir a venda agrupada, a comissão financeira e o histórico. Uma segunda transação permite demonstrar contestação e estorno.

A entrega do código não substitui a atualização do cronograma (% executado), o alinhamento do DRE ou a criação da tag da release após a revisão/integração pelo grupo. Os requisitos de growth e hábito que ficaram com outro integrante continuam sendo uma frente separada.
