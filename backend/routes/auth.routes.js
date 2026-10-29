const express = require('express');
const router = express.Router();
const { supabase, createUserClient } = require('../config/supabase');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const { loginSchema } = require('../schemas/auth.schema');

// POST /api/login - Autenticação com e-mail e senha via Supabase Auth
router.post('/login', validate(loginSchema), async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ message: 'Supabase não está configurado no .env' });
  }

  const { email, password, origem } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.session) {
      return res.status(401).json({ message: 'E-mail ou senha inválidos' });
    }

    const token = data.session.access_token;
    const db = createUserClient(token);
    const { data: perfil, error: perfilError } = await db
      .from('perfis')
      .select('id, nome, email, perfil')
      .eq('id', data.user.id)
      .maybeSingle();

    if (perfilError || !perfil) {
      return res.status(403).json({ message: 'Usuário sem perfil de acesso cadastrado' });
    }

    // RNF06: sessão iniciada, com a origem e a indicação de gatilho externo; falhar aqui não impede o login
    const { error: eventoError } = await db.rpc('registrar_sessao', { p_origem: origem ?? null });
    if (eventoError) console.warn('[Eventos de uso] Falha ao registrar a sessão:', eventoError.message);

    res.json({ token, expiresAt: data.session.expires_at, user: perfil });
  } catch (err) {
    console.error('Erro na rota de login:', err);
    res.status(500).json({ message: 'Erro interno ao realizar login' });
  }
});

// GET /api/me - Dados do usuário autenticado
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
