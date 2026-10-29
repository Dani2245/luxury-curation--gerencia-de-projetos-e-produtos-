const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { handleDbError } = require('../utils/db-error');
const { idParams, createCustodiaSchema, moveCustodiaSchema, closeCustodiaSchema, listCustodiasSchema } = require('../schemas/operacao.schema');

router.use(authenticate, authorize('Administrador'));
router.get('/pecas', async (req, res) => {
  const { data, error } = await req.db.from('vw_pecas').select('id, nome, categoria').order('nome');
  if (error) return handleDbError(res, error, 'Erro ao consultar peças');
  res.json(data);
});
router.get('/', validate(listCustodiasSchema, 'query'), async (req, res) => {
  const { peca, local, status } = req.query;
  let query = req.db.from('vw_custodias').select('*').order('entrada_em', { ascending: false }).order('id', { ascending: false });
  if (peca) query = /^\d+$/.test(peca) ? query.eq('peca_id', peca) : query.ilike('peca_nome', `%${peca}%`);
  if (local) query = query.ilike('local', `%${local}%`);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return handleDbError(res, error, 'Erro ao consultar custódias');
  res.json(data);
});
router.get('/:id/historico', validate(idParams, 'params'), async (req, res) => {
  const { data, error } = await req.db.from('custodia_movimentacoes').select('*, perfis(nome)').eq('custodia_id', req.params.id).order('id');
  if (error) return handleDbError(res, error, 'Erro ao consultar histórico');
  res.json(data);
});
router.post('/', validate(createCustodiaSchema), async (req, res) => {
  const b = req.body;
  const { data: id, error } = await req.db.rpc('registrar_custodia', { p_peca_id: b.pecaId, p_tipo_local: b.tipoLocal, p_local: b.local, p_entrada: b.entradaEm, p_responsavel: b.responsavel });
  if (error) return handleDbError(res, error, 'Erro ao registrar custódia');
  res.status(201).json({ id });
});
router.patch('/:id', validate(idParams, 'params'), validate(moveCustodiaSchema), async (req, res) => {
  const { error } = await req.db.rpc('mover_custodia', { p_id: req.params.id, p_tipo_local: req.body.tipoLocal, p_local: req.body.local, p_observacao: req.body.observacao ?? null });
  if (error) return handleDbError(res, error, 'Erro ao mover custódia');
  res.sendStatus(204);
});
router.post('/:id/saida', validate(idParams, 'params'), validate(closeCustodiaSchema), async (req, res) => {
  const { error } = await req.db.rpc('encerrar_custodia', { p_id: req.params.id, p_saida: req.body.saidaEm, p_motivo: req.body.motivo });
  if (error) return handleDbError(res, error, 'Erro ao registrar saída');
  res.sendStatus(204);
});
module.exports = router;
