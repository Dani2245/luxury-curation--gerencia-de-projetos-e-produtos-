const router = require('express').Router();
const { z } = require('zod');
const { authenticate, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { idParams } = require('../schemas/operacao.schema');
const { handleDbError } = require('../utils/db-error');
const condicoes = z.string().trim().min(1, 'Informe as condições').max(2000);
router.use(authenticate, authorize('Administrador'));
router.get('/pecas', async (req, res) => {
  const { data, error } = await req.db
    .from('pecas')
    .select('id,nome,vendedor_id,perfis!pecas_vendedor_id_fkey(nome)')
    .eq('vendida', false)
    .order('nome');
  if (error) return handleDbError(res, error, 'Erro ao consultar peças');
  res.json(data);
});
router.get(
  '/',
  validate(
    z.object({
      peca: z.string().trim().max(200).optional(),
      status: z.enum(['em estoque', 'devolucao', 'venda', '']).optional(),
    }),
    'query',
  ),
  async (req, res) => {
    let q = req.db.from('vw_consignacoes').select('*').order('entrada_em').order('id');
    if (req.query.peca)
      q = /^\d+$/.test(req.query.peca) ? q.eq('peca_id', req.query.peca) : q.ilike('peca_nome', `%${req.query.peca}%`);
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data, error } = await q;
    if (error) return handleDbError(res, error, 'Erro ao consultar consignações');
    res.json(data);
  },
);
router.get('/:id/historico', validate(idParams, 'params'), async (req, res) => {
  const { data, error } = await req.db
    .from('consignacao_historico')
    .select('*')
    .eq('consignacao_id', req.params.id)
    .order('id');
  if (error) return handleDbError(res, error, 'Erro ao consultar histórico');
  res.json(data);
});
router.post(
  '/',
  validate(
    z.object({
      pecaId: z.coerce.number().int().positive().safe(),
      vendedorId: z.uuid(),
      entradaEm: z.iso.date(),
      condicoes,
    }),
  ),
  async (req, res) => {
    const b = req.body;
    const { data: id, error } = await req.db.rpc('registrar_consignacao', {
      p_peca: b.pecaId,
      p_vendedor: b.vendedorId,
      p_entrada: b.entradaEm,
      p_condicoes: b.condicoes,
    });
    if (error) return handleDbError(res, error, 'Erro ao registrar consignação');
    res.status(201).json({ id });
  },
);
router.patch('/:id', validate(idParams, 'params'), validate(z.object({ condicoes })), async (req, res) => {
  const { error } = await req.db.rpc('editar_consignacao', { p_id: req.params.id, p_condicoes: req.body.condicoes });
  if (error) return handleDbError(res, error, 'Erro ao editar consignação');
  res.sendStatus(204);
});
router.post(
  '/:id/devolucao',
  validate(idParams, 'params'),
  validate(z.object({ saidaEm: z.iso.date(), observacao: z.string().trim().min(1).max(500) })),
  async (req, res) => {
    const { error } = await req.db.rpc('devolver_consignacao', {
      p_id: req.params.id,
      p_saida: req.body.saidaEm,
      p_observacao: req.body.observacao,
    });
    if (error) return handleDbError(res, error, 'Erro ao devolver consignação');
    res.sendStatus(204);
  },
);
module.exports = router;
