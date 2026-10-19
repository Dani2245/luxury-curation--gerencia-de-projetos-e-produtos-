const { z } = require('zod');

const loginSchema = z.object({
  email: z
    .string({ required_error: 'O e-mail é obrigatório' })
    .trim()
    .email('Formato de e-mail inválido'),
  password: z
    .string({ required_error: 'A senha é obrigatória' })
    .min(6, 'A senha deve conter no mínimo 6 caracteres')
});

module.exports = {
  loginSchema
};
