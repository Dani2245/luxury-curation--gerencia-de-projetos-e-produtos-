const { supabase, createUserClient } = require('../config/supabase');

/**
 * Exige um token Bearer válido e carrega o perfil do usuário.
 * Disponibiliza req.user (id, nome, email, perfil) e req.db (cliente Supabase com o JWT do usuário).
 */
const authenticate = async (req, res, next) => {
  if (!supabase) {
    return res.status(500).json({ message: 'Supabase não está configurado no .env' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ message: 'Autenticação necessária' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ message: 'Sessão inválida ou expirada' });
  }

  const db = createUserClient(token);
  const { data: perfil, error: perfilError } = await db
    .from('perfis')
    .select('id, nome, email, perfil')
    .eq('id', data.user.id)
    .maybeSingle();

  if (perfilError || !perfil) {
    return res.status(403).json({ message: 'Perfil de usuário não encontrado' });
  }

  req.user = perfil;
  req.db = db;
  next();
};

/**
 * Restringe a rota aos perfis informados (Administrador, Vendedor, Comprador, Perito).
 */
const authorize = (...perfis) => (req, res, next) => {
  if (!perfis.includes(req.user?.perfil)) {
    return res.status(403).json({ message: 'Acesso negado para o seu perfil' });
  }
  next();
};

module.exports = { authenticate, authorize };
