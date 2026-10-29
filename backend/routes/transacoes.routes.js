const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const { idParams, envioSchema, conferenciaSchema, resolucaoSchema } = require('../schemas/operacao.schema');
const {
  createTransacaoSchema,
  listTransacoesQuerySchema,
  transacaoIdParamSchema,
  cancelarTransacaoSchema
} = require('../schemas/transacao.schema');

const formatTransacao = (item, perfil) => ({
  id: item.id,
  pecaId: item.peca_id,
  pecaNome: item.peca_nome,
  categoria: item.categoria,
  comprador: { id: item.comprador_id, nome: item.comprador_nome },
  vendedor: { id: item.vendedor_id, nome: item.vendedor_nome },
  valor: Number(item.valor),
  status: item.status,
  // a comissão da plataforma não é exibida ao comprador
  comissao: perfil === 'Comprador' || item.comissao === null ? null : Number(item.comissao),
  motivoCancelamento: item.motivo_cancelamento,
  transferenciaPendente: item.transferencia_pendente,
  criadoEm: item.criado_em,
  confirmadaEm: item.confirmada_em,
  canceladaEm: item.cancelada_em,
  aceitaEm: item.aceita_em,
  enviadaEm: item.enviada_em,
  recebidaEm: item.recebida_em,
  conferidaEm: item.conferida_em,
  rastreio: item.rastreio,
  motivoContestacao: item.motivo_contestacao,
  resolucao: item.resolucao,
  resolvidaEm: item.resolvida_em,
  pagamentoStatus: item.pagamento_status,
  retidoEm: item.retido_em,
  liberadoEm: item.liberado_em,
  estornadoEm: item.estornado_em,
  repasse: perfil === 'Comprador' || item.repasse == null ? null : Number(item.repasse)
});

const fetchTransacao = (db, id) => db.from('vw_transacoes').select('*').eq('id', id).maybeSingle();

// GET /api/transacoes - Consultar por peça, comprador, vendedor ou período (RFS14)
router.get(
  '/',
  authenticate,
  authorize('Comprador', 'Vendedor', 'Administrador'),
  validate(listTransacoesQuerySchema, 'query'),
  async (req, res) => {
    const { peca, comprador, vendedor, dataInicial, dataFinal, status } = req.query;

    // a view já restringe: comprador e vendedor veem só as próprias; administrador, todas
    let query = req.db.from('vw_transacoes').select('*').order('criado_em', { ascending: false });
    if (peca) query = /^\d+$/.test(peca) ? query.eq('peca_id', Number(peca)) : query.ilike('peca_nome', `%${peca}%`);
    if (comprador) query = query.ilike('comprador_nome', `%${comprador}%`);
    if (vendedor) query = query.ilike('vendedor_nome', `%${vendedor}%`);
    if (dataInicial) query = query.gte('criado_em', `${dataInicial}T00:00:00-03:00`);
    if (dataFinal) query = query.lte('criado_em', `${dataFinal}T23:59:59.999-03:00`);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return handleDbError(res, error, 'Erro ao consultar transações');

    res.json(data.map((item) => formatTransacao(item, req.user.perfil)));
  }
);

// POST /api/transacoes - Registrar proposta de compra (RFS13)
router.post(
  '/',
  authenticate,
  authorize('Comprador', 'Administrador'),
  validate(createTransacaoSchema),
  async (req, res) => {
    const { pecaId, valor, compradorId } = req.body;

    const { data: id, error } = await req.db.rpc('inserir_transacao', {
      p_peca_id: pecaId,
      p_valor: valor,
      p_comprador_id: compradorId ?? null
    });
    if (error) return handleDbError(res, error, 'Erro ao registrar a proposta');

    const { data } = await fetchTransacao(req.db, id);
    res.status(201).json(formatTransacao(data, req.user.perfil));
  }
);

// POST /api/transacoes/:id/confirmar - Aceita a proposta; conferencia conclui a venda (RFC12/RFC13).
router.post(
  '/:id/confirmar',
  authenticate,
  authorize('Vendedor'),
  validate(transacaoIdParamSchema, 'params'),
  async (req, res) => {
    const { error } = await req.db.rpc('confirmar_transacao', { p_id: req.params.id });
    if (error) return handleDbError(res, error, 'Erro ao confirmar a venda');

    const { data } = await fetchTransacao(req.db, req.params.id);
    res.json(formatTransacao(data, req.user.perfil));
  }
);

// POST /api/transacoes/:id/cancelar - Comprador ou vendedor cancelam transação não confirmada (RFS16)
router.post(
  '/:id/cancelar',
  authenticate,
  authorize('Comprador', 'Vendedor'),
  validate(transacaoIdParamSchema, 'params'),
  validate(cancelarTransacaoSchema),
  async (req, res) => {
    const { error } = await req.db.rpc('cancelar_transacao', { p_id: req.params.id, p_motivo: req.body.motivo ?? null });
    if (error) return handleDbError(res, error, 'Erro ao cancelar a transação');

    const { data } = await fetchTransacao(req.db, req.params.id);
    res.json(formatTransacao(data, req.user.perfil));
  }
);

// Cada transicao tambem valida o participante e o estado no banco, sob bloqueio da transacao.
const transition = (rpc, params) => async (req, res) => {
  const { error } = await req.db.rpc(rpc, { p_id: req.params.id, ...params(req.body) });
  if (error) return handleDbError(res, error, 'Erro ao atualizar a transação');
  const { data, error: readError } = await fetchTransacao(req.db, req.params.id);
  if (readError) return handleDbError(res, readError, 'Erro ao consultar a transação atualizada');
  res.json(formatTransacao(data, req.user.perfil));
};
router.post('/:id/pagamento', authenticate, authorize('Comprador'), validate(idParams, 'params'),
  transition('reter_pagamento_simulado', () => ({})));
router.post('/:id/envio', authenticate, authorize('Vendedor'), validate(idParams, 'params'), validate(envioSchema),
  transition('registrar_envio', (b) => ({ p_rastreio: b.rastreio })));
router.post('/:id/recebimento', authenticate, authorize('Comprador'), validate(idParams, 'params'),
  transition('receber_entrega', () => ({})));
router.post('/:id/conferencia', authenticate, authorize('Comprador'), validate(idParams, 'params'), validate(conferenciaSchema),
  transition('conferir_entrega', (b) => ({ p_aprovada: b.aprovada, p_motivo: b.motivo ?? null })));
router.post('/:id/resolucao', authenticate, authorize('Administrador'), validate(idParams, 'params'), validate(resolucaoSchema),
  transition('resolver_contestacao', (b) => ({ p_decisao: b.decisao, p_motivo: b.motivo })));
router.get('/:id/historico', authenticate, authorize('Comprador', 'Vendedor', 'Administrador'), validate(idParams, 'params'), async (req, res) => {
  const { data: transacao, error: transacaoError } = await fetchTransacao(req.db, req.params.id);
  if (transacaoError) return handleDbError(res, transacaoError, 'Erro ao consultar a transação');
  if (!transacao) return res.status(404).json({ message: 'Transação não encontrada' });
  const { data, error } = await req.db.from('transacao_eventos').select('id, situacao, descricao, criado_em').eq('transacao_id', req.params.id).order('id');
  if (error) return handleDbError(res, error, 'Erro ao consultar o histórico');
  res.json(data);
});

module.exports = router;
