const { z } = require('zod');

const createPecaSchema = z.object({
  name: z
    .string({ required_error: 'O nome da peça é obrigatório' })
    .trim()
    .min(3, 'O nome deve ter pelo menos 3 caracteres'),
  category: z
    .string({ required_error: 'A categoria é obrigatória' })
    .trim()
    .min(2, 'A categoria deve ter pelo menos 2 caracteres'),
  price: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val) : val),
    z
      .number({ required_error: 'O preço é obrigatório', invalid_type_error: 'O preço deve ser um número válido' })
      .positive('O preço deve ser maior que zero')
  ),
  description: z
    .string()
    .trim()
    .optional()
    .default(''),
  image: z
    .string()
    .trim()
    .optional()
    .default('https://images.unsplash.com/photo-1541961017774-22349e4a1262?q=80&w=1000&auto=format&fit=crop')
});

module.exports = {
  createPecaSchema
};
