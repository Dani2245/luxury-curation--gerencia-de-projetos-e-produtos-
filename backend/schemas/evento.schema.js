const { z } = require('zod');

const emptyToUndefined = (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val);

const dateField = (message) =>
  z.preprocess(emptyToUndefined, z.string({ error: message }).regex(/^\d{4}-\d{2}-\d{2}$/, message).optional());

// RNF06 - resumo agregado dos eventos de uso por período
const resumoEventosQuerySchema = z
  .object({
    dataInicial: dateField('Data inicial inválida'),
    dataFinal: dateField('Data final inválida')
  })
  .refine((q) => !q.dataInicial || !q.dataFinal || q.dataInicial <= q.dataFinal, {
    message: 'A data inicial não pode ser maior que a data final',
    path: ['dataInicial']
  });

module.exports = {
  resumoEventosQuerySchema
};
