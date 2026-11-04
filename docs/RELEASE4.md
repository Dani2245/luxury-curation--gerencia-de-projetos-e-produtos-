# Release 4 — Consignação, parcerias e fechamento

## Referência e escopo

O cronograma fornecido inclui RFC08/RFC09, manutenção do RF01, RF02/RFC11, RFC14–15, RFC23–24, RF03–05, conclusão do RFC21 e RNFs. X6–X15 aparecem como **backlog posterior**, já cadastrado no módulo de experimentos: não são experimentos de campo executados automaticamente pela entrega de código.

As regras de consignação e parcerias seguem o PDF da proposta técnica (RFS25–32). O mesmo PDF não contém a especificação detalhada de RFC14/RFC15/RF03. O solicitante confirmou as seguintes decisões para esta entrega:

- Adotar e documentar a proposta de onboarding por checklist e Health Score por atividade, uso do passaporte e fluxo principal, com pesos e faixas configuráveis.
- Implementar alertas na plataforma e e-mail opcional com consentimento, fila e SMTP; validar com servidor local, sem mensagens reais nos testes.
- Manter a coleção privada atual e deixar a revenda de peças adquiridas para uma entrega posterior.

Essas decisões orientam a implementação descrita abaixo. O grupo deve incorporá-las ao DRE; a confirmação do escopo pelo solicitante não substitui a homologação com o professor.

## Divergências com o Kanban a alinhar antes do fechamento

Na conferência do [Kanban público](https://github.com/users/hoddy23/projects/1/views/1) em 03/11/2026, os cartões abaixo apresentaram critérios adicionais à proposta aprovada pelo solicitante. As descrições citam a proposta v7 e status de 27/10/2026; o PDF disponível na implementação não detalhava esses requisitos. É necessário definir qual escopo será cobrado e refletir a decisão no DRE e no quadro.

| Requisito | Implementação atual | Critérios adicionais descritos no cartão |
|---|---|---|
| RFC14 | Checklist derivado de cadastro, documentação, passaporte e curadoria | Diagnóstico/verificação/dossiê, acompanhamento de dossiês parados há mais de 10 dias e registro de desistência |
| RFC15 | Pontuação derivada de eventos, pesos/faixas configuráveis e histórico das regras | Plano de recuperação e referência aos pesos do Plano de CS |
| RF03 | Base agregada por perfil/coorte, atividade, pontuação e faixas | Ações, conferências aprovadas, disputas por motivo e tempo até publicação no relatório de saúde |

Os critérios adicionais não estão cobertos integralmente pela implementação atual nem pelos 283 testes aprovados. A métrica B3 existente em Growth mede tempo até o passaporte; ela não equivale à consolidação desses critérios no RF03. Se o grupo mantiver a proposta aprovada, precisa registrar a revisão de escopo. Se adotar os critérios adicionais, será necessária implementação e nova validação antes de declarar esses itens concluídos.

O quadro também mantém consignação, parcerias e outras funcionalidades já implementadas como **A fazer**. O status importado não representa a situação atual do código; atualizar os cartões deve incluir evidências e os limites acima, sem marcar automaticamente todos como concluídos.

## Demonstração de consignação (administrador)

1. No painel, abra **Consignação**. Selecione uma peça não vendida. O vendedor consignante é preenchido a partir da peça e conferido no banco.
2. Informe data de entrada e condições acordadas, por exemplo comissão, prazo e condições de devolução. Registre a consignação.
3. Consulte por nome/número da peça e situação. A lista vem da entrada mais antiga para a mais recente.
4. Use **Editar condições** enquanto a peça estiver em estoque. Abra **Histórico** para comparar os acordos anteriores.
5. Use **Devolver** com data e justificativa. A baixa preserva a entrada e as alterações. Não é possível editar nem dar baixa novamente; um recebimento posterior gera outra consignação.
6. Para demonstrar venda, cadastre outra consignação e siga o fluxo normal de transação: proposta → aceite → pagamento simulado → envio → recebimento → aprovação da conferência. Somente a conclusão gera a baixa por venda, com o número da transação. Enquanto há negociação ativa, não é possível devolver a peça pelo estoque.

Consignação registra o acordo comercial; **Custódia física** registra o local de guarda. As duas telas têm históricos independentes. Receber uma consignação não afirma que uma peça foi colocada em um cofre específico. Nenhum gateway ou repasse financeiro real foi adicionado.

## Demonstração de parcerias (administrador)

1. Abra **Parcerias**, escolha casa de leilão, seguradora ou galeria.
2. Preencha nome, contato, dados do parceiro e condições comerciais.
3. Filtre a consulta por nome, tipo e situação.
4. Edite os dados e o acordo comercial; confira as versões no **Histórico**.
5. Use **Encerrar**, informando o motivo. O registro passa a encerrado e continua consultável, com todas as versões. Não permite edição nem segundo encerramento.

As condições são registradas como acordo comercial. Despesas efetivas com parceiros continuam sendo lançadas pelo administrador em **Relatórios e financeiro**; cadastrar um parceiro não cria cobranças ou pagamentos automaticamente.

## Onboarding e saúde da base

**RFC14 — Vendedor → Primeiros passos:** cada peça tem quatro etapas verificadas automaticamente: cadastro, documentação (fotografia + laudo + nota fiscal), emissão de passaporte e aprovação da curadoria. Cada etapa vale 25% do progresso. O vendedor vê as pendências e os links para revisar o cadastro, consultar laudos e configurar lembretes. A emissão e a inclusão dos documentos do passaporte continuam sendo responsabilidade do perito. Uma peça privada pode permanecer no acervo sem ser anunciada; o onboarding não a publica automaticamente.

**RFC15 — Meu Health Score:** o próprio comprador, vendedor ou perito vê a pontuação nos últimos 30 dias, de 0 a 100, e os sinais que a compõem. Configuração inicial: até 40 pontos por dias com login (40 × mínimo(dias/3, 1)); 30 por uso de passaporte ou laudo; 30 por uso do fluxo principal. Os sinais são eventos reais, não caixas marcadas manualmente.

- Uso de passaporte: consulta, emissão ou atualização do passaporte; consulta ou assinatura de laudo.
- Fluxo principal do vendedor: cadastrar peça, gerar link de passaporte ou aceitar proposta.
- Fluxo principal do comprador: salvar peça na lista, cadastrar/atualizar coleção ou confirmar a compra após conferência.
- Fluxo principal do perito: assinar laudo ou emitir passaporte.
- Faixas iniciais: risco abaixo de 40; atenção de 40 até menos de 70; saudável a partir de 70. A pontuação serve para acompanhar participação e não bloqueia direitos ou transações.

**RF03 — Administrador → Saúde da base:** consulta por período (até 366 dias), perfil e coorte (mês do cadastro), com total de contas, contas com login, média e distribuição por perfil/faixa. Períodos usam o horário de Brasília e incluem ambos os extremos. Contas sem eventos contam com pontuação zero; uma seleção sem contas exibe média sem base. Administradores não entram na base de clientes. O relatório só devolve agregados, mantendo a restrição do RNF06 sobre eventos individuais.

O administrador ajusta pesos (soma obrigatória de 100), meta de dias e limites das faixas com justificativa. As versões ficam no histórico. Uma consulta recalcula o período com a regra **vigente**, não simula um snapshot histórico da regra antiga. Os parâmetros iniciais acima concretizam a proposta de implementação aprovada pelo solicitante para RFC14/RFC15/RF03. A fórmula e os parâmetros devem constar na atualização do DRE.

A coleção privada existente mantém cadastro/importação, manutenção e pedido de passaporte. Por decisão expressa do solicitante, a revenda de peças adquiridas fica fora do escopo desta release e será tratada posteriormente.

## Alertas opcionais por e-mail

Os três tipos de alerta continuam disponíveis na plataforma, processados no acesso do usuário e respeitando a frequência configurada. Com SMTP configurado, o usuário pode escolher **E-mail e cópia na plataforma**. Para conservação, crie o lembrete e altere seu canal nas configurações do alerta. Escolher o canal é opcional; nada muda nos alertas já existentes.

A geração inclui uma fila persistente. O histórico distingue pendente, enviando, aceito pelo servidor de e-mail, falhou e cancelado. Em caso de falha, **Tentar e-mail novamente** reutiliza a notificação existente. Desligar o alerta ou voltar ao canal plataforma cancela os envios pendentes; excluir o alerta remove sua fila. Um envio já iniciado no SMTP pode terminar antes do cancelamento. Uma mensagem aceita pelo SMTP não comprova que o destinatário a leu nem que chegou à caixa de entrada.

Não há agendamento global fora do acesso do usuário: a geração e o consumo da fila acompanham a consulta das notificações. Não é necessário guardar a senha do usuário nem usar uma chave administrativa do Supabase. Uma reserva evita disparos concorrentes; uma execução interrompida pode ser retomada depois de dez minutos. O Message-ID é estável, mas falha entre a aceitação SMTP e o registro no banco pode produzir repetição na recuperação (não há garantia de entrega exatamente uma vez entre esses dois serviços).

O link do e-mail preserva a página de destino e a origem do acesso ao passar pelo login, inclusive com sessão expirada. O retorno aceita somente caminhos internos. O transporte real vem das variáveis de ambiente e fica desligado por padrão. A suíte `email.test.js` inicia API, frontend e SMTP isolados em portas locais temporárias, valida entrega, falha, repetição, cancelamento e retorno após autenticação, e encerra somente seus próprios processos. Não utiliza um provedor externo nem entrega e-mail real.

## Funcionalidades cumulativas a apresentar

| Área | Caminho e verificação | Suíte Selenium |
|---|---|---|
| RFC08 | Administrador → Consignação; entrada, ordem, condições, devolução e venda | `consignacoes.test.js` |
| RFC09 | Administrador → Parcerias; cadastro, filtros, edição e encerramento | `parcerias.test.js` |
| RFC14 | Vendedor → Primeiros passos; etapas derivadas dos registros reais | `clientes.test.js` |
| RFC15 / RF03 | Meu Health Score; administrador → Saúde da base e regras com histórico | `clientes.test.js` |
| RF01, RF02, RFC11 | Administrador → Relatórios e financeiro; período, subtotais, comissão, receitas, despesas e contas | `relatorios.test.js` |
| RFC23 / RNF05 | Comprador → Minha coleção; cadastro/importação, manutenção, histórico e exportação | `habito.test.js` |
| RFC24 | Avaliações após venda concluída; reputação e moderação justificada | `habito.test.js` |
| RF04, RFC19–20 | Administrador → Growth; indicadores, metas, histórico e experimentos | `growth.test.js` |
| RF05 | Growth → Indicadores do hábito; filtros e métricas por coorte | `habito.test.js` |
| RFC21 | Alertas opcionais de lista, passaporte incompleto, conservação e cópia por e-mail | `alertas.test.js`, `conservacao.test.js`, `email.test.js` |
| RNF02–04 | Regras no banco, isolamento por perfil e privacidade dos passaportes | Suítes de transações, laudos, links e permissões |

## Execução dos testes

Leia [Implantação e contingência](IMPLANTACAO.md) para preparar o ambiente. Na raiz, com API e frontend ligados:

```powershell
npx mocha tests/e2e/consignacoes.test.js
npx mocha tests/e2e/parcerias.test.js
npm run test:e2e:release4
# Regressão cumulativa completa
npm run test:e2e
```

Para mostrar o navegador ao professor, defina `$env:E2E_HEADLESS = 'false'` no terminal antes de executar. Os testes criam registros E2E e os removem ao final no ambiente de desenvolvimento. Não execute as suítes em paralelo nem contra produção.

Resultado da regressão final em 03/11/2026: **283 testes aprovados, zero falhas e zero ignorados**. Veja a [evidência da execução por arquivo](VALIDACAO_RELEASE4.md).

## Fechamento acadêmico

O grupo ainda precisa anexar o resultado real de homologação, atualizar cronograma/percentuais, DRE, Status Report, custos efetivamente incorridos e avaliação dos riscos. A evidência de teste é vinculada ao commit validado. A tag deve apontar para a revisão integrada e aprovada pelo grupo. Nenhum percentual, entrevista, aceite do cliente ou execução de experimento é inventado pelo sistema.
