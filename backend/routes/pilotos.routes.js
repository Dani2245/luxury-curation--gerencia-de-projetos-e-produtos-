const router = require('express').Router();
const { z } = require('zod');
const { authenticate, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { idParams } = require('../schemas/operacao.schema');
const { handleDbError } = require('../utils/db-error');
const optionalId = z.preprocess((v) => v === '' || v === null ? undefined : v, z.coerce.number().int().positive().safe().optional());
const evidence = z.object({
  experimento: z.enum(['X1','X2','X3','X4']), participante: z.string().trim().min(1).max(100), ocorridoEm: z.iso.date(),
  resultado: z.enum(['pendente','aceitou','recusou','leitura realizada','diagnóstico realizado']),
  observacao: z.string().trim().min(1).max(2000), referencia: z.string().trim().max(500).optional(), demonstracao: z.boolean(),
  leitura: z.object({ procedencia: z.boolean(), conservacao: z.boolean(), assinante: z.boolean(), semAjuda: z.boolean() }).optional(),
  indicacaoId: optionalId, laudoId: optionalId
});
const period = z.object({ inicio: z.iso.date(), fim: z.iso.date() }).refine((p) => p.inicio <= p.fim, { message: 'Período inválido' });
router.use(authenticate, authorize('Administrador'));
router.get('/evidencias', async (req, res) => {
  const { data, error } = await req.db.from('growth_evidencias').select('*').order('id', { ascending: false });
  if (error) return handleDbError(res, error, 'Erro ao consultar evidências');
  res.json(data);
});
router.post('/evidencias', validate(evidence), async (req, res) => {
  const { data, error } = await req.db.rpc('registrar_evidencia_growth', { p_dados: req.body });
  if (error) return handleDbError(res, error, 'Erro ao registrar evidência');
  res.status(201).json({ id: data });
});
router.post('/evidencias/:id/anular', validate(idParams, 'params'), validate(z.object({ motivo: z.string().trim().min(1).max(500) })), async (req, res) => {
  const { error } = await req.db.rpc('anular_evidencia_growth', { p_id: Number(req.params.id), p_motivo: req.body.motivo });
  if (error) return handleDbError(res, error, 'Erro ao anular evidência');
  res.sendStatus(204);
});
router.get('/resumo', validate(period, 'query'), async (req, res) => {
  const { data, error } = await req.db.rpc('resumo_pilotos_growth', { p_inicio: req.query.inicio, p_fim: req.query.fim });
  if (error) return handleDbError(res, error, 'Erro ao consultar pilotos');
  res.json(data);
});
router.get('/indicacoes-peritos', async (req, res) => {
  const peritos = await req.db.from('perfis').select('id').eq('perfil', 'Perito');
  if (peritos.error) return handleDbError(res, peritos.error, 'Erro ao consultar peritos');
  if (!peritos.data.length) return res.json([]);
  const { data, error } = await req.db.from('indicacoes').select('id,nome,criado_em').eq('perfil','vendedor').in('indicador_id', peritos.data.map((p) => p.id)).order('id', { ascending: false });
  if (error) return handleDbError(res, error, 'Erro ao consultar indicações');
  res.json(data);
});
router.put('/exemplo', validate(z.object({ token: z.string().regex(/^[a-f0-9]+$/).max(128), nivel: z.string().trim().min(1).max(500), estado: z.string().trim().min(1).max(500) })), async (req, res) => {
  const { error } = await req.db.rpc('configurar_exemplo_growth', { p_token: req.body.token, p_nivel: req.body.nivel, p_estado: req.body.estado });
  if (error) return handleDbError(res, error, 'Erro ao configurar exemplo');
  res.sendStatus(204);
});
module.exports = router;
