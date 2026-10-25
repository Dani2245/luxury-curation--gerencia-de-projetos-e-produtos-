import fs from 'node:fs';
import path from 'node:path';
import { API_URL, FIXTURES, PASSWORD, SUPABASE_KEY, SUPABASE_URL, USERS } from './config.js';

const request = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, data };
};

export const loginApi = async (email, password = PASSWORD) => {
  const { status, data } = await request('/login', { method: 'POST', body: { email, password } });
  if (status !== 200) throw new Error(`Login via API falhou para ${email} (${status})`);
  return data.token;
};

// Remoção de dados criados pelos testes, para a suíte ser repetível
export const deletePecasByName = async (nome) => {
  const token = await loginApi(USERS.vendedor.email);
  const { data } = await request('/pecas/minhas', { token });
  for (const peca of data.filter((p) => p.nome.includes(nome))) {
    await request(`/pecas/${peca.id}`, { method: 'DELETE', token });
  }
};

export const deleteUsersByEmail = async (fragment) => {
  const token = await loginApi(USERS.admin.email);
  const { data } = await request(`/usuarios?email=${encodeURIComponent(fragment)}`, { token });
  for (const usuario of data) {
    await request(`/usuarios/${usuario.id}`, { method: 'DELETE', token });
  }
};

export const createUserApi = async (usuario) => {
  const token = await loginApi(USERS.admin.email);
  return request('/usuarios', { method: 'POST', token, body: usuario });
};

const pdfBlob = (name) => new Blob([fs.readFileSync(path.join(FIXTURES, name))], { type: 'application/pdf' });

const multipart = async (path, { method = 'POST', token, fields = {}, files = [] }) => {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  files.forEach(({ campo, arquivo }) => form.append(campo, pdfBlob(arquivo), arquivo));
  const response = await fetch(`${API_URL}/api${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path} falhou (${response.status}): ${data?.message}`);
  return data;
};

// Peça publicada do vendedor de teste, pronta para receber passaporte e propostas
export const createPublishedPecaApi = async ({ nome, categoria = 'relógio', valor = 50000 }) => {
  const vendedor = await loginApi(USERS.vendedor.email);
  const peca = await multipart('/pecas', {
    token: vendedor,
    fields: { nome, categoria, valorPretendido: valor, descricao: 'Peça criada pelos testes end-to-end' }
  });
  const admin = await loginApi(USERS.admin.email);
  await request(`/pecas/${peca.id}/publicacao`, { method: 'PATCH', token: admin, body: { publicacao: 'publicada' } });
  return peca;
};

export const issuePassportApi = async (pecaId, { status = 'valido', proprietarios = '' } = {}) => {
  const perito = await loginApi(USERS.perito.email);
  return multipart('/passaportes', {
    token: perito,
    fields: { pecaId, status, proprietarios },
    files: [{ campo: 'certificados', arquivo: 'certificado.pdf' }]
  });
};

export const proposeApi = async (pecaId, valor) => {
  const comprador = await loginApi(USERS.comprador.email);
  const { status, data } = await request('/transacoes', { method: 'POST', token: comprador, body: { pecaId, valor } });
  if (status !== 201) throw new Error(`Proposta falhou (${status}): ${data?.message}`);
  return data;
};

// Remove as peças criadas pelos testes (nome com o prefixo), inclusive vendidas, com transações e passaportes
export const cleanupE2E = async (prefix = 'E2E ') => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const token = await loginApi(USERS.admin.email);
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/e2e_limpar_dados`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_prefixo: prefix })
  });
};
