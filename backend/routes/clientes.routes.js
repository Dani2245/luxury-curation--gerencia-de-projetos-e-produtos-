const router = require('express').Router();
const { z } = require('zod');
const { authenticate, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { handleDbError } = require('../utils/db-error');
router.use(authenticate);
router.get('/onboarding', authorize('Vendedor'), async (req, res) => {
  const { data, error } = await req.db.rpc('onboarding_vendedor');
  if (error) return handleDbError(res, error, 'Erro ao consultar etapas');
  res.json(data);
});
router.get('/meu-health', async (req, res) => {
  const { data, error } = await req.db.rpc('meu_health');
  if (error) return handleDbError(res, error, 'Erro ao consultar Health Score');
  res.json(data);
});
router.use(authorize('Administrador'));
router.get(
  '/saude',
  validate(
    z
      .object({
        dataInicial: z.iso.date(),
        dataFinal: z.iso.date(),
        perfil: z.enum(['Comprador', 'Vendedor', 'Perito', '']).optional(),
        coorte: z
          .string()
          .regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/)
          .optional(),
      })
      .refine((v) => v.dataInicial <= v.dataFinal, { message: 'Período inválido' }),
    'query',
  ),
  async (req, res) => {
    const q = req.query;
    const { data, error } = await req.db.rpc('relatorio_saude_base', {
      p_inicio: q.dataInicial,
      p_fim: q.dataFinal,
      p_perfil: q.perfil || null,
      p_coorte: q.coorte || null,
    });
    if (error) return handleDbError(res, error, 'Erro ao consultar saúde da base');
    res.json(data);
  },
);
router.get('/health-config', async (req, res) => {
  const { data, error } = await req.db.from('health_config').select('*').single();
  if (error) return handleDbError(res, error, 'Erro ao consultar regras');
  res.json(data);
});
router.get('/health-config/historico', async (req, res) => {
  const { data, error } = await req.db
    .from('health_config_historico')
    .select('*')
    .order('id', { ascending: false })
    .limit(100);
  if (error) return handleDbError(res, error, 'Erro ao consultar histórico');
  res.json(data);
});
const weight = z.coerce.number().int().min(0).max(100);
router.put(
  '/health-config',
  validate(
    z
      .object({
        peso_atividade: weight,
        peso_passaporte: weight,
        peso_fluxo: weight,
        dias_meta: z.coerce.number().int().min(1).max(30),
        limite_atencao: z.coerce.number().int().min(1).max(98),
        limite_saudavel: z.coerce.number().int().min(2).max(100),
        motivo: z.string().trim().min(1).max(500),
      })
      .refine(
        (v) => v.peso_atividade + v.peso_passaporte + v.peso_fluxo === 100 && v.limite_atencao < v.limite_saudavel,
        { message: 'Pesos devem somar 100 e as faixas devem ser crescentes' },
      ),
  ),
  async (req, res) => {
    const b = req.body;
    const { error } = await req.db.rpc('configurar_health', {
      p_atividade: b.peso_atividade,
      p_passaporte: b.peso_passaporte,
      p_fluxo: b.peso_fluxo,
      p_dias: b.dias_meta,
      p_atencao: b.limite_atencao,
      p_saudavel: b.limite_saudavel,
      p_motivo: b.motivo,
    });
    if (error) return handleDbError(res, error, 'Erro ao salvar regras');
    res.sendStatus(204);
  },
);
module.exports = router;
