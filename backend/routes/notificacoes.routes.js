const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const { notificacaoIdParamSchema } = require('../schemas/alerta.schema');

// Notificações na plataforma, geradas pelos alertas e lembretes (RFC21, canal plataforma)
router.use(authenticate, authorize('Comprador', 'Vendedor'));

// GET /api/notificacoes - Gera os envios devidos (respeitando a frequência) e lista os mais recentes
router.get('/', async (req, res) => {
  const { error: processarError } = await req.db.rpc('processar_alertas');
  if (processarError) console.warn('[Alertas] Falha ao processar os alertas:', processarError.message);

  const [lista, naoLidas] = await Promise.all([
    req.db.from('alerta_envios').select('id, titulo, mensagem, link, criado_em, lida_em').order('criado_em', { ascending: false }).limit(20),
    req.db.from('alerta_envios').select('id', { count: 'exact', head: true }).is('lida_em', null)
  ]);
  const failed = [lista, naoLidas].find((r) => r.error);
  if (failed) return handleDbError(res, failed.error, 'Erro ao consultar as notificações');

  res.json({
    naoLidas: naoLidas.count ?? 0,
    notificacoes: lista.data.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      mensagem: n.mensagem,
      link: n.link,
      criadoEm: n.criado_em,
      lida: n.lida_em !== null
    }))
  });
});

// POST /api/notificacoes/:id/abrir - Marca como lida e registra o acesso vindo do alerta (gatilho externo)
router.post('/:id/abrir', validate(notificacaoIdParamSchema, 'params'), async (req, res) => {
  const { data: link, error } = await req.db.rpc('abrir_notificacao', { p_id: req.params.id });
  if (error) return handleDbError(res, error, 'Erro ao abrir a notificação');

  res.json({ link });
});

module.exports = router;
