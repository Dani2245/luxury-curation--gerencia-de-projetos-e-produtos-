import { formatCurrency } from './api';

export const CATEGORIAS = ['obra de arte', 'joia', 'relógio'];

// identificador sem espaço nem acento para ids de campos
export const slug = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');

export const formatCriterios = (lista) => {
  const categorias = lista.categorias.length ? lista.categorias.join(', ') : 'Todas as categorias';
  let faixa = 'qualquer valor';
  if (lista.valorMin !== null && lista.valorMax !== null) faixa = `${formatCurrency(lista.valorMin)} a ${formatCurrency(lista.valorMax)}`;
  else if (lista.valorMin !== null) faixa = `a partir de ${formatCurrency(lista.valorMin)}`;
  else if (lista.valorMax !== null) faixa = `até ${formatCurrency(lista.valorMax)}`;
  return `${categorias} · ${faixa}`;
};

export const TIPOS_ALERTA = {
  'peca compativel': 'Peça compatível com lista de desejos',
  'passaporte incompleto': 'Passaportes incompletos no estoque'
};

export const FREQUENCIAS = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' };
