# Release 4 — Consignação, parcerias e fechamento

## Referência e escopo

O cronograma fornecido inclui RFC08/RFC09, manutenção do RF01, RF02/RFC11, RFC14–15, RFC23–24, RF03–05, conclusão do RFC21 e RNFs. X6–X15 aparecem como **backlog posterior**, já cadastrado no módulo de experimentos: não são experimentos de campo executados automaticamente pela entrega de código.

As regras de consignação e parcerias seguem o PDF da proposta técnica (RFS25–32). O mesmo PDF não contém a especificação detalhada de RFC14/RFC15/RF03. O solicitante confirmou as seguintes decisões para esta entrega:

- Adotar e documentar a proposta de onboarding por checklist e Health Score por atividade, uso do passaporte e fluxo principal, com pesos e faixas configuráveis.
- Implementar alertas na plataforma e e-mail opcional com consentimento, fila e SMTP; validar com servidor local, sem mensagens reais nos testes.
- Manter a coleção privada atual e deixar a revenda de peças adquiridas para uma entrega posterior.

Essas decisões orientam a implementação descrita abaixo. O grupo deve incorporá-las ao DRE; a confirmação do escopo pelo solicitante não substitui a homologação com o professor.

## Complemento aprovado a partir do Kanban

Na conferência do [Kanban público](https://github.com/users/hoddy23/projects/1/views/1) em 03/11/2026, foram identificados critérios adicionais que não constavam no PDF disponível. O solicitante aprovou sua implementação e confirmou os pesos iniciais de 40% / 30% / 30%, configuráveis. A migração `schema-release4-cs.sql` acrescenta os fluxos abaixo sem apagar o checklist e os indicadores existentes.

| Requisito | Base mantida | Complemento implementado |
|---|---|---|
| RFC14 | Checklist derivado de cadastro, documentação, passaporte e curadoria | Diagnóstico/verificação/dossiê, acompanhamento de dossiês parados há mais de 10 dias e registro de desistência |
| RFC15 | Pontuação derivada de eventos, pesos/faixas configuráveis e histórico das regras | Plano de recuperação e referência aos pesos do Plano de CS |
| RF03 | Base agregada por perfil/coorte, atividade, pontuação e faixas | Ações, conferências aprovadas, disputas por motivo e tempo até publicação no relatório de saúde |

A suíte `cs.test.js` valida esse complemento. Os 283 testes da execução anterior são evidência histórica da versão anterior; a execução atual consta em `VALIDACAO_RELEASE4.md`. A métrica B3 de Growth continua medindo tempo até o passaporte; o RF03 possui uma medida própria de tempo até publicação.

O quadro também mantém consignação, parcerias e outras funcionalidades já implementadas como **A fazer**. O grupo deve atualizar os cartões com as evidências e as regras deste documento; o status importado não representa a situação atual do código nem comprova homologação.

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

**RFC14 — Dossiês de onboarding (vendedor e administrador):** para uma peça ainda não publicada, abra um dossiê com diagnóstico e descrição da procedência, documentação reunida e pendências. O fluxo tem seis etapas: diagnóstico → verificação → dossiê → perícia → curadoria → publicação. O administrador valida os avanços com justificativa; o vendedor acompanha somente suas peças. A verificação é uma conferência registrada pelo administrador, sem integração com serviços externos de identificação.

- Para chegar à perícia, exige descrição da documentação e fotografia da peça. Para chegar à curadoria, exige laudo pericial e passaporte válido existentes no banco.
- A publicação na curadoria conclui o dossiê na mesma transação do banco. Não existe botão para declarar uma publicação que não ocorreu. Peças privadas continuam exigindo autorização do vendedor para anunciar. Peças anteriores sem dossiê mantêm o fluxo existente.
- Dossiês ativos sem mudança de etapa há **mais de dez dias corridos** ficam destacados e podem ser filtrados. Editar texto não reinicia esse prazo; avançar ou retomar reinicia.
- Vendedor ou administrador pode registrar desistência com motivo, desde que não exista negociação ativa. O dossiê continua consultável e bloqueia a publicação enquanto desistido. A retomada volta à etapa anterior, mantendo o motivo antigo no histórico.
- Edição dos dados somente antes da perícia e enquanto ativo. Dossiê publicado não pode ser alterado ou desistido. Toda alteração registra autor, data, observação e versões; não há exclusão física pela aplicação.

Para demonstrar: abra **Dossiês de onboarding**, crie um dossiê, edite e consulte o histórico, registre desistência e retomada; como administrador, avance as etapas. Emita laudo e passaporte como perito e conclua pela curadoria. A suíte automatizada simula a passagem de onze dias somente sobre registros E2E para demonstrar o filtro de parados.

**RFC15 — Meu Health Score:** o próprio comprador, vendedor ou perito vê a pontuação nos últimos 30 dias, de 0 a 100, e os sinais que a compõem. Configuração inicial: até 40 pontos por dias com login (40 × mínimo(dias/3, 1)); 30 por uso de passaporte ou laudo; 30 por uso do fluxo principal. Os sinais são eventos reais, não caixas marcadas manualmente.

- Uso de passaporte: consulta, emissão ou atualização do passaporte; consulta ou assinatura de laudo.
- Fluxo principal do vendedor: cadastrar peça, gerar link de passaporte ou aceitar proposta.
- Fluxo principal do comprador: salvar peça na lista, cadastrar/atualizar coleção ou confirmar a compra após conferência.
- Fluxo principal do perito: assinar laudo ou emitir passaporte.
- Faixas iniciais: risco abaixo de 40; atenção de 40 até menos de 70; saudável a partir de 70. A pontuação serve para acompanhar participação e não bloqueia direitos ou transações.

**RF03 — Administrador → Saúde da base:** consulta por período (até 366 dias), perfil e coorte (mês do cadastro), com total de contas, contas com login, média e distribuição por perfil/faixa. Períodos usam o horário de Brasília e incluem ambos os extremos. Contas sem eventos contam com pontuação zero; uma seleção sem contas exibe média sem base. Administradores não entram na base de clientes. O relatório só devolve agregados, mantendo a restrição do RNF06 sobre eventos individuais.

O administrador ajusta pesos (soma obrigatória de 100), meta de dias e limites das faixas com justificativa. As versões ficam no histórico. Uma consulta recalcula o período com a regra **vigente**, não simula um snapshot histórico da regra antiga. Os parâmetros iniciais acima concretizam a proposta de implementação aprovada pelo solicitante para RFC14/RFC15/RF03. A fórmula e os parâmetros devem constar na atualização do DRE.

**RFC15 — Planos de recuperação:** em Saúde da base, abra o acompanhamento e cadastre cliente, administrador responsável, objetivo e prazo. Há no máximo um plano ativo por cliente. Adicione ações com descrição e prazo dentro do prazo do plano; ambos devem ser hoje ou futuros no cadastro. O administrador pode revisar registros abertos, preservando versões. O cliente vê somente o próprio plano e pode iniciar/concluir ações com resultado; somente administradores cadastram, editam, cancelam ou encerram planos.

Para concluir o plano, exige ao menos uma ação concluída e nenhuma ação aberta. Cancelar exige motivo e cancela as ações abertas na mesma transação, preservando todas no histórico. Registros encerrados não permitem novas alterações; é possível abrir outro plano. Ações vencidas são destacadas. O plano não altera artificialmente a pontuação de saúde: os eventos reais continuam sendo a fonte do cálculo.

**RF03 — Acompanhamento e resultados:** os mesmos filtros de período, perfil e coorte selecionam a base de clientes dos indicadores adicionais:

- Planos, ações e dossiês: selecionados pela data de criação, agrupados pela situação atual. Dossiês parados e ações atrasadas são avaliados no momento da consulta.
- Conferências: selecionadas pela data da conferência. Cada transação conta uma vez, mesmo quando comprador e vendedor pertencem à base selecionada. Aprovadas são as vendas confirmadas atualmente; o painel separa aprovadas sem disputa e conferências que tiveram contestação, inclusive após resolução.
- Disputas por motivo: categorias autenticidade, conservação, documentação, entrega e outro. O relatório nunca devolve justificativas livres, nomes ou histórico individual. Disputas legadas ficam em outro, sem inferir categoria pelo texto.
- Tempo até publicação: média de dias entre cadastro da peça e primeira publicação registrada. Republicar não reinicia a contagem. A migração aproveita o primeiro evento de publicação existente; na ausência dele, usa a data legada da peça e identifica esses registros no total. Sem evidência temporal válida, a peça não entra na média. A medida legada pode refletir uma republicação anterior à migração e não prova a data original.
- Sem base, médias e taxas permanecem nulas e a interface exibe “Sem base”. Planos e dossiês individuais só ficam disponíveis nas telas operacionais aos participantes autorizados; o relatório permanece agregado.

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
| RFC14 | Primeiros passos e Dossiês; seis etapas, parados, desistência e publicação | `clientes.test.js`, `cs.test.js` |
| RFC15 / RF03 | Health Score, planos e ações de recuperação, indicadores operacionais | `clientes.test.js`, `cs.test.js` |
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
npx mocha tests/e2e/cs.test.js
npm run test:e2e:release4
# Regressão cumulativa completa
npm run test:e2e
```

Para mostrar o navegador ao professor, defina `$env:E2E_HEADLESS = 'false'` no terminal antes de executar. Os testes criam registros E2E e os removem ao final no ambiente de desenvolvimento. Não execute as suítes em paralelo nem contra produção.

Veja os resultados e a revisão validada na [evidência da execução por arquivo](VALIDACAO_RELEASE4.md).

## Fechamento acadêmico

O grupo ainda precisa anexar o resultado real de homologação, atualizar cronograma/percentuais, DRE, Status Report, custos efetivamente incorridos e avaliação dos riscos. A evidência de teste é vinculada ao commit validado. A tag deve apontar para a revisão integrada e aprovada pelo grupo. Nenhum percentual, entrevista, aceite do cliente ou execução de experimento é inventado pelo sistema.
