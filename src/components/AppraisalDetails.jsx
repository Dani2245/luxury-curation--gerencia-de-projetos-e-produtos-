import React from 'react';
import { formatCurrency, formatDateTime } from '../services/api';
import { displayDate } from '../services/operations';

export default function AppraisalDetails({ item }) {
  return <div className="space-y-3 text-sm font-sans">
    <p>Perito: <strong>{item.perito_nome}</strong> · Emissão: {displayDate(item.emitido_em)}</p>
    <p>Valor de avaliação: <strong>{formatCurrency(item.valor_avaliacao)}</strong></p>
    <p className="whitespace-pre-wrap text-gray-300">{item.parecer}</p>
    <p className={item.assinatura_valida ? 'text-emerald-400' : 'text-red-400'}>{item.assinatura_valida ? 'Assinatura válida' : 'Assinatura inválida'} · {formatDateTime(item.assinado_em)}</p>
    <p className="text-xs text-gray-500 break-all">Código de integridade: {item.assinatura}</p>
    <div className="flex flex-wrap gap-3">{item.fotografias.map((f) => f.url && <a key={f.path} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt="Fotografia da perícia" className="w-32 h-32 object-cover" /></a>)}</div>
  </div>;
}
