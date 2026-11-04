const { z } = require('zod');
const optional = (v) => v === '' ? undefined : v;
const json = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
const categoriaSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da categoria').max(80),
  atributos: z.array(z.string().trim().min(1).max(60)).max(20).default([])
}).refine((v) => new Set(v.atributos.map((a) => a.toLowerCase())).size === v.atributos.length,
  { message: 'Os atributos devem ter nomes diferentes', path: ['atributos'] });
const laudoSchema = z.object({
  pecaId: z.coerce.number().int().positive().safe(),
  parecer: z.string().trim().min(1, 'Informe o parecer técnico').max(10000),
  valorAvaliacao: z.coerce.number().positive('Informe um valor maior que zero').max(999999999999.99).multipleOf(0.01),
  emitidoEm: z.iso.date({ error: 'Informe uma data de emissão válida' }),
  fotografiasMantidas: z.preprocess(json, z.array(z.string()).max(10).optional())
});
const laudosQuery = z.object({
  peca: z.preprocess(optional, z.string().trim().max(256).optional()),
  perito: z.preprocess(optional, z.string().trim().max(150).optional()),
  pecaId: z.preprocess(optional, z.coerce.number().int().positive().safe().optional()),
  inicio: z.preprocess(optional, z.iso.date().optional()), fim: z.preprocess(optional, z.iso.date().optional()),
  vinculados: z.enum(['true', 'false']).optional()
}).refine((v) => !v.inicio || !v.fim || v.inicio <= v.fim, { message: 'A data inicial não pode ser maior que a final', path: ['inicio'] });
module.exports = { categoriaSchema, laudoSchema, laudosQuery };
