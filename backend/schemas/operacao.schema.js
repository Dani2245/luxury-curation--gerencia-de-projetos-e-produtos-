const { z } = require('zod');

const emptyToUndefined = (value) => typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalText = (max = 200) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const requiredText = (name, max = 200) => z.string({ error: `Informe ${name}` }).trim().min(1, `Informe ${name}`).max(max, `${name}: máximo de ${max} caracteres`);
const date = z.iso.date({ error: 'Informe uma data válida' });
const idParams = z.object({ id: z.string().regex(/^\d+$/, 'Identificador inválido').refine((v) => Number(v) > 0 && Number.isSafeInteger(Number(v)), 'Identificador inválido') });
const money = z.coerce.number({ error: 'Informe um valor válido' }).min(0.01, 'O valor deve ser maior que zero').max(999999999999.99).multipleOf(0.01, 'Use no máximo duas casas decimais');
const localFields = { tipoLocal: z.enum(['cofre', 'sala de guarda'], { error: 'Escolha cofre ou sala de guarda' }), local: requiredText('o local', 150) };
const createCustodiaSchema = z.object({
  pecaId: z.coerce.number().int().positive().safe(), ...localFields,
  entradaEm: date, responsavel: requiredText('o responsável', 150)
});
const moveCustodiaSchema = z.object({ ...localFields, observacao: optionalText(500) });
const closeCustodiaSchema = z.object({ saidaEm: date, motivo: requiredText('o motivo da saída', 500) });
const listCustodiasSchema = z.object({ peca: optionalText(), local: optionalText(150), status: z.preprocess(emptyToUndefined, z.enum(['em custodia', 'retirada']).optional()) });
const STATUS_TRANSACOES = ['pendente', 'aceita', 'paga', 'enviada', 'em_conferencia', 'contestada', 'confirmada', 'cancelada'];
const CATEGORIAS_FINANCEIRAS = ['comissao_venda', 'emissao_passaporte', 'manutencao_passaporte', 'comissao_perito', 'comissao_parceiro', 'custo_operacional'];
const period = { dataInicial: date, dataFinal: date };
const validPeriod = (q) => q.dataInicial <= q.dataFinal;
const periodError = { message: 'A data inicial não pode ser maior que a final', path: ['dataInicial'] };
const transactionReportSchema = z.object({ ...period,
  categoria: z.preprocess(emptyToUndefined, z.enum(['obra de arte', 'joia', 'relógio']).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(STATUS_TRANSACOES).optional())
}).refine(validPeriod, periodError);
const financialReportSchema = z.object({ ...period,
  tipo: z.preprocess(emptyToUndefined, z.enum(['receita', 'despesa']).optional()),
  categoria: z.preprocess(emptyToUndefined, z.enum(CATEGORIAS_FINANCEIRAS).optional())
}).refine(validPeriod, periodError);
const createLancamentoSchema = z.object({
  tipo: z.enum(['receita', 'despesa']), categoria: z.enum(CATEGORIAS_FINANCEIRAS),
  descricao: requiredText('a descrição'), valor: money, competencia: date, vencimento: date
}).refine((v) => v.tipo === 'receita'
  ? ['emissao_passaporte', 'manutencao_passaporte'].includes(v.categoria)
  : ['comissao_perito', 'comissao_parceiro', 'custo_operacional'].includes(v.categoria),
{ message: 'Categoria incompatível; comissões de venda são automáticas', path: ['categoria'] });
const changeLancamentoSchema = z.object({ acao: z.enum(['liquidar', 'cancelar']), motivo: optionalText(500) })
  .refine((v) => v.acao !== 'cancelar' || Boolean(v.motivo), { message: 'Informe o motivo do cancelamento', path: ['motivo'] });
const envioSchema = z.object({ rastreio: requiredText('o rastreio ou comprovante de envio') });
const conferenciaSchema = z.object({ aprovada: z.boolean(), motivo: optionalText(1000) })
  .refine((v) => v.aprovada || Boolean(v.motivo), { message: 'Informe o motivo da contestação', path: ['motivo'] });
const resolucaoSchema = z.object({ decisao: z.enum(['liberar', 'estornar']), motivo: requiredText('a justificativa', 1000) });

module.exports = { idParams, createCustodiaSchema, moveCustodiaSchema, closeCustodiaSchema, listCustodiasSchema,
  STATUS_TRANSACOES, transactionReportSchema, financialReportSchema, createLancamentoSchema, changeLancamentoSchema,
  envioSchema, conferenciaSchema, resolucaoSchema };
