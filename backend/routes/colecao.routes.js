const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const { idParams, itemSchema, importacaoSchema } = require('../schemas/habito.schema');

const formatItem = (item) => ({
  id: item.id,
  nome: item.nome,
  categoria: item.categoria,
  estadoConservacao: item.estado_conservacao,
  fotografias: item.fotografias || [],
  documentos: item.documentos || [],
  ultimaManutencao: item.ultima_manutencao,
  // visível só ao dono (RNF04)
  valorReferencia: item.valor_referencia === null ? null : Number(item.valor_referencia),
  visibilidade: item.visibilidade,
  // rascunho (importado), registrado ou passaporte solicitado
  status: item.status,
  pendencias: item.pendencias || [],
  criadoEm: item.criado_em,
  atualizadoEm: item.atualizado_em
});

const itemParams = (b) => ({
  p_nome: b.nome, p_categoria: b.categoria, p_estado: b.estadoConservacao, p_fotografias: b.fotografias ?? [],
  p_documentos: b.documentos ?? [], p_ultima_manutencao: b.ultimaManutencao ?? null, p_valor: b.valorReferencia ?? null,
  p_visibilidade: b.visibilidade ?? 'privado'
});

router.use(authenticate);

// GET /api/colecao/exportar - O proprietário exporta a coleção e os passaportes das peças que possui (RNF05)
router.get('/exportar', authorize('Comprador', 'Vendedor'), async (req, res) => {
  const { data, error } = await req.db.rpc('exportar_dados_proprietario');
  if (error) return handleDbError(res, error, 'Erro ao exportar os dados');
  res.setHeader('Content-Disposition', 'attachment; filename="lastro-meus-dados.json"');
  res.json(data);
});

// A coleção privada é do comprador, como proprietário (RFC23)
router.use(authorize('Comprador'));

// GET /api/colecao - Só o proprietário vê, com estado, última atualização e o que falta para o passaporte (RFS82)
router.get('/', async (req, res) => {
  const { data, error } = await req.db.from('vw_colecao').select('*').order('atualizado_em', { ascending: false });
  if (error) return handleDbError(res, error, 'Erro ao consultar a coleção');
  res.json(data.map(formatItem));
});

// POST /api/colecao - Registra uma peça própria, privada por padrão (RFS81)
router.post('/', validate(itemSchema), async (req, res) => {
  const { data: id, error } = await req.db.rpc('criar_item_colecao', { ...itemParams(req.body), p_rascunho: false });
  if (error) return handleDbError(res, error, 'Erro ao registrar a peça');
  const { data } = await req.db.from('vw_colecao').select('*').eq('id', id).single();
  res.status(201).json(formatItem(data));
});

// POST /api/colecao/importar - Importa a planilha do proprietário como itens em rascunho (RFS81)
router.post('/importar', validate(importacaoSchema), async (req, res) => {
  let importados = 0;
  for (const item of req.body.itens) {
    const { error } = await req.db.rpc('criar_item_colecao', { ...itemParams(item), p_rascunho: true });
    if (error) return handleDbError(res, error, `Erro ao importar a linha ${importados + 1}`);
    importados += 1;
  }
  res.status(201).json({ importados });
});

// PUT /api/colecao/:id - Atualiza fotos, documentos e estado; cada atualização vai para o histórico (RFS83)
router.put('/:id', validate(idParams, 'params'), validate(itemSchema), async (req, res) => {
  const { error } = await req.db.rpc('editar_item_colecao', { p_id: Number(req.params.id), ...itemParams(req.body) });
  if (error) return handleDbError(res, error, 'Erro ao atualizar a peça');
  const { data } = await req.db.from('vw_colecao').select('*').eq('id', req.params.id).single();
  res.json(formatItem(data));
});

// POST /api/colecao/:id/passaporte - A peça vira passaporte quando o dono quiser: o pedido vai para a curadoria
router.post('/:id/passaporte', validate(idParams, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('solicitar_passaporte_item', { p_id: Number(req.params.id) });
  if (error) return handleDbError(res, error, 'Erro ao solicitar o passaporte');
  res.sendStatus(204);
});

// GET /api/colecao/:id/historico
router.get('/:id/historico', validate(idParams, 'params'), async (req, res) => {
  const { data, error } = await req.db.from('colecao_historico').select('id, descricao, criado_em').eq('item_id', req.params.id).order('id', { ascending: false });
  if (error) return handleDbError(res, error, 'Erro ao consultar o histórico');
  res.json(data);
});

// DELETE /api/colecao/:id - Exclui peça sem passaporte solicitado (RFS84)
router.delete('/:id', validate(idParams, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('remover_item_colecao', { p_id: Number(req.params.id) });
  if (error) return handleDbError(res, error, 'Erro ao excluir a peça');
  res.sendStatus(204);
});

module.exports = router;
