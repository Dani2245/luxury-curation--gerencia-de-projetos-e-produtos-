import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Stamp, X } from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime, getUser } from '../services/api';
import TransactionDeliveryActions from '../components/TransactionDeliveryActions';

const STATUS_STYLE = {
  pendente: { text: 'Aguardando vendedor', className: 'text-yellow-400' },
  aceita: { text: 'Aguardando pagamento', className: 'text-yellow-400' },
  paga: { text: 'Pagamento retido', className: 'text-sky-400' },
  enviada: { text: 'Enviada', className: 'text-sky-400' },
  em_conferencia: { text: 'Em conferência', className: 'text-yellow-400' },
  contestada: { text: 'Contestada', className: 'text-orange-400' },
  confirmada: { text: 'Confirmada', className: 'text-emerald-400' },
  cancelada: { text: 'Cancelada', className: 'text-red-400' }
};

const inputClass = 'w-full bg-[#111] border border-gray-800 py-2 px-3 text-gray-300 focus:outline-none focus:border-gray-500 font-sans transition-colors';
const labelClass = 'block text-gray-500 font-sans text-xs tracking-widest uppercase mb-2';
const emptyFilters = { peca: '', comprador: '', vendedor: '', dataInicial: '', dataFinal: '', status: '', prazo: '' };

// RFS38 - conferências e disputas perto da data limite (menos de 2 dias) ou vencidas
const PRAZO_STYLE = {
  proximo: { text: 'Perto da data limite', className: 'text-orange-300' },
  vencido: { text: 'Prazo vencido', className: 'text-red-400' }
};
const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const prazoInfo = (t) => {
  if (t.status === 'em_conferencia' && t.conferenciaAte) return `Conferir até ${formatDateTime(t.conferenciaAte)}`;
  if (t.status === 'contestada' && t.decisaoAte) return `Decisão até ${formatDateTime(t.decisaoAte)}`;
  if (['aceita', 'paga', 'enviada'].includes(t.status) && t.prazoConferenciaDias) return `Prazo de conferência: ${dias(t.prazoConferenciaDias)} após o recebimento`;
  return null;
};

// RFC04 - acompanhamento das transações (RFS14, RFS15, RFS16 e registro da transferência, RFS08)
const Transactions = () => {
  const user = getUser();
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
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
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request();
      setNotice(message);
      setHistory(null);
      await load(filters);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = (t) => {
    // RFS37: o vendedor declara o prazo de conferência do comprador ao aceitar
    const prazo = window.prompt(`Aceitar a proposta de "${t.pecaNome}" por ${formatCurrency(t.valor)}? A venda será concluída após a conferência.\n\nPrazo de conferência do comprador, em dias após o recebimento (1 a 30):`, '7');
    if (prazo === null) return;
    act('Proposta aceita. Aguardando pagamento simulado.', () =>
      apiFetch(`/transacoes/${t.id}/confirmar`, { method: 'POST', body: { prazoConferenciaDias: prazo } }));
  };

  const handleCancel = (t) => {
    const motivo = window.prompt('Motivo do cancelamento (opcional):');
    if (motivo === null) return;
    act('Transação cancelada.', () => apiFetch(`/transacoes/${t.id}/cancelar`, { method: 'POST', body: { motivo } }));
  };

  const handleTransfer = (t) =>
    act('Transferência registrada no passaporte digital.', () =>
      apiFetch('/passaportes/transferencias', { method: 'POST', body: { transacaoId: t.id } }));

  const showHistory = async (t) => {
    try { setHistory({ nome: t.pecaNome, eventos: await apiFetch(`/transacoes/${t.id}/historico`) }); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-sans uppercase tracking-widest text-xs">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
      </Link>

      <h1 className="text-4xl font-serif mb-8 border-b border-gray-800 pb-6">Transações</h1>
      <p className="text-gray-400 font-sans text-sm mb-6">Proposta → pagamento retido → envio → recebimento → conferência. A aprovação conclui a venda e transfere a propriedade. Pagamentos são simulados: nenhum valor real é cobrado ou transferido.</p>

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
        <div>
          <label htmlFor="t-status" className={labelClass}>Situação</label>
          <select id="t-status" className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Todas</option>{Object.entries(STATUS_STYLE).map(([v, s]) => <option key={v} value={v}>{s.text}</option>)}</select>
        </div>
        <label htmlFor="t-prazo" className="flex items-center gap-2 text-gray-400 font-sans text-xs uppercase tracking-widest pb-2">
          <input id="t-prazo" type="checkbox" checked={filters.prazo === 'proximo'} onChange={(e) => setFilters({ ...filters, prazo: e.target.checked ? 'proximo' : '' })} />
          Perto da data limite
        </label>
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
                const status = STATUS_STYLE[t.status] || { text: t.status, className: 'text-gray-400' };
                return (
                  <tr key={t.id} data-testid={`transacao-${t.id}`} className="border-t border-gray-800 align-top">
                    <td className="px-4 py-3 text-white">
                      <Link to={`/peca/${t.pecaId}`} className="hover:text-[#A69076]">{t.pecaNome}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{t.comprador.nome}</td>
                    <td className="px-4 py-3 text-gray-300">{t.vendedor.nome}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {formatCurrency(t.valor)}
                      {t.comissao !== null && <span className="block text-xs text-gray-500">Comissão {formatCurrency(t.comissao)}</span>}
                      {t.repasse !== null && <span className="block text-xs text-gray-500">Repasse {formatCurrency(t.repasse)}</span>}
                    </td>
                    <td className={`px-4 py-3 ${status.className}`}>
                      {status.text}
                      {t.transferenciaPendente && <span className="block text-xs text-yellow-500">Transferência pendente</span>}
                      {t.motivoCancelamento && <span className="block text-xs text-gray-500">{t.motivoCancelamento}</span>}
                      {t.pagamentoStatus && <span className="block text-xs text-gray-400">Pagamento simulado: {t.pagamentoStatus}</span>}
                      {t.rastreio && <span className="block text-xs text-gray-400">Envio: {t.rastreio}</span>}
                      {t.motivoContestacao && <span className="block text-xs text-orange-300">Contestação: {t.motivoContestacao}</span>}
                      {t.estadoObservado && <span className="block text-xs text-gray-400">Estado observado: {t.estadoObservado}</span>}
                      {prazoInfo(t) && (
                        <span data-testid={`prazo-${t.id}`} className="block text-xs text-gray-300">
                          {prazoInfo(t)}
                          {PRAZO_STYLE[t.prazoSituacao] && <span className={`block font-medium ${PRAZO_STYLE[t.prazoSituacao].className}`}>{PRAZO_STYLE[t.prazoSituacao].text}</span>}
                        </span>
                      )}
                      {t.resolucao && <span className="block text-xs text-gray-400">Decisão: {t.resolucao}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{formatDateTime(t.criadoEm)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {t.status === 'pendente' && user.perfil === 'Vendedor' && (
                          <button type="button" disabled={busy} onClick={() => handleConfirm(t)} aria-label={`Aceitar proposta de ${t.pecaNome}`} className="flex items-center gap-1 bg-white text-black px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-gray-200 disabled:opacity-50">
                            <Check className="w-3.5 h-3.5" /> Aceitar proposta
                          </button>
                        )}
                        {['pendente', 'aceita'].includes(t.status) && user.perfil !== 'Administrador' && (
                          <button type="button" disabled={busy} onClick={() => handleCancel(t)} aria-label={`Cancelar transação de ${t.pecaNome}`} className="flex items-center gap-1 border border-gray-700 text-gray-300 px-3 py-1.5 text-xs uppercase tracking-widest hover:border-red-400 hover:text-red-400 disabled:opacity-50">
                            <X className="w-3.5 h-3.5" /> Cancelar
                          </button>
                        )}
                        {t.transferenciaPendente && user.perfil === 'Administrador' && (
                          <button type="button" disabled={busy} onClick={() => handleTransfer(t)} aria-label={`Registrar transferência de ${t.pecaNome}`} className="flex items-center gap-1 border border-[#A69076] text-[#A69076] px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-[#A69076] hover:text-black">
                            <Stamp className="w-3.5 h-3.5" /> Registrar transferência
                          </button>
                        )}
                      </div>
                      <TransactionDeliveryActions transaction={t} perfil={user.perfil} busy={busy} act={act} />
                      <button type="button" aria-label={`Histórico da transação ${t.id}`} onClick={() => showHistory(t)} className="text-gray-400 hover:text-white text-xs mt-3">Ver histórico</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {history && <section aria-label="Histórico da transação" className="border border-gray-800 p-5 mt-6"><h2 className="font-serif text-2xl mb-4">Histórico: {history.nome}</h2>{history.eventos.length === 0 ? <p className="text-gray-400">Sem eventos registrados para esta transação histórica.</p> : <ol className="space-y-3 font-sans text-sm">{history.eventos.map((e) => <li key={e.id} className="border-l border-[#A69076] pl-3"><span className="text-gray-500">{formatDateTime(e.criado_em)}</span><p>{e.descricao}</p></li>)}</ol>}</section>}
    </div>
  );
};

export default Transactions;
