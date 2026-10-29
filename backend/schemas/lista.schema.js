const { z } = require('zod');
const { CATEGORIAS } = require('./peca.schema');

const emptyToUndefined = (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val);

const toNumber = (val) => (typeof val === 'string' ? parseFloat(val.replace(',', '.')) : val);

const idField = (message) => z.string({ error: message }).regex(/^\d+$/, message);

const valorField = (message) => z.preprocess(
  (val) => (val === '' || val === undefined || val === null ? null : toNumber(val)),
  z.number({ error: message }).min(0, 'Informe valores maiores que zero').max(9999999999999.99, 'O valor informado é muito alto').nullable()
);

// RFC22 - atributos: comprador*, nome*, categorias, faixa de valor, peças salvas
const criterios = {
  nome: z
    .string({ error: 'O nome da lista é obrigatório' })
    .trim()
    .min(1, 'O nome da lista é obrigatório')
    .max(100, 'O nome da lista deve ter no máximo 100 caracteres'),
  categorias: z
    .array(z.enum(CATEGORIAS, { error: 'Categoria inválida. Escolha: obra de arte, joia ou relógio' }))
    .default([]),
  valorMin: valorField('O valor mínimo deve ser um número válido'),
  valorMax: valorField('O valor máximo deve ser um número válido')
};

const faixaValida = (q) => q.valorMin === null || q.valorMax === null || q.valorMin <= q.valorMax;
const faixaMensagem = { message: 'O valor mínimo não pode ser maior que o valor máximo', path: ['valorMin'] };

// RFS77 - cria a lista; com pecaId, salva a peça consultada na lista nova
const createListaSchema = z
  .object({
    ...criterios,
    pecaId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive('Peça inválida').optional())
  })
  .refine(faixaValida, faixaMensagem);

// RFS79 - altera os critérios
const updateListaSchema = z.object(criterios).refine(faixaValida, faixaMensagem);

const salvarPecaSchema = z.object({
  pecaId: z.coerce.number({ error: 'Informe a peça' }).int().positive('Informe a peça')
});

const listaIdParamSchema = z.object({ id: idField('Identificador de lista inválido') });

const listaPecaParamSchema = z.object({
  id: idField('Identificador de lista inválido'),
  pecaId: idField('Identificador de peça inválido')
});

module.exports = {
  createListaSchema,
  updateListaSchema,
  salvarPecaSchema,
  listaIdParamSchema,
  listaPecaParamSchema
};
