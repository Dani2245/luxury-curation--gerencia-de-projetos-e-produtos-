const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { supabase } = require('../config/supabase');
const { handleDbError } = require('../utils/db-error');
const { idParams, inscricaoSchema, listaEsperaQuerySchema, editarInscricaoSchema } = require('../schemas/growth.schema');

// POST /api/lista-espera - Inscrição do visitante, sem cadastro (RFS57).
// Usa o cliente anônimo: a única permissão do visitante é a função inscrever_lista_espera.
router.post('/', validate(inscricaoSchema), async (req, res) => {
  if (!supabase) return res.status(500).json({ message: 'Supabase não está configurado no .env' });
  const b = req.body;
  const { data: id, error } = await supabase.rpc('inscrever_lista_espera', {
    p_nome: b.nome, p_email: b.email, p_perfil: b.perfil, p_categorias: b.categorias,
    p_versao: b.versao ?? null, p_origem: b.origem ?? null, p_consentimento: b.consentimento,
    p_link_token: b.link ?? null, p_convite: b.convite ?? null
  });
  if (error) return handleDbError(res, error, 'Erro ao registrar a inscrição');
  res.status(201).json({ id });
});

// As demais operações são do administrador (RFS58 a RFS60)
router.use(authenticate, authorize('Administrador'));

router.get('/', validate(listaEsperaQuerySchema, 'query'), async (req, res) => {
  const q = req.query;
  const { data, error } = await req.db.rpc('consultar_lista_espera', {
    p_perfil: q.perfil ?? null, p_categoria: q.categoria ?? null, p_versao: q.versao ?? null,
    p_origem: q.origem ?? null, p_inicio: q.dataInicial ?? null, p_fim: q.dataFinal ?? null
  });
  if (error) return handleDbError(res, error, 'Erro ao consultar a lista de espera');
  res.json(data);
});

router.put('/:id', validate(idParams, 'params'), validate(editarInscricaoSchema), async (req, res) => {
  const b = req.body;
  const { error } = await req.db.rpc('editar_inscricao', {
    p_id: Number(req.params.id), p_nome: b.nome, p_email: b.email, p_perfil: b.perfil, p_categorias: b.categorias, p_status: b.status
  });
  if (error) return handleDbError(res, error, 'Erro ao atualizar a inscrição');
  res.sendStatus(204);
});

router.delete('/:id', validate(idParams, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('remover_inscricao', { p_id: Number(req.params.id) });
  if (error) return handleDbError(res, error, 'Erro ao excluir a inscrição');
  res.sendStatus(204);
});

module.exports = router;
