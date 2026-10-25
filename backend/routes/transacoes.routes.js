const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
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
  canceladaEm: item.cancelada_em
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

// POST /api/transacoes/:id/confirmar - Vendedor confirma a venda e o passaporte é atualizado (RFS15)
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

module.exports = router;
