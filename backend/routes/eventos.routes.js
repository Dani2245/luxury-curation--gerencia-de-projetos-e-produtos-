const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const { resumoEventosQuerySchema } = require('../schemas/evento.schema');

// GET /api/eventos/resumo - Eventos de uso agregados por tipo no período (RNF06).
// Somente dados agregados: total, quantos vieram de gatilho externo e usuários distintos.
router.get(
  '/resumo',
  authenticate,
  authorize('Administrador'),
  validate(resumoEventosQuerySchema, 'query'),
  async (req, res) => {
    const { data, error } = await req.db.rpc('resumo_eventos_uso', {
      p_inicio: req.query.dataInicial ?? null,
      p_fim: req.query.dataFinal ?? null
    });
    if (error) return handleDbError(res, error, 'Erro ao consultar os eventos de uso');

    res.json(data.map((item) => ({
      evento: item.evento,
      total: Number(item.total),
      comGatilhoExterno: Number(item.com_gatilho_externo),
      usuariosDistintos: Number(item.usuarios_distintos)
    })));
  }
);

module.exports = router;
