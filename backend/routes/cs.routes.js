const router = require('express').Router();
const { z } = require('zod');
const { authenticate, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { idParams } = require('../schemas/operacao.schema');
const { handleDbError } = require('../utils/db-error');
const text = (max) => z.string().trim().min(1).max(max);
const id = z.coerce.number().int().positive().safe();
const rpc =
  (name, params, created = false) =>
  async (req, res) => {
    const { data, error } = await req.db.rpc(name, params(req));
    if (error) return handleDbError(res, error, 'Não foi possível concluir a operação');
    if (created) return res.status(201).json({ id: data });
    res.sendStatus(204);
  };
router.use(authenticate);
router.get('/pessoas', authorize('Administrador'), async (req, res) => {
  const { data, error } = await req.db.from('perfis').select('id,nome,perfil').order('nome');
  if (error) return handleDbError(res, error, 'Erro ao consultar pessoas');
  res.json(data);
});
router.get('/dossies/pecas', authorize('Administrador', 'Vendedor'), async (req, res) => {
  let q = req.db.from('pecas').select('id,nome').eq('vendida', false).neq('publicacao', 'publicada').order('nome');
  if (req.user.perfil !== 'Administrador') q = q.eq('vendedor_id', req.user.id);
  const { data, error } = await q;
  if (error) return handleDbError(res, error, 'Erro ao consultar peças');
  res.json(data);
});
router.get(
  '/dossies',
  authorize('Administrador', 'Vendedor'),
  validate(
    z.object({
      status: z.enum(['ativo', 'desistido', 'concluido', '']).optional(),
      parados: z.enum(['true', 'false', '']).optional(),
      busca: z.string().trim().max(200).optional(),
    }),
    'query',
  ),
  async (req, res) => {
    let q = req.db.from('onboarding_dossies').select('*,peca:pecas(nome)').order('etapa_em').order('id');
    if (req.query.status) q = q.eq('status', req.query.status);
    const cutoff = new Date(Date.now() - 10 * 86400000).toISOString();
    if (req.query.parados === 'true') q = q.eq('status', 'ativo').lt('etapa_em', cutoff);
    const { data, error } = await q;
    if (error) return handleDbError(res, error, 'Erro ao consultar dossiês');
    res.json(
      data
        .map((d) => ({ ...d, parado: d.status === 'ativo' && Date.parse(d.etapa_em) < Date.parse(cutoff) }))
        .filter(
          (d) =>
            !req.query.busca ||
            `${d.peca?.nome} ${d.id}`.toLocaleLowerCase('pt-BR').includes(req.query.busca.toLocaleLowerCase('pt-BR')),
        ),
    );
  },
);
router.get(
  '/dossies/:id/historico',
  authorize('Administrador', 'Vendedor'),
  validate(idParams, 'params'),
  async (req, res) => {
    const { data, error } = await req.db
      .from('onboarding_historico')
      .select('*')
      .eq('dossie_id', req.params.id)
      .order('id');
    if (error) return handleDbError(res, error, 'Erro ao consultar histórico');
    res.json(data);
  },
);
const dossier = z.object({
  pecaId: id.optional(),
  diagnostico: text(2000),
  documentacao: z.string().trim().max(4000).default(''),
});
const dossierParams = (req) => ({
  p_id: req.params.id || null,
  p_peca: req.body.pecaId || null,
  p_diagnostico: req.body.diagnostico,
  p_documentacao: req.body.documentacao,
});
router.post(
  '/dossies',
  authorize('Administrador', 'Vendedor'),
  validate(dossier.extend({ pecaId: id })),
  rpc('salvar_dossie', dossierParams, true),
);
router.put(
  '/dossies/:id',
  authorize('Administrador', 'Vendedor'),
  validate(idParams, 'params'),
  validate(dossier),
  rpc('salvar_dossie', dossierParams),
);
router.post(
  '/dossies/:id/movimentos',
  authorize('Administrador', 'Vendedor'),
  validate(idParams, 'params'),
  validate(z.object({ acao: z.enum(['avancar', 'desistir', 'retomar']), observacao: text(1000) })),
  rpc('movimentar_dossie', (req) => ({
    p_id: req.params.id,
    p_acao: req.body.acao,
    p_observacao: req.body.observacao,
  })),
);

router.get(
  '/planos',
  validate(z.object({ status: z.enum(['ativo', 'concluido', 'cancelado', '']).optional() }), 'query'),
  async (req, res) => {
    const { data, error } = await req.db.rpc('consultar_planos_recuperacao', { p_status: req.query.status || null });
    if (error) return handleDbError(res, error, 'Erro ao consultar planos');
    res.json(data);
  },
);
router.get('/planos/:id/historico', validate(idParams, 'params'), async (req, res) => {
  const { data, error } = await req.db
    .from('recuperacao_historico')
    .select('*')
    .eq('plano_id', req.params.id)
    .order('id');
  if (error) return handleDbError(res, error, 'Erro ao consultar histórico');
  res.json(data);
});
const plan = z.object({ clienteId: z.uuid(), responsavelId: z.uuid(), objetivo: text(1000), prazo: z.iso.date() });
const planParams = (req) => ({
  p_id: req.params.id || null,
  p_cliente: req.body.clienteId,
  p_responsavel: req.body.responsavelId,
  p_objetivo: req.body.objetivo,
  p_prazo: req.body.prazo,
});
router.post('/planos', authorize('Administrador'), validate(plan), rpc('salvar_plano_recuperacao', planParams, true));
router.put(
  '/planos/:id',
  authorize('Administrador'),
  validate(idParams, 'params'),
  validate(plan),
  rpc('salvar_plano_recuperacao', planParams),
);
router.post(
  '/planos/:id/encerramento',
  authorize('Administrador'),
  validate(idParams, 'params'),
  validate(z.object({ status: z.enum(['concluido', 'cancelado']), motivo: text(1000) })),
  rpc('encerrar_plano_recuperacao', (req) => ({
    p_id: req.params.id,
    p_status: req.body.status,
    p_motivo: req.body.motivo,
  })),
);
const action = z.object({ planoId: id, descricao: text(1000), prazo: z.iso.date() });
const actionParams = (req) => ({
  p_id: req.params.id || null,
  p_plano: req.body.planoId,
  p_descricao: req.body.descricao,
  p_prazo: req.body.prazo,
});
router.post('/acoes', authorize('Administrador'), validate(action), rpc('salvar_acao_recuperacao', actionParams, true));
router.put(
  '/acoes/:id',
  authorize('Administrador'),
  validate(idParams, 'params'),
  validate(action),
  rpc('salvar_acao_recuperacao', actionParams),
);
router.post(
  '/acoes/:id/status',
  validate(idParams, 'params'),
  validate(z.object({ status: z.enum(['em_andamento', 'concluida', 'cancelada']), resultado: text(1000) })),
  rpc('movimentar_acao_recuperacao', (req) => ({
    p_id: req.params.id,
    p_status: req.body.status,
    p_resultado: req.body.resultado,
  })),
);
module.exports = router;
