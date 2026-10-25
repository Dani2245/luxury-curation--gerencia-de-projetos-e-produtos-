import { API_URL, PASSWORD, USERS } from './config.js';

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
