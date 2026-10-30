const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const {
  idParams, experimentoSchema, experimentosQuerySchema, indicadorSchema, indicadoresQuerySchema, ativoSchema, painelQuerySchema
} = require('../schemas/growth.schema');

const formatExperimento = (item) => ({
  id: item.id,
  titulo: item.titulo,
  hipotese: item.hipotese,
  etapa: item.etapa,
  indicador: item.indicador,
  impacto: item.impacto,
  confianca: item.confianca,
  facilidade: item.facilidade,
  ice: Number(item.ice),
  criterioSucesso: item.criterio_sucesso,
  status: item.status,
  resultado: item.resultado,
  decisao: item.decisao,
  concluidoEm: item.concluido_em,
  atualizadoEm: item.atualizado_em
});

const num = (v) => (v === null || v === undefined ? null : Number(v));
const formatIndicador = (item) => ({
  id: item.id,
  codigo: item.codigo,
  nome: item.nome,
  etapa: item.etapa,
  lado: item.lado,
  formula: item.formula,
  formulaDescricao: item.formula_descricao,
  unidade: item.unidade,
  metaMin: num(item.meta_min),
  metaMax: num(item.meta_max),
  frequencia: item.frequencia,
  ativo: item.ativo,
  ultimoValor: num(item.ultimo_valor),
  ultimoPeriodo: item.ultimo_inicio ? { inicio: item.ultimo_inicio, fim: item.ultimo_fim } : null,
  situacao: item.situacao,
  alteracoesMeta: Number(item.alteracoes_meta)
});

// Experimentos, indicadores e painel de growth são do administrador (RFC19, RFC20 e RF04)
router.use(authenticate, authorize('Administrador'));

// ---- RFC20: experimentos de growth
// GET /api/growth/experimentos - Backlog ordenado pelo ICE Score, com filtro por etapa e status (RFS70)
router.get('/experimentos', validate(experimentosQuerySchema, 'query'), async (req, res) => {
  let query = req.db.from('experimentos').select('*').order('ice', { ascending: false }).order('titulo');
  if (req.query.etapa) query = query.eq('etapa', req.query.etapa);
  if (req.query.status) query = query.eq('status', req.query.status);
  const { data, error } = await query;
  if (error) return handleDbError(res, error, 'Erro ao consultar experimentos');
  res.json(data.map(formatExperimento));
});

const salvarExperimento = (db, id, b) => db.rpc('salvar_experimento', {
  p_id: id, p_titulo: b.titulo, p_hipotese: b.hipotese, p_etapa: b.etapa, p_indicador: b.indicador,
  p_impacto: b.impacto, p_confianca: b.confianca, p_facilidade: b.facilidade, p_criterio: b.criterioSucesso,
  p_status: b.status, p_resultado: b.resultado ?? null, p_decisao: b.decisao ?? null
});

// POST /api/growth/experimentos - Registra o experimento; o ICE Score é calculado (RFS69)
router.post('/experimentos', validate(experimentoSchema), async (req, res) => {
  const { data: id, error } = await salvarExperimento(req.db, null, req.body);
  if (error) return handleDbError(res, error, 'Erro ao registrar o experimento');
  const { data } = await req.db.from('experimentos').select('*').eq('id', id).single();
  res.status(201).json(formatExperimento(data));
});

// PUT /api/growth/experimentos/:id - Notas, status, resultado e decisão (RFS71)
router.put('/experimentos/:id', validate(idParams, 'params'), validate(experimentoSchema), async (req, res) => {
  const { error } = await salvarExperimento(req.db, Number(req.params.id), req.body);
  if (error) return handleDbError(res, error, 'Erro ao atualizar o experimento');
  const { data } = await req.db.from('experimentos').select('*').eq('id', req.params.id).single();
  res.json(formatExperimento(data));
});

// DELETE /api/growth/experimentos/:id - Só experimentos em backlog (RFS72)
router.delete('/experimentos/:id', validate(idParams, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('remover_experimento', { p_id: Number(req.params.id) });
  if (error) return handleDbError(res, error, 'Erro ao excluir o experimento');
  res.sendStatus(204);
});

// ---- RFC19: indicadores de growth
// GET /api/growth/formulas - Fórmulas calculadas a partir dos eventos de uso
router.get('/formulas', async (req, res) => {
  const { data, error } = await req.db.from('indicador_formulas').select('*').order('chave');
  if (error) return handleDbError(res, error, 'Erro ao consultar fórmulas');
  res.json(data);
});

// GET /api/growth/indicadores - Por etapa e lado, com o último valor e o status em relação à meta (RFS66)
router.get('/indicadores', validate(indicadoresQuerySchema, 'query'), async (req, res) => {
  let query = req.db.from('vw_indicadores').select('*').order('etapa').order('codigo');
  if (req.query.etapa) query = query.eq('etapa', req.query.etapa);
  if (req.query.lado) query = query.eq('lado', req.query.lado);
  const { data, error } = await query;
  if (error) return handleDbError(res, error, 'Erro ao consultar indicadores');
  res.json(data.map(formatIndicador));
});

const salvarIndicador = (db, id, b) => db.rpc('salvar_indicador', {
  p_id: id, p_codigo: b.codigo, p_nome: b.nome, p_etapa: b.etapa, p_lado: b.lado, p_formula: b.formula,
  p_meta_min: b.metaMin ?? null, p_meta_max: b.metaMax ?? null, p_frequencia: b.frequencia
});
const fetchIndicador = async (db, id) => (await db.from('vw_indicadores').select('*').eq('id', id).single()).data;

// POST /api/growth/indicadores (RFS65)
router.post('/indicadores', validate(indicadorSchema), async (req, res) => {
  const { data: id, error } = await salvarIndicador(req.db, null, req.body);
  if (error) return handleDbError(res, error, 'Erro ao cadastrar o indicador');
  res.status(201).json(formatIndicador(await fetchIndicador(req.db, id)));
});

// PUT /api/growth/indicadores/:id - Fórmula, metas e frequência, guardando o histórico das metas (RFS67)
router.put('/indicadores/:id', validate(idParams, 'params'), validate(indicadorSchema), async (req, res) => {
  const { error } = await salvarIndicador(req.db, Number(req.params.id), req.body);
  if (error) return handleDbError(res, error, 'Erro ao atualizar o indicador');
  res.json(formatIndicador(await fetchIndicador(req.db, req.params.id)));
});

// GET /api/growth/indicadores/:id/historico - Metas anteriores e valores medidos
router.get('/indicadores/:id/historico', validate(idParams, 'params'), async (req, res) => {
  const [metas, medicoes] = await Promise.all([
    req.db.from('indicador_metas_historico').select('*').eq('indicador_id', req.params.id).order('vigente_ate', { ascending: false }),
    req.db.from('indicador_medicoes').select('*').eq('indicador_id', req.params.id).order('medido_em', { ascending: false }).limit(20)
  ]);
  const error = metas.error || medicoes.error;
  if (error) return handleDbError(res, error, 'Erro ao consultar o histórico do indicador');
  res.json({ metas: metas.data, medicoes: medicoes.data });
});

// PATCH /api/growth/indicadores/:id/ativo - Desativa preservando os valores medidos (RFS68)
router.patch('/indicadores/:id/ativo', validate(idParams, 'params'), validate(ativoSchema), async (req, res) => {
  const { error } = await req.db.rpc('definir_indicador_ativo', { p_id: Number(req.params.id), p_ativo: req.body.ativo });
  if (error) return handleDbError(res, error, 'Erro ao alterar o indicador');
  res.json(formatIndicador(await fetchIndicador(req.db, req.params.id)));
});

// ---- RF04: painel de indicadores de growth
router.get('/painel', validate(painelQuerySchema, 'query'), async (req, res) => {
  const q = req.query;
  const { data, error } = await req.db.rpc('painel_growth', {
    p_inicio: q.dataInicial, p_fim: q.dataFinal, p_etapa: q.etapa ?? null, p_lado: q.lado ?? null
  });
  if (error) return handleDbError(res, error, 'Erro ao emitir o painel de growth');
  res.json(data);
});

// ---- RF05: relatório de indicadores do hábito, por coorte
const { habitoQuerySchema } = require('../schemas/habito.schema');
router.get('/habito', validate(habitoQuerySchema, 'query'), async (req, res) => {
  const q = req.query;
  const { data, error } = await req.db.rpc('relatorio_habito', { p_inicio: q.dataInicial, p_fim: q.dataFinal, p_perfil: q.perfil, p_coorte: q.coorte ?? null });
  if (error) return handleDbError(res, error, 'Erro ao emitir o relatório do hábito');
  res.json(data);
});

module.exports = router;
