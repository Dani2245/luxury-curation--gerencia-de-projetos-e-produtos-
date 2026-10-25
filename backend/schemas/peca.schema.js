const { z } = require('zod');

const CATEGORIAS = ['obra de arte', 'joia', 'relógio'];
const PUBLICACOES = ['pendente', 'publicada', 'rejeitada'];

const emptyToUndefined = (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val);

const toNumber = (val) => (typeof val === 'string' ? parseFloat(val.replace(',', '.')) : val);

const parseJsonArray = (val) => {
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};

const valorField = (message) => z.preprocess(
  toNumber,
  z
    .number({ error: message })
    .positive('O valor deve ser maior que zero')
    .max(9999999999999.99, 'O valor informado é muito alto')
);

// Tabela 1 - Atributos da Peça (campos com * são obrigatórios)
const pecaSchema = z.object({
  nome: z
    .string({ error: 'O nome da peça é obrigatório' })
    .trim()
    .min(1, 'O nome da peça é obrigatório')
    .max(256, 'O nome da peça deve ter no máximo 256 caracteres'),
  categoria: z.enum(CATEGORIAS, { error: 'Categoria inválida. Escolha: obra de arte, joia ou relógio' }),
  descricao: z.string().trim().optional().default(''),
  valorPretendido: valorField('O valor pretendido é obrigatório e deve ser um número válido'),
  // Na edição: URLs das fotografias atuais que devem ser mantidas
  fotografiasMantidas: z.preprocess(
    parseJsonArray,
    z.array(z.string(), { error: 'Lista de fotografias inválida' }).optional()
  )
});

const listPecasQuerySchema = z
  .object({
    categoria: z.preprocess(emptyToUndefined, z.enum(CATEGORIAS, { error: 'Categoria inválida' }).optional()),
    valorMin: z.preprocess(emptyToUndefined, valorField('O valor mínimo deve ser um número válido').optional()),
    valorMax: z.preprocess(emptyToUndefined, valorField('O valor máximo deve ser um número válido').optional()),
    vendedor: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    publicacao: z.preprocess(emptyToUndefined, z.enum(PUBLICACOES, { error: 'Situação inválida' }).optional())
  })
  .refine(
    (q) => q.valorMin === undefined || q.valorMax === undefined || q.valorMin <= q.valorMax,
    { message: 'O valor mínimo não pode ser maior que o valor máximo', path: ['valorMin'] }
  )
  // RFS02: é necessário preencher um dos filtros (categoria, faixa de valor ou vendedor)
  .refine(
    (q) => q.categoria !== undefined || q.valorMin !== undefined || q.valorMax !== undefined || q.vendedor !== undefined,
    { message: 'Preencha ao menos um filtro: categoria, faixa de valor ou vendedor', path: ['categoria'] }
  );

const pecaIdParamSchema = z.object({
  id: z.string({ error: 'Identificador de peça inválido' }).regex(/^\d+$/, 'Identificador de peça inválido')
});

const publicacaoSchema = z.object({
  publicacao: z.enum(PUBLICACOES, { error: 'Situação inválida. Escolha: pendente, publicada ou rejeitada' })
});

module.exports = {
  CATEGORIAS,
  PUBLICACOES,
  pecaSchema,
  listPecasQuerySchema,
  pecaIdParamSchema,
  publicacaoSchema
};
