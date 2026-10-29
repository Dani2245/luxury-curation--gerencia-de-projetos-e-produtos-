const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const {
  createLinkSchema,
  updateLinkSchema,
  listLinksQuerySchema,
  linkIdParamSchema
} = require('../schemas/link.schema');

const formatLink = (item) => ({
  id: item.id,
  passaporteId: item.passaporte_id,
  pecaId: item.peca_id,
  pecaNome: item.peca_nome,
  token: item.token,
  camposPublicos: item.campos_publicos || [],
  validade: item.validade,
  destinatario: item.destinatario,
  status: item.status,
  // ativo, revogado, expirado ou encerrado (a peça mudou de proprietário)
  situacao: item.situacao,
  acessos: Number(item.acessos),
  acessosQr: Number(item.acessos_qr),
  ultimoAcesso: item.ultimo_acesso,
  criadoEm: item.criado_em,
  revogadoEm: item.revogado_em
});

const fetchLink = (db, id) => db.from('vw_passaporte_links').select('*').eq('id', id).maybeSingle();

// O proprietário atual da peça (vendedor ou comprador) compartilha o passaporte (RFC16)
router.use(authenticate, authorize('Vendedor', 'Comprador'));

// GET /api/links - Links gerados pelo usuário, com os acessos registrados (RFS54)
router.get('/', validate(listLinksQuerySchema, 'query'), async (req, res) => {
  let query = req.db.from('vw_passaporte_links').select('*').order('criado_em', { ascending: false });
  if (req.query.passaporteId) query = query.eq('passaporte_id', Number(req.query.passaporteId));

  const { data, error } = await query;
  if (error) return handleDbError(res, error, 'Erro ao consultar links de compartilhamento');

  // RFS54: inscrições na lista de espera originadas de cada link (RFC17 e RFC18)
  const { data: cadastros, error: cadastrosError } = await req.db.rpc('cadastros_por_link');
  if (cadastrosError) return handleDbError(res, cadastrosError, 'Erro ao consultar cadastros originados dos links');
  const porLink = Object.fromEntries((cadastros || []).map((c) => [c.link_id, Number(c.cadastros)]));

  res.json(data.map((item) => ({ ...formatLink(item), cadastros: porLink[item.id] ?? 0 })));
});

// GET /api/links/:id/acessos - Histórico de acessos de um link (RFS54)
router.get('/:id/acessos', validate(linkIdParamSchema, 'params'), async (req, res) => {
  const { data: link, error: linkError } = await fetchLink(req.db, req.params.id);
  if (linkError) return handleDbError(res, linkError, 'Erro ao buscar o link');
  if (!link) return res.status(404).json({ message: 'Link não encontrado' });

  const { data, error } = await req.db
    .from('passaporte_link_acessos')
    .select('id, origem, acessado_em')
    .eq('link_id', link.id)
    .order('acessado_em', { ascending: false })
    .limit(100);
  if (error) return handleDbError(res, error, 'Erro ao consultar os acessos do link');

  res.json(data.map((a) => ({ id: a.id, origem: a.origem, acessadoEm: a.acessado_em })));
});

// POST /api/links - Gerar link e QR code com os campos públicos escolhidos (RFS53)
router.post('/', validate(createLinkSchema), async (req, res) => {
  const { passaporteId, camposPublicos, validade, destinatario } = req.body;

  const { data: id, error } = await req.db.rpc('criar_link_passaporte', {
    p_passaporte_id: passaporteId,
    p_campos: camposPublicos,
    p_validade: validade,
    p_destinatario: destinatario ?? null
  });
  if (error) return handleDbError(res, error, 'Erro ao gerar o link de compartilhamento');

  const { data } = await fetchLink(req.db, id);
  res.status(201).json(formatLink(data));
});

// PUT /api/links/:id - Alterar campos públicos e validade (RFS55)
router.put('/:id', validate(linkIdParamSchema, 'params'), validate(updateLinkSchema), async (req, res) => {
  const { error } = await req.db.rpc('editar_link_passaporte', {
    p_id: req.params.id,
    p_campos: req.body.camposPublicos,
    p_validade: req.body.validade
  });
  if (error) return handleDbError(res, error, 'Erro ao atualizar o link de compartilhamento');

  const { data } = await fetchLink(req.db, req.params.id);
  res.json(formatLink(data));
});

// DELETE /api/links/:id - Revogar o link, que deixa de dar acesso na hora (RFS56)
router.delete('/:id', validate(linkIdParamSchema, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('revogar_link_passaporte', { p_id: req.params.id });
  if (error) return handleDbError(res, error, 'Erro ao revogar o link de compartilhamento');

  const { data } = await fetchLink(req.db, req.params.id);
  res.json(formatLink(data));
});

module.exports = router;
