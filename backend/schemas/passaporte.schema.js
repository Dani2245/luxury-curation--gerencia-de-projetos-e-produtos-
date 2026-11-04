const { z } = require('zod');

const STATUS = ['valido', 'em revisão', 'revogado'];

const emptyToUndefined = (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val);

const idField = (message) => z.string({ error: message }).regex(/^\d+$/, message);

const statusField = z.enum(STATUS, { error: 'Status inválido. Escolha: valido, em revisão ou revogado' });

// Tabela 2 - Atributos do Passaporte Digital: peça vinculada*, status*, histórico de proprietários
const emitirPassaporteSchema = z.object({
  pecaId: idField('A peça vinculada é obrigatória').transform(Number),
  status: statusField,
  // um proprietário anterior por linha
  proprietarios: z.preprocess(
    (val) => (typeof val === 'string' ? val.split(/\r?\n/).map((nome) => nome.trim()).filter(Boolean) : val),
    z.array(z.string().max(150, 'Cada nome de proprietário deve ter no máximo 150 caracteres')).default([])
  ),
  descricao: z.preprocess(emptyToUndefined, z.string().trim().optional())
});

const atualizarPassaporteSchema = z.object({
  status: z.preprocess(emptyToUndefined, statusField.optional()),
  descricao: z.preprocess(emptyToUndefined, z.string().trim().optional())
});

const privacidadeSchema = z.object({
  publico: z.boolean({ error: 'Informe se a identidade dos proprietários é pública' })
});

const passaporteIdParamSchema = z.object({ id: idField('Identificador de passaporte inválido') });
const pecaIdParamSchema = z.object({ pecaId: idField('Identificador de peça inválido') });

const transferenciaSchema = z.object({
  transacaoId: z.coerce.number({ error: 'Informe a transação da venda' }).int().positive('Informe a transação da venda')
});

module.exports = {
  STATUS,
  emitirPassaporteSchema,
  atualizarPassaporteSchema,
  privacidadeSchema,
  passaporteIdParamSchema,
  pecaIdParamSchema,
  transferenciaSchema
};
