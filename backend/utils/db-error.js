// Traduz erros do Postgres/PostgREST para respostas HTTP
const handleDbError = (res, error, fallbackMessage) => {
  const code = error?.code;

  if (code === '42501') return res.status(403).json({ message: 'Acesso negado para o seu perfil' });
  if (code === 'P0002') return res.status(404).json({ message: error.message });
  if (code === 'P0001') return res.status(400).json({ message: error.message });
  if (code === '23505' || code === '23503') return res.status(409).json({ message: error.message });

  console.error(`[Supabase] ${fallbackMessage}:`, error?.message);
  return res.status(500).json({ message: fallbackMessage });
};

module.exports = { handleDbError };
