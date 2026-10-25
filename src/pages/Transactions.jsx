import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Stamp, X } from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime, getUser } from '../services/api';

const STATUS_STYLE = {
  pendente: { text: 'Aguardando vendedor', className: 'text-yellow-400' },
  confirmada: { text: 'Confirmada', className: 'text-emerald-400' },
  cancelada: { text: 'Cancelada', className: 'text-red-400' }
};

const inputClass = 'w-full bg-[#111] border border-gray-800 py-2 px-3 text-gray-300 focus:outline-none focus:border-gray-500 font-sans transition-colors';
const labelClass = 'block text-gray-500 font-sans text-xs tracking-widest uppercase mb-2';
const emptyFilters = { peca: '', comprador: '', vendedor: '', dataInicial: '', dataFinal: '', status: '' };

// RFC04 - acompanhamento das transações (RFS14, RFS15, RFS16 e registro da transferência, RFS08)
const Transactions = () => {
  const user = getUser();
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lastRequest = useRef(0);

  const load = useCallback(async (params) => {
    const requestId = ++lastRequest.current;
    setLoading(true);
    try {
      const data = await apiFetch('/transacoes', { params });
      if (requestId === lastRequest.current) {
        setItems(data);
        setError('');
      }
    } catch (err) {
      if (requestId === lastRequest.current) setError(err.message);
    } finally {
      if (requestId === lastRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({});
  }, [load]);

  const handleSearch = (e) => {
    e.preventDefault();
    load(filters);
  };

  const handleClear = () => {
    setFilters(emptyFilters);
    load({});
  };

  const act = async (message, request) => {
    setError('');
    setNotice('');
    try {
      await request();
      setNotice(message);
      await load(filters);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirm = (t) => {
    if (!window.confirm(`Confirmar a venda de "${t.pecaNome}" por ${formatCurrency(t.valor)}?`)) return;
    act('Venda confirmada. O passaporte digital foi atualizado com o novo proprietário.', () =>
      apiFetch(`/transacoes/${t.id}/confirmar`, { method: 'POST' }));
  };

  const handleCancel = (t) => {
    const motivo = window.prompt('Motivo do cancelamento (opcional):');
    if (motivo === null) return;
    act('Transação cancelada.', () => apiFetch(`/transacoes/${t.id}/cancelar`, { method: 'POST', body: { motivo } }));
  };

  const handleTransfer = (t) =>
    act('Transferência registrada no passaporte digital.', () =>
      apiFetch('/passaportes/transferencias', { method: 'POST', body: { transacaoId: t.id } }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-sans uppercase tracking-widest text-xs">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
      </Link>

      <h1 className="text-4xl font-serif mb-8 border-b border-gray-800 pb-6">Transações</h1>

      <form onSubmit={handleSearch} className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8 items-end">
        <div>
          <label htmlFor="t-peca" className={labelClass}>Peça</label>
          <input id="t-peca" type="text" value={filters.peca} onChange={(e) => setFilters({ ...filters, peca: e.target.value })} className={inputClass} placeholder="Nome ou número" />
        </div>
        {user.perfil !== 'Comprador' && (
          <div>
            <label htmlFor="t-comprador" className={labelClass}>Comprador</label>
            <input id="t-comprador" type="text" value={filters.comprador} onChange={(e) => setFilters({ ...filters, comprador: e.target.value })} className={inputClass} />
          </div>
        )}
        {user.perfil !== 'Vendedor' && (
          <div>
            <label htmlFor="t-vendedor" className={labelClass}>Vendedor</label>
            <input id="t-vendedor" type="text" value={filters.vendedor} onChange={(e) => setFilters({ ...filters, vendedor: e.target.value })} className={inputClass} />
          </div>
        )}
        <div>
          <label htmlFor="t-inicio" className={labelClass}>Data inicial</label>
          <input id="t-inicio" type="date" value={filters.dataInicial} onChange={(e) => setFilters({ ...filters, dataInicial: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="t-fim" className={labelClass}>Data final</label>
          <input id="t-fim" type="date" value={filters.dataFinal} onChange={(e) => setFilters({ ...filters, dataFinal: e.target.value })} className={inputClass} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="flex-1 bg-white text-black py-2 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors">Buscar</button>
          <button type="button" onClick={handleClear} className="px-3 border border-gray-700 text-gray-400 font-sans text-xs uppercase tracking-widest hover:border-white hover:text-white transition-colors">Limpar</button>
        </div>
      </form>

      {notice && (
        <div role="status" className="bg-emerald-900/40 border border-emerald-500 text-emerald-200 px-4 py-3 mb-6 font-sans text-sm">{notice}</div>
      )}
      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-gray-400 font-sans">Carregando transações...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-800">
          <p className="text-gray-500 font-sans">Nenhuma transação encontrada.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-800">
          <table className="w-full text-left font-sans text-sm">
            <caption className="sr-only">Transações</caption>
            <thead className="bg-[#111] text-gray-400 uppercase tracking-widest text-xs">
              <tr>
                <th scope="col" className="px-4 py-3">Peça</th>
                <th scope="col" className="px-4 py-3">Comprador</th>
                <th scope="col" className="px-4 py-3">Vendedor</th>
                <th scope="col" className="px-4 py-3">Valor</th>
                <th scope="col" className="px-4 py-3">Situação</th>
                <th scope="col" className="px-4 py-3">Data</th>
                <th scope="col" className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const status = STATUS_STYLE[t.status];
                return (
                  <tr key={t.id} className="border-t border-gray-800 align-top">
                    <td className="px-4 py-3 text-white">
                      <Link to={`/peca/${t.pecaId}`} className="hover:text-[#A69076]">{t.pecaNome}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{t.comprador.nome}</td>
                    <td className="px-4 py-3 text-gray-300">{t.vendedor.nome}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {formatCurrency(t.valor)}
                      {t.comissao !== null && <span className="block text-xs text-gray-500">Comissão {formatCurrency(t.comissao)}</span>}
                    </td>
                    <td className={`px-4 py-3 ${status.className}`}>
                      {status.text}
                      {t.transferenciaPendente && <span className="block text-xs text-yellow-500">Transferência pendente</span>}
                      {t.motivoCancelamento && <span className="block text-xs text-gray-500">{t.motivoCancelamento}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{formatDateTime(t.criadoEm)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {t.status === 'pendente' && user.perfil === 'Vendedor' && (
                          <button type="button" onClick={() => handleConfirm(t)} aria-label={`Confirmar venda de ${t.pecaNome}`} className="flex items-center gap-1 bg-white text-black px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-gray-200">
                            <Check className="w-3.5 h-3.5" /> Confirmar
                          </button>
                        )}
                        {t.status === 'pendente' && user.perfil !== 'Administrador' && (
                          <button type="button" onClick={() => handleCancel(t)} aria-label={`Cancelar transação de ${t.pecaNome}`} className="flex items-center gap-1 border border-gray-700 text-gray-300 px-3 py-1.5 text-xs uppercase tracking-widest hover:border-red-400 hover:text-red-400">
                            <X className="w-3.5 h-3.5" /> Cancelar
                          </button>
                        )}
                        {t.transferenciaPendente && user.perfil === 'Administrador' && (
                          <button type="button" onClick={() => handleTransfer(t)} aria-label={`Registrar transferência de ${t.pecaNome}`} className="flex items-center gap-1 border border-[#A69076] text-[#A69076] px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-[#A69076] hover:text-black">
                            <Stamp className="w-3.5 h-3.5" /> Registrar transferência
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Transactions;
