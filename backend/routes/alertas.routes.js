const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const { resumoEventosQuerySchema } = require('../schemas/evento.schema');
const {
  createAlertaSchema,
  updateAlertaSchema,
  ativoSchema,
  alertaIdParamSchema
} = require('../schemas/alerta.schema');

const formatAlerta = (item) => ({
  id: item.id,
  tipo: item.tipo,
  listaId: item.lista_id,
  listaNome: item.lista_nome,
  frequencia: item.frequencia,
  canal: item.canal,
  ativo: item.ativo,
  ultimoEnvio: item.ultimo_envio,
  // nulo quando ainda não houve envio: o alerta sai assim que houver novidade
  proximoEnvio: item.proximo_envio,
  envios: Number(item.envios),
  criadoEm: item.criado_em
});

const fetchAlerta = (db, id) => db.from('vw_alertas').select('*').eq('id', id).maybeSingle();

const usuario = [authenticate, authorize('Comprador', 'Vendedor')];

// GET /api/alertas/resumo - Taxa de desativação dos alertas no período (RFS74, Administrador)
router.get('/resumo', authenticate, authorize('Administrador'), validate(resumoEventosQuerySchema, 'query'), async (req, res) => {
  const { data, error } = await req.db.rpc('resumo_alertas', {
    p_inicio: req.query.dataInicial ?? null,
    p_fim: req.query.dataFinal ?? null
  });
  if (error) return handleDbError(res, error, 'Erro ao consultar o resumo dos alertas');

  res.json(data.map((r) => ({
    tipo: r.tipo_alerta,
    criados: Number(r.criados),
    ativos: Number(r.ativos),
    desativados: Number(r.desativados),
    removidos: Number(r.removidos),
    envios: Number(r.envios),
    abertos: Number(r.abertos),
    taxaDesativacao: r.taxa_desativacao === null ? null : Number(r.taxa_desativacao)
  })));
});

// GET /api/alertas/passaportes-incompletos - Peças do estoque do vendedor e o que falta em cada passaporte
router.get('/passaportes-incompletos', authenticate, authorize('Vendedor'), async (req, res) => {
  const { data, error } = await req.db.rpc('passaportes_incompletos_estoque');
  if (error) return handleDbError(res, error, 'Erro ao consultar os passaportes incompletos');

  res.json(data.map((p) => ({ pecaId: p.peca_id, nome: p.nome, pendencias: p.pendencias || [] })));
});

// GET /api/alertas - Alertas do usuário (RFS74)
router.get('/', ...usuario, async (req, res) => {
  const { data, error } = await req.db.from('vw_alertas').select('*').order('criado_em', { ascending: false });
  if (error) return handleDbError(res, error, 'Erro ao consultar os alertas');

  res.json(data.map(formatAlerta));
});

// GET /api/alertas/:id/envios - Histórico de envios do alerta (RFS74)
router.get('/:id/envios', ...usuario, validate(alertaIdParamSchema, 'params'), async (req, res) => {
  const { data: alerta, error: alertaError } = await fetchAlerta(req.db, req.params.id);
  if (alertaError) return handleDbError(res, alertaError, 'Erro ao buscar o alerta');
  if (!alerta) return res.status(404).json({ message: 'Alerta não encontrado' });

  const { data, error } = await req.db
    .from('alerta_envios')
    .select('id, titulo, mensagem, criado_em, lida_em')
    .eq('alerta_id', alerta.id)
    .order('criado_em', { ascending: false })
    .limit(50);
  if (error) return handleDbError(res, error, 'Erro ao consultar o histórico de envios');

  res.json(data.map((e) => ({ id: e.id, titulo: e.titulo, mensagem: e.mensagem, criadoEm: e.criado_em, lidaEm: e.lida_em })));
});

// POST /api/alertas - Configurar alerta de peça compatível ou lembrete de passaporte incompleto (RFS73)
router.post('/', ...usuario, validate(createAlertaSchema), async (req, res) => {
  const { tipo, listaId, frequencia, canal } = req.body;
  const { data: id, error } = await req.db.rpc('criar_alerta', {
    p_tipo: tipo,
    p_lista_id: listaId ?? null,
    p_frequencia: frequencia ?? null,
    p_canal: canal ?? null
  });
  if (error) return handleDbError(res, error, 'Erro ao configurar o alerta');

  const { data } = await fetchAlerta(req.db, id);
  res.status(201).json(formatAlerta(data));
});

// PUT /api/alertas/:id - Alterar frequência e canal (RFS75)
router.put('/:id', ...usuario, validate(alertaIdParamSchema, 'params'), validate(updateAlertaSchema), async (req, res) => {
  const { error } = await req.db.rpc('editar_alerta', {
    p_id: req.params.id,
    p_frequencia: req.body.frequencia,
    p_canal: req.body.canal
  });
  if (error) return handleDbError(res, error, 'Erro ao atualizar o alerta');

  const { data } = await fetchAlerta(req.db, req.params.id);
  res.json(formatAlerta(data));
});

// PATCH /api/alertas/:id/ativo - Ligar ou desligar com uma única ação (RFS75, RNF05)
router.patch('/:id/ativo', ...usuario, validate(alertaIdParamSchema, 'params'), validate(ativoSchema), async (req, res) => {
  const { error } = await req.db.rpc('definir_alerta_ativo', { p_id: req.params.id, p_ativo: req.body.ativo });
  if (error) return handleDbError(res, error, 'Erro ao ligar ou desligar o alerta');

  const { data } = await fetchAlerta(req.db, req.params.id);
  res.json(formatAlerta(data));
});

// DELETE /api/alertas/:id - Excluir o alerta definitivamente (RFS76)
router.delete('/:id', ...usuario, validate(alertaIdParamSchema, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('remover_alerta', { p_id: req.params.id });
  if (error) return handleDbError(res, error, 'Erro ao excluir o alerta');

  res.status(204).send();
});

module.exports = router;
