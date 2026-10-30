const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const { idParams, avaliacaoSchema, comentarioSchema, remocaoSchema } = require('../schemas/habito.schema');

const formatAvaliacao = (item) => ({
  id: item.id,
  transacaoId: item.transacao_id,
  pecaNome: item.peca_nome,
  avaliador: { id: item.avaliador_id, nome: item.avaliador_nome },
  avaliado: { id: item.avaliado_id, nome: item.avaliado_nome },
  nota: item.nota,
  comentario: item.comentario,
  criadoEm: item.criado_em,
  editavel: item.editavel,
  removidaEm: item.removida_em,
  motivoRemocao: item.motivo_remocao
});

// Comprador e vendedor avaliam um ao outro; o administrador modera (RFC24)
router.use(authenticate, authorize('Comprador', 'Vendedor', 'Administrador'));

// GET /api/avaliacoes - Recebidas e feitas pelo usuário, com a reputação; pendentes de avaliar (RFS86).
// O administrador vê todas, inclusive as removidas.
router.get('/', async (req, res) => {
  const uid = req.user.id;
  if (req.user.perfil === 'Administrador') {
    const { data, error } = await req.db.from('vw_avaliacoes').select('*').order('criado_em', { ascending: false });
    if (error) return handleDbError(res, error, 'Erro ao consultar avaliações');
    return res.json({ todas: data.map(formatAvaliacao) });
  }
  const [lista, reputacao, pendentes] = await Promise.all([
    req.db.from('vw_avaliacoes').select('*').or(`avaliado_id.eq.${uid},avaliador_id.eq.${uid}`).order('criado_em', { ascending: false }),
    req.db.rpc('reputacao', { p_usuario: uid }),
    req.db.rpc('avaliacoes_pendentes')
  ]);
  const error = lista.error || reputacao.error || pendentes.error;
  if (error) return handleDbError(res, error, 'Erro ao consultar avaliações');
  const avaliacoes = lista.data.map(formatAvaliacao);
  res.json({
    reputacao: { media: reputacao.data.media === null ? null : Number(reputacao.data.media), total: Number(reputacao.data.total) },
    recebidas: avaliacoes.filter((a) => a.avaliado.id === uid && !a.removidaEm),
    feitas: avaliacoes.filter((a) => a.avaliador.id === uid),
    pendentes: pendentes.data.map((p) => ({ transacaoId: p.transacao_id, pecaNome: p.peca_nome, contraparte: p.contraparte_nome, confirmadaEm: p.confirmada_em }))
  });
});

// POST /api/avaliacoes - Nota de 1 a 5 e comentário, só após a transação concluída (RFS85)
router.post('/', authorize('Comprador', 'Vendedor'), validate(avaliacaoSchema), async (req, res) => {
  const { transacaoId, nota, comentario } = req.body;
  const { data: id, error } = await req.db.rpc('criar_avaliacao', { p_transacao: transacaoId, p_nota: nota, p_comentario: comentario ?? null });
  if (error) return handleDbError(res, error, 'Erro ao registrar a avaliação');
  res.status(201).json({ id });
});

// PUT /api/avaliacoes/:id - O autor altera o comentário em até 7 dias (RFS87)
router.put('/:id', authorize('Comprador', 'Vendedor'), validate(idParams, 'params'), validate(comentarioSchema), async (req, res) => {
  const { error } = await req.db.rpc('editar_avaliacao', { p_id: Number(req.params.id), p_comentario: req.body.comentario });
  if (error) return handleDbError(res, error, 'Erro ao alterar a avaliação');
  res.sendStatus(204);
});

// DELETE /api/avaliacoes/:id - O administrador remove avaliação ofensiva, com o motivo (RFS88)
router.delete('/:id', authorize('Administrador'), validate(idParams, 'params'), validate(remocaoSchema), async (req, res) => {
  const { error } = await req.db.rpc('remover_avaliacao', { p_id: Number(req.params.id), p_motivo: req.body.motivo });
  if (error) return handleDbError(res, error, 'Erro ao remover a avaliação');
  res.sendStatus(204);
});

module.exports = router;
