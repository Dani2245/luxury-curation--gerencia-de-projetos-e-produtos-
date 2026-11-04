const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('\n⚠️ [SUPABASE] Variáveis SUPABASE_URL ou SUPABASE_KEY não foram preenchidas no backend/.env');
  console.warn('⚠️ Para conectar ao banco real, crie ou edite o arquivo backend/.env com as credenciais do seu projeto Supabase.\n');
}

// Remove automaticamente /rest/v1 ou barras no final
if (supabaseUrl) {
  supabaseUrl = supabaseUrl.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
};

// Cliente anônimo: usado apenas para autenticar (login e validação de token)
const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, clientOptions)
  : null;

// Cliente com o JWT do usuário: as políticas RLS do banco passam a valer para a requisição
const createUserClient = (token) => createClient(supabaseUrl, supabaseKey, {
  ...clientOptions,
  global: { headers: { Authorization: `Bearer ${token}` } }
});

module.exports = { supabase, createUserClient };
