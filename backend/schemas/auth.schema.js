const { z } = require('zod');

const loginSchema = z.object({
  email: z
    .string({ error: 'O e-mail é obrigatório' })
    .trim()
    .email('Formato de e-mail inválido'),
  password: z
    .string({ error: 'A senha é obrigatória' })
    .min(1, 'A senha é obrigatória'),
  // origem do acesso que levou ao login (link, qr, alerta...), para o registro de eventos (RNF06)
  origem: z.string().trim().max(30).optional()
});

module.exports = {
  loginSchema
};
