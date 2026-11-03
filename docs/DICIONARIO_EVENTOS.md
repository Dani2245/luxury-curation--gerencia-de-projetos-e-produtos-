# Dicionário de eventos — Release 3

Fonte: `backend/database/schema-rnf06-rfc16.sql` e migrações seguintes. O banco registra os eventos das operações bem-sucedidas; o cliente não escolhe livremente tipos ou autores. O administrador consulta totais agregados, sem acesso direto a `eventos_uso`.

## Campos comuns

| Campo | Significado |
| --- | --- |
| `tipo` | Nome do comportamento registrado. |
| `usuario_id` | Usuário autenticado; nulo na consulta pública. |
| `criado_em` | Instante do registro no servidor. Relatórios usam datas de Brasília. |
| `origem` | `plataforma`, `link`, `qr`, `alerta` ou `email`. |
| `gatilho_externo` | Verdadeiro para link, QR, alerta ou e-mail. Não comprova envio de e-mail: esse canal ainda não é implementado. |
| `peca_id`, `passaporte_id`, `link_id` | Entidades envolvidas, quando aplicáveis. |
| `dados` | Metadados mínimos do evento; sem pareceres, arquivos ou identidade dos proprietários. |

## Eventos e significado

| Evento | Momento e dados relevantes |
| --- | --- |
| `sessao_inicio` | Login concluído; origem da entrada. |
| `peca_cadastrada` | Cadastro de peça pelo vendedor. Não significa publicação. |
| `anuncio_publicado`, `anuncio_rejeitado` | Decisão da curadoria. |
| `passaporte_emissao`, `passaporte_atualizacao`, `passaporte_transferencia`, `passaporte_privacidade` | Alterações correspondentes no histórico do passaporte. |
| `passaporte_consulta` | Consulta autenticada, deduplicada por usuário/passaporte por 30 minutos; `dono` informa se era o proprietário. |
| `passaporte_consulta_link` | Abertura de link ou QR, inclusive por visitante. Cada acesso é registrado. |
| `link_gerado`, `link_editado`, `link_revogado` | Ações do proprietário sobre o compartilhamento. |
| `transacao_proposta`, `transacao_aceita`, `transacao_paga`, `transacao_enviada`, `transacao_em_conferencia`, `transacao_contestada`, `transacao_confirmada`, `transacao_cancelada` | Proposta ou mudança de estado; `transacao_id`. Pagamentos são simulados. |
| `lista_desejos_criada`, `lista_desejos_editada`, `lista_desejos_removida`, `peca_salva` | Gestão da lista e salvamento de peças. |
| `alerta_criado`, `alerta_editado`, `alerta_reativado`, `alerta_desativado`, `alerta_removido` | Configuração dos alertas; identificador/tipo/estado conforme a operação. |
| `alerta_enviado`, `alerta_aberto` | Notificação disponibilizada e aberta na plataforma. |
| `lista_espera_inscricao` | Inscrição consentida, versão da página e origem. |
| `indicacao_enviada`, `conta_criada` | Indicação e criação de conta; origem e relação com indicação, quando houver. |
| `colecao_item_criado`, `colecao_item_atualizado`, `avaliacao_criada` | Investimento na coleção ou avaliação de uma transação concluída. |
| `laudo_assinado`, `laudo_corrigido` | Emissão/correção do laudo estruturado; `laudo_id`. Atualiza a assinatura. |
| `laudo_vinculado` | Inclusão do laudo no passaporte; `laudo_id`. Renovação da assinatura do passaporte e preservação do laudo. |
| `laudo_removido` | Remoção de laudo ainda não vinculado; `laudo_id`. |
| `laudo_consulta` | Abertura explícita de um laudo na tela do passaporte; deduplicada por usuário/laudo por 30 minutos. |
| `growth_evidencia_registrada` | Registro administrativo do resultado observado; experimento, evidência e marca de demonstração. Não significa sucesso do experimento. |

## Fórmulas corrigidas na release 3

- **A5:** quantidade de peritos distintos, ainda com perfil Perito, com pelo menos um laudo estruturado assinado e íntegro nos 60 dias anteriores ao final do período selecionado. A janela inclui seu início e exclui o dia seguinte ao fim, no horário de Brasília. A data informada de emissão não substitui o instante real da assinatura. Meta inicial: 3. Não conta mera edição de passaporte nem anexos antigos cujo signatário não pode ser comprovado pelo novo módulo.
- **A4:** vendedores indicados por peritos que chegaram ao diagnóstico, contando indicações distintas nas evidências X4 do período. Exclui demonstrações e registros anulados. A tela dos pilotos também mostra a razão positivos/contatos e a média de dias entre indicação e diagnóstico.
- **B1:** usuários cuja primeira abertura explícita de laudo ocorreu no período; a fonte passa a ser `laudo_consulta`, em vez de qualquer consulta de passaporte. É uma aproximação por usuário: o sistema ainda não possui uma entidade de sessão de leitura com duração.
- **X2:** um registro só é positivo se procedência, conservação, signatário e leitura sem ajuda forem todos verdadeiros.
- **X5:** inscrições de compradores em A/B e variação `(B − A) / A × 100`, no mesmo período. Sem A, a variação fica sem base de comparação. Inscrições com e-mail `e2e-...` não entram nesse painel. O grupo precisa controlar canais/exposição; o sistema não conclui causalidade.

Medições antigas já persistidas em `indicador_medicoes` são históricas. Gere novamente o período para obter as fórmulas atuais. As suítes removem as entidades de teste criadas por elas, mas eventos de login dos usuários de desenvolvimento podem permanecer nos agregados. Os números desse banco servem à demonstração e validação; não devem ser apresentados como resultados de uso por participantes reais.
