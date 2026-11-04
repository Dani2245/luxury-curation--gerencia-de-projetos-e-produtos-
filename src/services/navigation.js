const INTERNAL_ORIGIN = 'https://lastro.invalid';
const EXTERNAL_ORIGINS = new Set(['link', 'qr', 'alerta', 'email']);

// O destino vem da URL: aceite somente caminhos internos, nunca outro domínio.
export const resolveReturnPath = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/dashboard';
  try {
    const target = new URL(value, INTERNAL_ORIGIN);
    if (target.origin !== INTERNAL_ORIGIN || /^\/login(?:\/|$)/.test(target.pathname)) return '/dashboard';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/dashboard';
  }
};

export const loginUrl = ({ pathname, search = '', hash = '' }) => {
  const params = new URLSearchParams({ retorno: resolveReturnPath(`${pathname}${search}${hash}`) });
  const origem = new URLSearchParams(search).get('origem');
  if (EXTERNAL_ORIGINS.has(origem)) params.set('origem', origem);
  return `/login?${params}`;
};
