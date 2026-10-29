const { z } = require('zod');

const TIPOS = ['peca compativel', 'passaporte incompleto'];
const FREQUENCIAS = ['diaria', 'semanal', 'mensal'];
// o e-mail é aceito aqui e recusado pelo banco com a mensagem de canal indisponível nesta versão
const CANAIS = ['plataforma', 'email'];

const emptyToUndefined = (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val);

const idField = (message) => z.string({ error: message }).regex(/^\d+$/, message);

const frequenciaField = z.enum(FREQUENCIAS, { error: 'Frequência inválida. Escolha: diaria, semanal ou mensal' });
const canalField = z.enum(CANAIS, { error: 'Canal inválido. Escolha: plataforma ou email' });

// RFS73 - atributos: tipo*, lista de desejos vinculada, frequência* (padrão conservador), canal*, ativo*
const createAlertaSchema = z.object({
  tipo: z.enum(TIPOS, { error: 'Tipo de alerta inválido' }),
  listaId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive('Lista de desejos inválida').optional()),
  frequencia: z.preprocess(emptyToUndefined, frequenciaField.optional()),
  canal: z.preprocess(emptyToUndefined, canalField.optional())
});

// RFS75 - frequência e canal; ligar e desligar tem rota própria (uma única ação)
const updateAlertaSchema = z.object({
  frequencia: frequenciaField,
  canal: z.preprocess(emptyToUndefined, canalField.default('plataforma'))
});

const ativoSchema = z.object({
  ativo: z.boolean({ error: 'Informe se o alerta fica ligado ou desligado' })
});

const alertaIdParamSchema = z.object({ id: idField('Identificador de alerta inválido') });

const notificacaoIdParamSchema = z.object({ id: idField('Identificador de notificação inválido') });

module.exports = {
  TIPOS,
  FREQUENCIAS,
  createAlertaSchema,
  updateAlertaSchema,
  ativoSchema,
  alertaIdParamSchema,
  notificacaoIdParamSchema
};
