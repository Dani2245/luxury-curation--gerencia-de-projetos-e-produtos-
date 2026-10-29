const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { handleDbError } = require('../utils/db-error');
const { idParams, transactionReportSchema, financialReportSchema, createLancamentoSchema, changeLancamentoSchema } = require('../schemas/operacao.schema');

router.use(authenticate, authorize('Administrador'));
router.get('/transacoes', validate(transactionReportSchema, 'query'), async (req, res) => {
  const q = req.query;
  const { data, error } = await req.db.rpc('relatorio_transacoes', { p_inicio: q.dataInicial, p_fim: q.dataFinal, p_categoria: q.categoria ?? null, p_status: q.status ?? null });
  if (error) return handleDbError(res, error, 'Erro ao emitir relatório de transações');
  res.json(data);
});
router.get('/financeiro', validate(financialReportSchema, 'query'), async (req, res) => {
  const q = req.query;
  const { data, error } = await req.db.rpc('relatorio_financeiro', { p_inicio: q.dataInicial, p_fim: q.dataFinal, p_tipo: q.tipo ?? null, p_categoria: q.categoria ?? null });
  if (error) return handleDbError(res, error, 'Erro ao emitir relatório financeiro');
  res.json(data);
});
router.get('/pagamentos', async (req, res) => {
  const { data, error } = await req.db.rpc('resumo_pagamentos_retidos');
  if (error) return handleDbError(res, error, 'Erro ao consultar pagamentos retidos');
  res.json(data);
});
router.post('/lancamentos', validate(createLancamentoSchema), async (req, res) => {
  const b = req.body;
  const { data: id, error } = await req.db.rpc('criar_lancamento', {
    p_tipo: b.tipo, p_categoria: b.categoria, p_descricao: b.descricao, p_valor: b.valor, p_competencia: b.competencia, p_vencimento: b.vencimento
  });
  if (error) return handleDbError(res, error, 'Erro ao registrar lançamento');
  res.status(201).json({ id });
});
router.patch('/lancamentos/:id', validate(idParams, 'params'), validate(changeLancamentoSchema), async (req, res) => {
  const { error } = await req.db.rpc('alterar_lancamento', { p_id: req.params.id, p_acao: req.body.acao, p_motivo: req.body.motivo ?? null });
  if (error) return handleDbError(res, error, 'Erro ao alterar lançamento');
  res.sendStatus(204);
});
router.get('/lancamentos/:id/historico', validate(idParams, 'params'), async (req, res) => {
  const { data, error } = await req.db.from('financeiro_eventos').select('*, perfis(nome)').eq('lancamento_id', req.params.id).order('id');
  if (error) return handleDbError(res, error, 'Erro ao consultar histórico financeiro');
  res.json(data);
});
module.exports = router;
