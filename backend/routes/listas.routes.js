const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const {
  createListaSchema,
  updateListaSchema,
  salvarPecaSchema,
  listaIdParamSchema,
  listaPecaParamSchema
} = require('../schemas/lista.schema');

const toNumberOrNull = (val) => (val === null || val === undefined ? null : Number(val));

const formatLista = (item) => ({
  id: item.id,
  nome: item.nome,
  categorias: item.categorias || [],
  valorMin: toNumberOrNull(item.valor_min),
  valorMax: toNumberOrNull(item.valor_max),
  pecasIds: (item.pecas_ids || []).map(Number),
  compativeis: Number(item.compativeis),
  novas: Number(item.novas),
  alertaId: item.alerta_id,
  criadoEm: item.criado_em,
  atualizadoEm: item.atualizado_em
});

const fetchLista = (db, id) => db.from('vw_listas_desejos').select('*').eq('id', id).maybeSingle();

const comprador = [authenticate, authorize('Comprador')];

// GET /api/listas - Listas de desejos do comprador, com peças salvas, compatíveis e novas (RFS78)
router.get('/', ...comprador, async (req, res) => {
  const { data, error } = await req.db.from('vw_listas_desejos').select('*').order('criado_em', { ascending: false });
  if (error) return handleDbError(res, error, 'Erro ao consultar as listas de desejos');

  res.json(data.map(formatLista));
});

// GET /api/listas/demanda - Demanda agregada, sem identificar o comprador (RFS78, Administrador)
router.get('/demanda', authenticate, authorize('Administrador'), async (req, res) => {
  const [demanda, maisSalvas] = await Promise.all([
    req.db.rpc('demanda_listas_desejos'),
    req.db.rpc('pecas_mais_salvas', { p_limite: 5 })
  ]);
  const failed = [demanda, maisSalvas].find((r) => r.error);
  if (failed) return handleDbError(res, failed.error, 'Erro ao consultar a demanda das listas de desejos');

  res.json({
    categorias: demanda.data.map((d) => ({
      categoria: d.categoria_desejada,
      listas: Number(d.listas),
      compradores: Number(d.compradores),
      valorMinMedio: toNumberOrNull(d.valor_min_medio),
      valorMaxMedio: toNumberOrNull(d.valor_max_medio)
    })),
    pecasMaisSalvas: maisSalvas.data.map((p) => ({ nome: p.peca, categoria: p.categoria_peca, vezes: Number(p.vezes) }))
  });
});

// GET /api/listas/:id - Peças salvas e peças novas da curadoria compatíveis com a lista (RFS78)
router.get('/:id', ...comprador, validate(listaIdParamSchema, 'params'), async (req, res) => {
  const { data: lista, error } = await fetchLista(req.db, req.params.id);
  if (error) return handleDbError(res, error, 'Erro ao buscar a lista de desejos');
  if (!lista) return res.status(404).json({ message: 'Lista de desejos não encontrada' });

  const [salvas, compativeis] = await Promise.all([
    req.db.from('vw_lista_desejos_pecas').select('*').eq('lista_id', lista.id).order('salva_em', { ascending: false }),
    req.db.rpc('pecas_compativeis_lista', { p_lista_id: lista.id })
  ]);
  const failed = [salvas, compativeis].find((r) => r.error);
  if (failed) return handleDbError(res, failed.error, 'Erro ao consultar as peças da lista de desejos');

  res.json({
    ...formatLista(lista),
    pecasSalvas: salvas.data.map((p) => ({
      id: p.peca_id,
      nome: p.nome,
      categoria: p.categoria,
      valor: Number(p.valor),
      fotografia: p.fotografia,
      situacao: p.situacao,
      salvaEm: p.salva_em
    })),
    pecasCompativeis: compativeis.data.map((p) => ({
      id: p.peca_id,
      nome: p.nome,
      categoria: p.categoria,
      valor: Number(p.valor),
      fotografia: p.fotografia,
      publicadoEm: p.publicado_em,
      nova: p.nova
    }))
  });
});

// POST /api/listas - Criar lista por categoria e faixa de valor, ou ao salvar uma peça (RFS77)
router.post('/', ...comprador, validate(createListaSchema), async (req, res) => {
  const { nome, categorias, valorMin, valorMax, pecaId } = req.body;
  const { data: id, error } = await req.db.rpc('criar_lista_desejos', {
    p_nome: nome,
    p_categorias: categorias,
    p_valor_min: valorMin,
    p_valor_max: valorMax,
    p_peca_id: pecaId ?? null
  });
  if (error) return handleDbError(res, error, 'Erro ao criar a lista de desejos');

  const { data } = await fetchLista(req.db, id);
  res.status(201).json(formatLista(data));
});

// PUT /api/listas/:id - Alterar nome e critérios (RFS79)
router.put('/:id', ...comprador, validate(listaIdParamSchema, 'params'), validate(updateListaSchema), async (req, res) => {
  const { nome, categorias, valorMin, valorMax } = req.body;
  const { error } = await req.db.rpc('editar_lista_desejos', {
    p_id: req.params.id,
    p_nome: nome,
    p_categorias: categorias,
    p_valor_min: valorMin,
    p_valor_max: valorMax
  });
  if (error) return handleDbError(res, error, 'Erro ao atualizar a lista de desejos');

  const { data } = await fetchLista(req.db, req.params.id);
  res.json(formatLista(data));
});

// POST /api/listas/:id/pecas - Incluir uma peça consultada (RFS79)
router.post('/:id/pecas', ...comprador, validate(listaIdParamSchema, 'params'), validate(salvarPecaSchema), async (req, res) => {
  const { error } = await req.db.rpc('salvar_peca_lista', { p_lista_id: req.params.id, p_peca_id: req.body.pecaId });
  if (error) return handleDbError(res, error, 'Erro ao salvar a peça na lista de desejos');

  const { data } = await fetchLista(req.db, req.params.id);
  res.status(201).json(formatLista(data));
});

// DELETE /api/listas/:id/pecas/:pecaId - Retirar uma peça da lista (RFS79)
router.delete('/:id/pecas/:pecaId', ...comprador, validate(listaPecaParamSchema, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('remover_peca_lista', { p_lista_id: req.params.id, p_peca_id: req.params.pecaId });
  if (error) return handleDbError(res, error, 'Erro ao retirar a peça da lista de desejos');

  res.status(204).send();
});

// DELETE /api/listas/:id - Excluir a lista e os alertas vinculados (RFS80)
router.delete('/:id', ...comprador, validate(listaIdParamSchema, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('remover_lista_desejos', { p_id: req.params.id });
  if (error) return handleDbError(res, error, 'Erro ao excluir a lista de desejos');

  res.status(204).send();
});

module.exports = router;
