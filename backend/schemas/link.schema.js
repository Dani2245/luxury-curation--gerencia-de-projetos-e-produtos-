const { z } = require('zod');

// Campos que o dono pode tornar públicos; nome, categoria, status, perito e assinatura são sempre exibidos
const CAMPOS_PUBLICOS = [
  'descricao',
  'fotografias',
  'documentos',
  'historico_proprietarios',
  'historico_eventos',
  'identidade_proprietarios',
  'valor'
];

const emptyToUndefined = (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val);

const idField = (message) => z.string({ error: message }).regex(/^\d+$/, message);

const camposField = z
  .array(z.enum(CAMPOS_PUBLICOS, { error: 'Campo público inválido' }), { error: 'Informe os campos públicos' });

const validadeField = z.preprocess(
  (val) => (val === '' || val === undefined ? null : val),
  z.string({ error: 'Validade inválida' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Validade inválida').nullable()
);

// RFS53 - atributos: passaporte*, campos públicos*, validade, destinatário
const createLinkSchema = z.object({
  passaporteId: z.coerce.number({ error: 'Informe o passaporte' }).int().positive('Informe o passaporte'),
  camposPublicos: camposField,
  validade: validadeField,
  destinatario: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(150, 'O destinatário deve ter no máximo 150 caracteres').optional()
  )
});

// RFS55 - altera os campos públicos e a validade de um link ativo
const updateLinkSchema = z.object({
  camposPublicos: camposField,
  validade: validadeField
});

const listLinksQuerySchema = z.object({
  passaporteId: z.preprocess(emptyToUndefined, idField('Identificador de passaporte inválido').optional())
});

const linkIdParamSchema = z.object({ id: idField('Identificador de link inválido') });

const tokenParamSchema = z.object({
  token: z.string({ error: 'Link de passaporte não encontrado' }).regex(/^[0-9a-f]{32}$/, 'Link de passaporte não encontrado')
});

module.exports = {
  CAMPOS_PUBLICOS,
  createLinkSchema,
  updateLinkSchema,
  listLinksQuerySchema,
  linkIdParamSchema,
  tokenParamSchema
};
