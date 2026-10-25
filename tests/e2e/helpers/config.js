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
