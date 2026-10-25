const { z } = require('zod');

const STATUS = ['pendente', 'confirmada', 'cancelada'];

const emptyToUndefined = (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val);

const dateField = (message) =>
  z.preprocess(emptyToUndefined, z.string({ error: message }).regex(/^\d{4}-\d{2}-\d{2}$/, message).optional());

// RFS13 - proposta de compra; o administrador registra em nome de um comprador
const createTransacaoSchema = z.object({
  pecaId: z.coerce.number({ error: 'Informe a peça da proposta' }).int().positive('Informe a peça da proposta'),
  valor: z.coerce
    .number({ error: 'O valor da proposta é obrigatório e deve ser um número válido' })
    .positive('O valor da proposta deve ser maior que zero')
    .max(9999999999999.99, 'O valor informado é muito alto'),
  compradorId: z.preprocess(emptyToUndefined, z.uuid({ error: 'Comprador inválido' }).optional())
});

// RFS14 - consulta por peça, comprador, vendedor ou período
const listTransacoesQuerySchema = z
  .object({
    peca: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    comprador: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    vendedor: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    dataInicial: dateField('Data inicial inválida'),
    dataFinal: dateField('Data final inválida'),
    status: z.preprocess(emptyToUndefined, z.enum(STATUS, { error: 'Situação inválida' }).optional())
  })
  .refine((q) => !q.dataInicial || !q.dataFinal || q.dataInicial <= q.dataFinal, {
    message: 'A data inicial não pode ser maior que a data final',
    path: ['dataInicial']
  });

const transacaoIdParamSchema = z.object({
  id: z.string({ error: 'Identificador de transação inválido' }).regex(/^\d+$/, 'Identificador de transação inválido')
});

// RFS16 - motivo opcional do cancelamento
const cancelarTransacaoSchema = z.object({
  motivo: z.preprocess(emptyToUndefined, z.string().trim().max(500, 'O motivo deve ter no máximo 500 caracteres').optional())
});

module.exports = {
  STATUS,
  createTransacaoSchema,
  listTransacoesQuerySchema,
  transacaoIdParamSchema,
  cancelarTransacaoSchema
};
