const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const validate = require('../middlewares/validate');
const { loginSchema } = require('../schemas/auth.schema');

// POST /api/login - Autenticação com validação Zod e integração Supabase Auth
router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    // Se Supabase estiver conectado, tenta autenticar no Supabase Auth
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (!error && data?.session) {
        return res.json({
          token: data.session.access_token,
          user: {
            id: data.user.id,
            name: data.user.user_metadata?.name || email.split('@')[0],
            email: data.user.email,
            role: data.user.user_metadata?.role || 'Vendedor'
          }
        });
      }

      console.warn('[Supabase Auth Warning]:', error?.message);
    }

    // Modo fallback de desenvolvimento (para testes locais rápidos)
    return res.json({
      token: 'mock-jwt-token-luxury-curation',
      user: {
        id: '1',
        name: email.split('@')[0].toUpperCase(),
        email: email,
        role: 'Vendedor'
      }
    });
  } catch (err) {
    console.error('Erro na rota de login:', err);
    res.status(500).json({ message: 'Erro interno ao realizar login' });
  }
});

// POST /api/register - Criação de usuário no Supabase Auth (opcional)
router.post('/register', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  if (!supabase) {
    return res.status(400).json({ message: 'Supabase não está configurado no .env' });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: 'Vendedor'
        }
      }
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.status(201).json({
      message: 'Usuário registrado com sucesso!',
      user: data.user
    });
  } catch (err) {
    console.error('Erro ao registrar usuário:', err);
    res.status(500).json({ message: 'Erro interno ao cadastrar usuário' });
  }
});

module.exports = router;
