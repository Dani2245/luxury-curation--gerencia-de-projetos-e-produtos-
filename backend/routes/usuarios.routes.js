const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { handleDbError } = require('../utils/db-error');
const {
  createUsuarioSchema,
  updateUsuarioSchema,
  listUsuariosQuerySchema,
  usuarioIdParamSchema
} = require('../schemas/usuario.schema');

const COLUNAS = 'id, nome, email, perfil, origem, criado_em';

const formatUsuario = (item) => ({
  id: item.id,
  nome: item.nome,
  email: item.email,
  perfil: item.perfil,
  // RFC18: indicação, link, lista de espera, conteúdo, anúncio ou direto
  origem: item.origem,
  criadoEm: item.criado_em
});

// Todas as rotas de usuários são exclusivas do Administrador (RFC01)
router.use(authenticate, authorize('Administrador'));

// GET /api/usuarios - Consultar usuários por nome, e-mail ou perfil (RFS10)
router.get('/', validate(listUsuariosQuerySchema, 'query'), async (req, res) => {
  const { nome, email, perfil } = req.query;

  let query = req.db.from('perfis').select(COLUNAS).order('nome', { ascending: true });
  if (nome) query = query.ilike('nome', `%${nome}%`);
  if (email) query = query.ilike('email', `%${email}%`);
  if (perfil) query = query.eq('perfil', perfil);

  const { data, error } = await query;
  if (error) return handleDbError(res, error, 'Erro ao consultar usuários');

  res.json(data.map(formatUsuario));
});

// GET /api/usuarios/:id
router.get('/:id', validate(usuarioIdParamSchema, 'params'), async (req, res) => {
  const { data, error } = await req.db.from('perfis').select(COLUNAS).eq('id', req.params.id).maybeSingle();
  if (error) return handleDbError(res, error, 'Erro ao buscar usuário');
  if (!data) return res.status(404).json({ message: 'Usuário não encontrado' });

  res.json(formatUsuario(data));
});

// POST /api/usuarios - Inserir usuário com definição do perfil de acesso (RFS09)
router.post('/', validate(createUsuarioSchema), async (req, res) => {
  const { nome, email, perfil, senha } = req.body;

  const { data: id, error } = await req.db.rpc('admin_criar_usuario', {
    p_email: email,
    p_senha: senha,
    p_nome: nome,
    p_perfil: perfil
  });
  if (error) return handleDbError(res, error, 'Erro ao cadastrar usuário');

  // RFC18: a origem vem da indicação ou da lista de espera; sem elas, vale a informada pelo administrador
  if (req.body.origem) {
    const { error: origemError } = await req.db.rpc('definir_origem_conta', { p_id: id, p_origem: req.body.origem });
    if (origemError) return handleDbError(res, origemError, 'Erro ao registrar a origem da conta');
  }

  const { data, error: fetchError } = await req.db.from('perfis').select(COLUNAS).eq('id', id).single();
  if (fetchError) return handleDbError(res, fetchError, 'Erro ao buscar usuário cadastrado');

  res.status(201).json(formatUsuario(data));
});

// PUT /api/usuarios/:id - Editar dados cadastrais e perfil (RFS11)
router.put('/:id', validate(usuarioIdParamSchema, 'params'), validate(updateUsuarioSchema), async (req, res) => {
  const { nome, email, perfil, senha } = req.body;

  const { error } = await req.db.rpc('admin_editar_usuario', {
    p_id: req.params.id,
    p_email: email,
    p_nome: nome,
    p_perfil: perfil,
    p_senha: senha ?? null
  });
  if (error) return handleDbError(res, error, 'Erro ao atualizar usuário');

  const { data, error: fetchError } = await req.db.from('perfis').select(COLUNAS).eq('id', req.params.id).single();
  if (fetchError) return handleDbError(res, fetchError, 'Erro ao buscar usuário atualizado');

  res.json(formatUsuario(data));
});

// DELETE /api/usuarios/:id - Remover usuário (RFS12)
router.delete('/:id', validate(usuarioIdParamSchema, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('admin_remover_usuario', { p_id: req.params.id });
  if (error) return handleDbError(res, error, 'Erro ao remover usuário');

  res.status(204).send();
});

module.exports = router;
