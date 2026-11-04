const { z } = require('zod');

const PERFIS = ['Administrador', 'Vendedor', 'Comprador', 'Perito'];

const emptyToUndefined = (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val);

const nomeField = z
  .string({ error: 'O nome é obrigatório' })
  .trim()
  .min(3, 'O nome deve ter pelo menos 3 caracteres')
  .max(150, 'O nome deve ter no máximo 150 caracteres');

const emailField = z
  .string({ error: 'O e-mail é obrigatório' })
  .trim()
  .email('Formato de e-mail inválido')
  .max(255, 'O e-mail deve ter no máximo 255 caracteres');

const perfilField = z.enum(PERFIS, { error: 'Perfil inválido. Escolha: Administrador, Vendedor, Comprador ou Perito' });

const senhaField = z
  .string({ error: 'A senha é obrigatória' })
  .min(8, 'A senha deve conter no mínimo 8 caracteres')
  .max(72, 'A senha deve conter no máximo 72 caracteres');

const createUsuarioSchema = z.object({
  nome: nomeField,
  email: emailField,
  perfil: perfilField,
  senha: senhaField,
  // RFC18: usada só quando a conta não vem de indicação nem da lista de espera
  origem: z.preprocess(emptyToUndefined, z.enum(['link', 'conteúdo', 'anúncio', 'direto'], { error: 'Origem inválida' }).optional())
});

// Na edição a senha é opcional: em branco mantém a senha atual
const updateUsuarioSchema = z.object({
  nome: nomeField,
  email: emailField,
  perfil: perfilField,
  senha: z.preprocess(emptyToUndefined, senhaField.optional())
});

const listUsuariosQuerySchema = z.object({
  nome: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  email: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  perfil: z.preprocess(emptyToUndefined, perfilField.optional())
});

const usuarioIdParamSchema = z.object({
  id: z.uuid({ error: 'Identificador de usuário inválido' })
});

module.exports = {
  PERFIS,
  createUsuarioSchema,
  updateUsuarioSchema,
  listUsuariosQuerySchema,
  usuarioIdParamSchema
};
