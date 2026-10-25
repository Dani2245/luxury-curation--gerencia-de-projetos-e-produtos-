const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const getToken = () => localStorage.getItem('token');

export const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
};

export const saveSession = (token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  window.dispatchEvent(new Event('session-changed'));
};

export const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('session-changed'));
};

/**
 * Requisição à API. `body` é enviado como JSON; `formData` como multipart.
 * Sessão expirada (401 com token salvo) encerra a sessão e leva ao login.
 */
export const apiFetch = async (path, { method = 'GET', body, formData, params } = {}) => {
  const query = params
    ? new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null)).toString()
    : '';
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_URL}/api${path}${query ? `?${query}` : ''}`, {
      method,
      headers,
      body: formData || (body ? JSON.stringify(body) : undefined)
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor', 0);
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearSession();
      window.location.assign('/login');
    }
    throw new ApiError(data.message || 'Erro ao processar a requisição', response.status);
  }

  return data;
};

export const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export const formatDate = (value) => (value ? new Date(value).toLocaleDateString('pt-BR') : '—');

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
