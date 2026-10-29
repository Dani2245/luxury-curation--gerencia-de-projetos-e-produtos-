const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { supabase } = require('../config/supabase');
const { handleDbError } = require('../utils/db-error');
const { tokenParamSchema } = require('../schemas/link.schema');

const INDISPONIVEL = {
  revogado: 'Este link foi revogado pelo proprietário da peça',
  expirado: 'Este link expirou',
  encerrado: 'Este link foi encerrado porque a peça mudou de proprietário'
};

// GET /api/publico/passaportes/:token - Consulta pelo link ou QR code, sem cadastro (RFS54).
// Usa o cliente anônimo: a única permissão do visitante é a função consultar_link_publico,
// que devolve só os campos públicos escolhidos pelo dono e registra o acesso.
router.get('/passaportes/:token', validate(tokenParamSchema, 'params'), async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ message: 'Supabase não está configurado no .env' });
  }

  const origem = req.query.origem === 'qr' ? 'qr' : 'link';
  const { data, error } = await supabase.rpc('consultar_link_publico', { p_token: req.params.token, p_origem: origem });
  if (error) return handleDbError(res, error, 'Erro ao consultar o passaporte');

  if (!data?.disponivel) {
    if (data?.motivo === 'inexistente' || !INDISPONIVEL[data?.motivo]) {
      return res.status(404).json({ message: 'Link de passaporte não encontrado' });
    }
    return res.status(410).json({ message: INDISPONIVEL[data.motivo], motivo: data.motivo });
  }

  const { disponivel: _disponivel, ...passaporte } = data;
  res.json(passaporte);
});

module.exports = router;
