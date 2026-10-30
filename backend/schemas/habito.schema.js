const { z } = require('zod');

const emptyToUndefined = (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const idParams = z.object({ id: z.string().regex(/^\d+$/, 'Identificador inválido') });
const CATEGORIAS = ['obra de arte', 'joia', 'relógio', 'bolsa'];
const ESTADOS = ['excelente', 'muito bom', 'bom', 'regular', 'precisa de restauro'];
const DOCUMENTOS = ['nota fiscal', 'laudo', 'certificado'];

// RFC23 - peça da coleção privada (RFS81 e RFS83)
const itemSchema = z.object({
  nome: z.string({ error: 'Informe o nome da peça' }).trim().min(1, 'Informe o nome da peça').max(256),
  categoria: z.enum(CATEGORIAS, { error: 'Categoria inválida' }),
  estadoConservacao: z.enum(ESTADOS, { error: 'Informe o estado de conservação' }),
  fotografias: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  documentos: z.array(z.enum(DOCUMENTOS, { error: 'Documento inválido' })).default([]),
  ultimaManutencao: z.preprocess(emptyToUndefined, z.iso.date({ error: 'Data inválida' }).optional()),
  valorReferencia: z.preprocess((v) => (v === '' || v === null ? undefined : v),
    z.coerce.number({ error: 'Valor inválido' }).positive('O valor de referência deve ser maior que zero').optional()),
  visibilidade: z.enum(['privado', 'público']).default('privado')
});
// importação da planilha do proprietário: cada linha vira um rascunho
const importacaoSchema = z.object({
  itens: z.array(itemSchema.pick({ nome: true, categoria: true, estadoConservacao: true, valorReferencia: true, ultimaManutencao: true }))
    .min(1, 'A planilha não tem peças válidas').max(200, 'Importe até 200 peças por vez')
});

// RFC24 - avaliação (RFS85 a RFS88)
const avaliacaoSchema = z.object({
  transacaoId: z.coerce.number({ error: 'Transação inválida' }).int().positive(),
  nota: z.coerce.number({ error: 'A nota deve ser de 1 a 5' }).int('A nota deve ser de 1 a 5').min(1, 'A nota deve ser de 1 a 5').max(5, 'A nota deve ser de 1 a 5'),
  comentario: z.preprocess(emptyToUndefined, z.string().trim().max(1000, 'Comentário: máximo de 1000 caracteres').optional())
});
const comentarioSchema = z.object({
  comentario: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(1000, 'Comentário: máximo de 1000 caracteres'))
});
const remocaoSchema = z.object({ motivo: z.string({ error: 'Informe o motivo da remoção' }).trim().min(1, 'Informe o motivo da remoção').max(500) });

// RF05 - relatório do hábito
const habitoQuerySchema = z.object({
  dataInicial: z.iso.date({ error: 'Informe uma data válida' }),
  dataFinal: z.iso.date({ error: 'Informe uma data válida' }),
  perfil: z.enum(['comprador', 'proprietário', 'vendedor'], { error: 'Escolha o perfil: comprador, proprietário ou vendedor' }),
  coorte: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}$/, 'Coorte inválida: use AAAA-MM').optional())
}).refine((q) => q.dataInicial <= q.dataFinal, { message: 'A data inicial não pode ser maior que a final', path: ['dataInicial'] });

module.exports = { idParams, itemSchema, importacaoSchema, avaliacaoSchema, comentarioSchema, remocaoSchema, habitoQuerySchema };
