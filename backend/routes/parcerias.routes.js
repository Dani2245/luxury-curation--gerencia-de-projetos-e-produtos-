const router = require('express').Router();
const { z } = require('zod');
const { authenticate, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { idParams } = require('../schemas/operacao.schema');
const { handleDbError } = require('../utils/db-error');
const tipos = ['casa de leilao', 'seguradora', 'galeria'];
const schema = z.object({
  nome: z.string().trim().min(1).max(150),
  tipo: z.enum(tipos),
  contato: z.string().trim().min(1).max(200),
  dados: z.string().trim().max(2000).default(''),
  condicoes: z.string().trim().min(1).max(2000),
});
router.use(authenticate, authorize('Administrador'));
router.get(
  '/',
  validate(
    z.object({
      nome: z.string().trim().max(150).optional(),
      tipo: z.enum([...tipos, '']).optional(),
      status: z.enum(['ativa', 'encerrada', '']).optional(),
    }),
    'query',
  ),
  async (req, res) => {
    let q = req.db.from('parcerias').select('*').order('nome').order('id');
    if (req.query.nome) q = q.ilike('nome', `%${req.query.nome}%`);
    if (req.query.tipo) q = q.eq('tipo', req.query.tipo);
    if (req.query.status === 'ativa') q = q.is('encerrada_em', null);
    if (req.query.status === 'encerrada') q = q.not('encerrada_em', 'is', null);
    const { data, error } = await q;
    if (error) return handleDbError(res, error, 'Erro ao consultar parcerias');
    res.json(data);
  },
);
router.get('/:id/historico', validate(idParams, 'params'), async (req, res) => {
  const { data, error } = await req.db
    .from('parceria_historico')
    .select('*')
    .eq('parceria_id', req.params.id)
    .order('id');
  if (error) return handleDbError(res, error, 'Erro ao consultar histórico');
  res.json(data);
});
const save = async (req, res) => {
  const b = req.body;
  const { data: id, error } = await req.db.rpc('salvar_parceria', {
    p_id: req.params.id || null,
    p_nome: b.nome,
    p_tipo: b.tipo,
    p_contato: b.contato,
    p_dados: b.dados,
    p_condicoes: b.condicoes,
  });
  if (error) return handleDbError(res, error, 'Erro ao salvar parceria');
  res.status(req.params.id ? 200 : 201).json({ id });
};
router.post('/', validate(schema), save);
router.patch('/:id', validate(idParams, 'params'), validate(schema), save);
router.post(
  '/:id/encerrar',
  validate(idParams, 'params'),
  validate(z.object({ motivo: z.string().trim().min(1).max(500) })),
  async (req, res) => {
    const { error } = await req.db.rpc('encerrar_parceria', { p_id: req.params.id, p_motivo: req.body.motivo });
    if (error) return handleDbError(res, error, 'Erro ao encerrar parceria');
    res.sendStatus(204);
  },
);
module.exports = router;
