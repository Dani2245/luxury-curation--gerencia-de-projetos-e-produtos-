const { z } = require('zod');

const emptyToUndefined = (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const optionalText = (max) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const requiredText = (label, max) =>
  z.string({ error: `Informe ${label}` }).trim().min(1, `Informe ${label}`).max(max, `${label}: máximo de ${max} caracteres`);
const date = z.iso.date({ error: 'Informe uma data válida' });
const optionalDate = z.preprocess(emptyToUndefined, date.optional());
const validPeriod = (q) => !q.dataInicial || !q.dataFinal || q.dataInicial <= q.dataFinal;
const periodError = { message: 'A data inicial não pode ser maior que a final', path: ['dataInicial'] };
const idParams = z.object({ id: z.string().regex(/^\d+$/, 'Identificador inválido') });

const CATEGORIAS_INTERESSE = ['obra de arte', 'joia', 'relógio', 'bolsa'];
const PERFIS_LADO = ['comprador', 'vendedor'];
const ETAPAS_FUNIL = ['aquisição', 'ativação', 'retenção', 'receita', 'indicação'];
const ETAPAS_INDICADOR = ['North Star', 'proteção', ...ETAPAS_FUNIL];
const LADOS = ['comprador', 'vendedor', 'perito', 'ambos'];
const STATUS_EXPERIMENTO = ['backlog', 'em execução', 'concluído', 'descartado'];

// RFC17 - inscrição do visitante (RFS57); versão e origem chegam da página
const inscricaoSchema = z.object({
  nome: requiredText('o nome', 150),
  email: z.email({ error: 'Informe um e-mail válido' }),
  perfil: z.enum(PERFIS_LADO, { error: 'Escolha o perfil: comprador ou vendedor' }),
  categorias: z.array(z.enum(CATEGORIAS_INTERESSE, { error: 'Categoria de interesse inválida' })).default([]),
  versao: optionalText(20),
  origem: optionalText(40),
  link: optionalText(64),
  convite: optionalText(32),
  consentimento: z.literal(true, { error: 'É preciso concordar com o uso dos dados para entrar na lista de espera' })
});
// RFS58
const listaEsperaQuerySchema = z.object({
  perfil: z.preprocess(emptyToUndefined, z.enum(PERFIS_LADO).optional()),
  categoria: z.preprocess(emptyToUndefined, z.enum(CATEGORIAS_INTERESSE).optional()),
  versao: optionalText(20),
  origem: optionalText(40),
  dataInicial: optionalDate,
  dataFinal: optionalDate
}).refine(validPeriod, periodError);
// RFS59
const editarInscricaoSchema = z.object({
  nome: requiredText('o nome', 150),
  email: z.email({ error: 'Informe um e-mail válido' }),
  perfil: z.enum(PERFIS_LADO, { error: 'Escolha o perfil: comprador ou vendedor' }),
  categorias: z.array(z.enum(CATEGORIAS_INTERESSE, { error: 'Categoria de interesse inválida' })).default([]),
  status: z.enum(['aguardando', 'convidado', 'cadastrado'], { error: 'Status inválido' })
});

// RFC18 - indicação (RFS61 e RFS63)
const indicacaoSchema = z.object({
  nome: requiredText('o nome do indicado', 150),
  contato: z.email({ error: 'Informe o e-mail do indicado' }),
  perfil: z.enum(PERFIS_LADO, { error: 'Escolha o perfil do indicado: comprador ou vendedor' })
});
const editarIndicacaoSchema = indicacaoSchema.omit({ perfil: true });

// RFC20 - experimento (RFS69 e RFS71)
const nota = (label) => z.coerce.number({ error: `Informe a nota de ${label}` }).int(`A nota de ${label} deve ser inteira`)
  .min(1, `A nota de ${label} deve ser de 1 a 10`).max(10, `A nota de ${label} deve ser de 1 a 10`);
const experimentoSchema = z.object({
  titulo: requiredText('o título', 150),
  hipotese: requiredText('a hipótese', 2000),
  etapa: z.enum(ETAPAS_FUNIL, { error: 'Escolha a etapa do funil' }),
  indicador: requiredText('o indicador', 200),
  impacto: nota('impacto'),
  confianca: nota('confiança'),
  facilidade: nota('facilidade'),
  criterioSucesso: requiredText('o critério de sucesso', 1000),
  status: z.enum(STATUS_EXPERIMENTO, { error: 'Status inválido' }).default('backlog'),
  resultado: optionalText(2000),
  decisao: optionalText(1000)
}).refine((v) => v.status !== 'concluído' || (v.resultado && v.decisao), {
  message: 'Para concluir o experimento, registre o resultado e a decisão tomada', path: ['resultado']
});
const experimentosQuerySchema = z.object({
  etapa: z.preprocess(emptyToUndefined, z.enum(ETAPAS_FUNIL).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(STATUS_EXPERIMENTO).optional())
});

// RFC19 - indicador (RFS65 e RFS67)
const meta = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number({ error: 'Meta inválida' }).optional());
const indicadorSchema = z.object({
  codigo: z.string({ error: 'Informe o código' }).trim().regex(/^[A-Za-z0-9]{1,10}$/, 'Código inválido: use até 10 letras e números'),
  nome: requiredText('o nome', 150),
  etapa: z.enum(ETAPAS_INDICADOR, { error: 'Escolha a etapa' }),
  lado: z.enum(LADOS, { error: 'Escolha o lado' }),
  formula: requiredText('a fórmula', 60),
  metaMin: meta,
  metaMax: meta,
  frequencia: z.enum(['diária', 'semanal', 'mensal'], { error: 'Escolha a frequência' })
}).refine((v) => v.metaMin === undefined || v.metaMax === undefined || v.metaMin <= v.metaMax, {
  message: 'A meta mínima não pode ser maior que a máxima', path: ['metaMin']
});
const indicadoresQuerySchema = z.object({
  etapa: z.preprocess(emptyToUndefined, z.enum(ETAPAS_INDICADOR).optional()),
  lado: z.preprocess(emptyToUndefined, z.enum(LADOS).optional())
});
const ativoSchema = z.object({ ativo: z.boolean({ error: 'Informe se o indicador fica ativo' }) });
// RF04
const painelQuerySchema = z.object({
  dataInicial: date,
  dataFinal: date,
  etapa: z.preprocess(emptyToUndefined, z.enum(ETAPAS_INDICADOR).optional()),
  lado: z.preprocess(emptyToUndefined, z.enum(LADOS).optional())
}).refine(validPeriod, periodError);

module.exports = {
  idParams, inscricaoSchema, listaEsperaQuerySchema, editarInscricaoSchema, indicacaoSchema, editarIndicacaoSchema,
  experimentoSchema, experimentosQuerySchema, indicadorSchema, indicadoresQuerySchema, ativoSchema, painelQuerySchema
};
