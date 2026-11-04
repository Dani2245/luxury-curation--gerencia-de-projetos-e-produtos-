const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { idParams } = require('../schemas/operacao.schema');
const { categoriaSchema } = require('../schemas/release3.schema');
const { handleDbError } = require('../utils/db-error');
router.use(authenticate);
router.get('/', async (req, res) => {
  const { data, error } = await req.db.from('categorias').select('*').order('id');
  if (error) return handleDbError(res, error, 'Erro ao consultar categorias');
  res.json(data);
});
const save = async (req, res) => {
  const { data: id, error } = await req.db.rpc('salvar_categoria', {
    p_id: req.params.id ? Number(req.params.id) : null, p_nome: req.body.nome, p_atributos: req.body.atributos
  });
  if (error) return handleDbError(res, error, 'Erro ao salvar categoria');
  const result = await req.db.from('categorias').select('*').eq('id', id).single();
  if (result.error) return handleDbError(res, result.error, 'Erro ao consultar categoria');
  res.status(req.params.id ? 200 : 201).json(result.data);
};
router.post('/', authorize('Administrador'), validate(categoriaSchema), save);
router.put('/:id', authorize('Administrador'), validate(idParams, 'params'), validate(categoriaSchema), save);
router.delete('/:id', authorize('Administrador'), validate(idParams, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('remover_categoria', { p_id: Number(req.params.id) });
  if (error) return handleDbError(res, error, 'Erro ao remover categoria');
  res.sendStatus(204);
});
module.exports = router;
