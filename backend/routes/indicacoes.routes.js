const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const { idParams, indicacaoSchema, editarIndicacaoSchema } = require('../schemas/growth.schema');

const formatIndicacao = (item) => ({
  id: item.id,
  indicador: { id: item.indicador_id, nome: item.indicador_nome },
  nome: item.nome,
  contato: item.contato,
  perfil: item.perfil,
  // enviada, cadastrada (a conta foi criada) ou ativada (primeiro acesso da conta)
  status: item.status,
  codigo: item.codigo,
  criadoEm: item.criado_em,
  cadastradaEm: item.cadastrada_em,
  ativadaEm: item.ativada_em
});

// Comprador, vendedor, perito e administrador indicam novos clientes (RFC18)
router.use(authenticate, authorize('Comprador', 'Vendedor', 'Perito', 'Administrador'));

// GET /api/indicacoes - Indicações de quem indicou; o administrador vê todas (RFS62)
router.get('/', async (req, res) => {
  const { data, error } = await req.db.from('vw_indicacoes').select('*').order('criado_em', { ascending: false });
  if (error) return handleDbError(res, error, 'Erro ao consultar indicações');
  res.json(data.map(formatIndicacao));
});

// POST /api/indicacoes - Registra o indicado e gera o código do convite (RFS61)
router.post('/', validate(indicacaoSchema), async (req, res) => {
  const { nome, contato, perfil } = req.body;
  const { data, error } = await req.db.rpc('criar_indicacao', { p_nome: nome, p_contato: contato, p_perfil: perfil });
  if (error) return handleDbError(res, error, 'Erro ao registrar a indicação');
  res.status(201).json(data);
});

// PUT /api/indicacoes/:id - Corrige o contato enquanto o convite não for aceito (RFS63)
router.put('/:id', validate(idParams, 'params'), validate(editarIndicacaoSchema), async (req, res) => {
  const { error } = await req.db.rpc('editar_indicacao', { p_id: Number(req.params.id), p_nome: req.body.nome, p_contato: req.body.contato });
  if (error) return handleDbError(res, error, 'Erro ao atualizar a indicação');
  res.sendStatus(204);
});

// DELETE /api/indicacoes/:id - Cancela uma indicação ainda não aceita (RFS64)
router.delete('/:id', validate(idParams, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('remover_indicacao', { p_id: Number(req.params.id) });
  if (error) return handleDbError(res, error, 'Erro ao cancelar a indicação');
  res.sendStatus(204);
});

module.exports = router;
