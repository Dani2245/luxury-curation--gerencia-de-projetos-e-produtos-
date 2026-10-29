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

export const confirmSaleApi = async (transacaoId) => {
  const vendedor = await loginApi(USERS.vendedor.email);
  const { status, data } = await request(`/transacoes/${transacaoId}/confirmar`, { method: 'POST', token: vendedor });
  if (status !== 200) throw new Error(`Confirmação da venda falhou (${status}): ${data?.message}`);
  return completeDeliveryApi(transacaoId);
};

// Conclui uma proposta ja aceita, respeitando RFC12/RFC13 (sem atalhos no banco).
export const completeDeliveryApi = async (transacaoId) => {
  let result;
  for (const [user, path, body] of [
    [USERS.comprador, 'pagamento'],
    [USERS.vendedor, 'envio', { rastreio: 'E2E entrega de teste' }],
    [USERS.comprador, 'recebimento'],
    [USERS.comprador, 'conferencia', { aprovada: true }]
  ]) {
    result = await requestAs(user, `/transacoes/${transacaoId}/${path}`, { method: 'POST', body });
    if (result.status !== 200) throw new Error(`Etapa ${path} falhou (${result.status}): ${result.data?.message}`);
  }
  return result.data;
};

// Campos públicos padrão do link de compartilhamento: identidade do dono e valor ficam privados (RNF04)
export const CAMPOS_PADRAO = ['descricao', 'fotografias', 'documentos', 'historico_proprietarios', 'historico_eventos'];

export const createLinkApi = async (passaporteId, { user = USERS.vendedor, camposPublicos = CAMPOS_PADRAO, validade = null } = {}) => {
  const token = await loginApi(user.email);
  const { status, data } = await request('/links', { method: 'POST', token, body: { passaporteId, camposPublicos, validade } });
  if (status !== 201) throw new Error(`Geração do link falhou (${status}): ${data?.message}`);
  return data;
};

// Requisição autenticada com o perfil informado, para verificar respostas da API (ex.: 403)
export const requestAs = async (user, path, options = {}) => request(path, { ...options, token: await loginApi(user.email) });

// Listas de desejos do comprador de teste (RFC22)
export const createListApi = async (body) => {
  const { status, data } = await requestAs(USERS.comprador, '/listas', { method: 'POST', body });
  if (status !== 201) throw new Error(`Criação da lista falhou (${status}): ${data?.message}`);
  return data;
};

export const deleteListsApi = async (fragmento) => {
  const token = await loginApi(USERS.comprador.email);
  const { data } = await request('/listas', { token });
  for (const lista of (data || []).filter((l) => l.nome.includes(fragmento))) {
    await request(`/listas/${lista.id}`, { method: 'DELETE', token });
  }
};

// Alertas do usuário (RFC21); remover antes e depois mantém a suíte repetível
export const deleteAlertsApi = async (user) => {
  const token = await loginApi(user.email);
  const { data } = await request('/alertas', { token });
  for (const alerta of data || []) {
    await request(`/alertas/${alerta.id}`, { method: 'DELETE', token });
  }
};

// Remove as peças criadas pelos testes (nome com o prefixo), inclusive vendidas, com transações e passaportes
export const cleanupE2E = async (prefix = 'E2E ') => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const token = await loginApi(USERS.admin.email);
  const result = await fetch(`${SUPABASE_URL}/rest/v1/rpc/e2e_limpar_dados`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_prefixo: prefix })
  });
  if (!result.ok) throw new Error(`Limpeza E2E falhou (${result.status}). Execute backend/database/test-support.sql no ambiente de testes.`);
};
