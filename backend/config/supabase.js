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

// Cria o cliente se as variáveis estiverem presentes
const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

module.exports = supabase;
