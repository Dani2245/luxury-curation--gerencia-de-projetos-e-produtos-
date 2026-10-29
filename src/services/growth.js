// Constantes de growth compartilhadas pelas telas (RFC17 a RFC20 e RF04)
export const CATEGORIAS_INTERESSE = ['obra de arte', 'joia', 'relógio', 'bolsa'];
export const STATUS_INSCRICAO = { aguardando: 'Aguardando', convidado: 'Convidado', cadastrado: 'Cadastrado' };
export const STATUS_INDICACAO = { enviada: 'Convite enviado', cadastrada: 'Conta criada', ativada: 'Conta ativada' };
export const ETAPAS_FUNIL = ['aquisição', 'ativação', 'retenção', 'receita', 'indicação'];
export const ETAPAS_INDICADOR = ['North Star', 'proteção', ...ETAPAS_FUNIL];
export const LADOS = ['comprador', 'vendedor', 'perito', 'ambos'];
export const FREQUENCIAS = ['diária', 'semanal', 'mensal'];
export const STATUS_EXPERIMENTO = ['backlog', 'em execução', 'concluído', 'descartado'];
export const SITUACAO_META = {
  'na meta': 'text-emerald-400',
  'fora da meta': 'text-orange-300',
  'sem meta': 'text-gray-400',
  'sem dados': 'text-gray-500'
};

export const slug = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatValor = (valor, unidade) => {
  if (valor === null || valor === undefined) return '—';
  if (unidade === '%') return `${numero.format(valor)}%`;
  if (unidade === 'R$') return moeda.format(valor);
  if (unidade === 'dias') return `${numero.format(valor)} dias`;
  return numero.format(valor);
};
export const formatMeta = (min, max, unidade) => {
  if (min === null && max === null) return 'Sem meta';
  if (min !== null && max !== null) return `De ${formatValor(min, unidade)} a ${formatValor(max, unidade)}`;
  return min !== null ? `Pelo menos ${formatValor(min, unidade)}` : `Até ${formatValor(max, unidade)}`;
};
