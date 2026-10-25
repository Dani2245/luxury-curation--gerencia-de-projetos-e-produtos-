// Ambiente alvo dos testes: frontend, API e usuários do seed (backend/database/seed.sql)
export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';
export const API_URL = process.env.E2E_API_URL || 'http://localhost:3000';
export const HEADLESS = process.env.E2E_HEADLESS !== 'false';
export const PASSWORD = process.env.E2E_PASSWORD || 'Lastro@2026';

export const USERS = {
  admin: { email: 'admin@lastro.com', nome: 'Helena Duarte', perfil: 'Administrador' },
  vendedor: { email: 'vendedor@lastro.com', nome: 'Rafael Moreira', perfil: 'Vendedor' },
  comprador: { email: 'comprador@lastro.com', nome: 'Beatriz Almeida', perfil: 'Comprador' },
  perito: { email: 'perito@lastro.com', nome: 'Carlos Menezes', perfil: 'Perito' }
};

// Credenciais do Supabase (backend/.env), usadas apenas para limpar os dados criados pelos testes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/.env');
const env = {};
try {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2];
  }
} catch {
  // sem backend/.env a limpeza é ignorada
}

export const SUPABASE_URL = (process.env.E2E_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
export const SUPABASE_KEY = process.env.E2E_SUPABASE_KEY || env.SUPABASE_KEY || '';
export const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
