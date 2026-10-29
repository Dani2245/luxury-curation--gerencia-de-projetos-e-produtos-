import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, formatCurrency, formatDateTime } from '../services/api';
import OperationLayout, { Field, Feedback } from './OperationLayout';
import { buttonClass, primaryClass, inputClass, today, displayDate } from '../services/operations';

const FINANCIAL_CATEGORIES = { comissao_venda: 'Comissão de venda', emissao_passaporte: 'Emissão de passaporte', manutencao_passaporte: 'Manutenção de passaporte', comissao_perito: 'Comissão a perito', comissao_parceiro: 'Comissão a parceiro', custo_operacional: 'Custo operacional' };
const STATUS = { pendente: 'Aguardando vendedor', aceita: 'Aguardando pagamento', paga: 'Pagamento retido', enviada: 'Enviada', em_conferencia: 'Em conferência', contestada: 'Contestada', confirmada: 'Confirmada', cancelada: 'Cancelada' };
const initialFilters = () => ({ dataInicial: today().slice(0, 7) + '-01', dataFinal: today(), categoria: '', status: '', tipo: '' });
const freshEntry = () => ({ tipo: 'receita', categoria: 'emissao_passaporte', descricao: '', valor: '', competencia: today(), vencimento: today() });
const cell = 'p-3 border-b border-gray-800';
const PAYMENT_STATUS = { retido: 'Retido', liberado: 'Liberado', estornado: 'Estornado' };
const emptyPaymentFilters = { dataInicial: '', dataFinal: '', status: '' };
const Summary = ({ label, value, testId }) => <div className="border border-gray-800 bg-[#111] p-4"><p className="text-gray-400 font-sans text-xs mb-2">{label}</p><p data-testid={testId} className="text-xl text-white">{formatCurrency(value)}</p></div>;

export default function Reports() {
  const [mode, setMode] = useState('transacoes');
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(null);
  const [entry, setEntry] = useState(freshEntry);
  const [payments, setPayments] = useState(null);
  const [paymentFilters, setPaymentFilters] = useState(emptyPaymentFilters);
  const paymentQuery = useRef(emptyPaymentFilters);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const load = useCallback(async (kind, params) => {
    const id = ++request.current;
    setLoading(true); setError('');
    try {
      const result = await apiFetch(`/relatorios/${kind}`, { params });
      if (id === request.current) setData(result);
      if (kind === 'financeiro') {
        const p = await apiFetch('/relatorios/pagamentos', { params: paymentQuery.current });
        if (id === request.current) setPayments(p);
      }
    } catch (e) { if (id === request.current) { setError(e.message); setData(null); } }
    finally { if (id === request.current) setLoading(false); }
  }, []);
  useEffect(() => { load('transacoes', initialFilters()); }, [load]);
  const switchMode = (kind) => {
    setMode(kind); setData(null); setNotice(''); setHistory(null);
    const f = { ...filters, categoria: '', status: '', tipo: '' };
    setFilters(f); load(kind, f);
  };
  const run = async (fn, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); setNotice(message); await load(mode, filters); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  };
  const create = async (e) => {
    e.preventDefault();
    if (await run(() => apiFetch('/relatorios/lancamentos', { method: 'POST', body: entry }), 'Lançamento registrado. Consulte o período de competência informado.')) setEntry(freshEntry());
  };
  const change = (item, acao) => {
    const motivo = acao === 'cancelar' ? window.prompt('Motivo do cancelamento:') : undefined;
    if (acao === 'cancelar' && motivo === null) return;
    run(() => apiFetch(`/relatorios/lancamentos/${item.id}`, { method: 'PATCH', body: { acao, motivo } }), acao === 'liquidar' ? 'Lançamento liquidado.' : 'Lançamento cancelado. Histórico preservado.');
  };
  // RFS42: pagamentos simulados por status e período da retenção
  const filterPayments = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const p = await apiFetch('/relatorios/pagamentos', { params: paymentFilters });
      paymentQuery.current = paymentFilters;
      setPayments(p);
    } catch (err) { setError(err.message); }
  };
  const showHistory = async (item) => {
    try { setHistory({ descricao: item.descricao, eventos: await apiFetch(`/relatorios/lancamentos/${item.id}/historico`) }); }
    catch (e) { setError(e.message); }
  };
  const manualCategories = entry.tipo === 'receita' ? ['emissao_passaporte', 'manutencao_passaporte'] : ['comissao_perito', 'comissao_parceiro', 'custo_operacional'];
  return <OperationLayout title="Relatórios e financeiro" description="Consulte as negociações por categoria e acompanhe receitas, despesas e contas em aberto. Todos os valores estão em reais.">
    <div className="flex gap-3 mb-6" role="group" aria-label="Tipo de relatório"><button type="button" aria-pressed={mode === 'transacoes'} className={mode === 'transacoes' ? primaryClass : buttonClass} onClick={() => switchMode('transacoes')}>Transações por categoria</button><button type="button" aria-pressed={mode === 'financeiro'} className={mode === 'financeiro' ? primaryClass : buttonClass} onClick={() => switchMode('financeiro')}>Financeiro</button></div>
    <form onSubmit={(e) => { e.preventDefault(); load(mode, filters); }} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4 items-end">
      <Field id="r-inicio" label="Data inicial" type="date" required value={filters.dataInicial} onChange={(e) => setFilters({ ...filters, dataInicial: e.target.value })} />
      <Field id="r-fim" label="Data final" type="date" required value={filters.dataFinal} onChange={(e) => setFilters({ ...filters, dataFinal: e.target.value })} />
      <Field id="r-categoria" label="Categoria"><select id="r-categoria" className={inputClass} value={filters.categoria} onChange={(e) => setFilters({ ...filters, categoria: e.target.value })}><option value="">Todas</option>{mode === 'transacoes' ? ['obra de arte', 'joia', 'relógio'].map((c) => <option key={c} value={c}>{c}</option>) : Object.entries(FINANCIAL_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      {mode === 'transacoes' ? <Field id="r-status" label="Situação"><select id="r-status" className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Todas</option>{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field> : <Field id="r-tipo" label="Receita ou despesa"><select id="r-tipo" className={inputClass} value={filters.tipo} onChange={(e) => setFilters({ ...filters, tipo: e.target.value })}><option value="">Ambas</option><option value="receita">Receita</option><option value="despesa">Despesa</option></select></Field>}
      <button disabled={busy} className={primaryClass}>Gerar relatório</button>
    </form>
    <p className="font-sans text-xs text-gray-500 mb-5">{mode === 'transacoes' ? 'Período pela data da proposta, no horário de Brasília. O total inclui as situações selecionadas; não representa receita da plataforma.' : 'Período pela competência do lançamento. Contas a receber/pagar são os valores em aberto desse período. Cancelamentos não entram nos totais.'}</p>
    <Feedback error={error} notice={notice} />
    {loading ? <p role="status">Carregando relatório...</p> : data && mode === 'transacoes' ? <>
      <div className="grid sm:grid-cols-2 gap-4 mb-6"><Summary label="Total das transações selecionadas" value={data.total} testId="r-total" /><Summary label="Vendas concluídas entre as selecionadas" value={data.vendasConcluidas} testId="r-concluidas" /></div>
      <p className="text-gray-400 font-sans text-sm mb-4">{data.quantidade} transação(ões)</p>
      {data.grupos.length === 0 && <p className="py-8 text-gray-400">Nenhuma transação no período e filtros informados.</p>}
      {data.grupos.map((g) => <section key={g.categoria} className="mb-6 overflow-x-auto border border-gray-800"><table className="w-full text-left font-sans text-sm"><caption className="text-left font-serif text-xl p-4 bg-[#111]">{g.categoria}</caption><thead><tr>{['Peça', 'Comprador', 'Vendedor', 'Data', 'Situação', 'Valor'].map((s) => <th className={cell} scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{g.transacoes.map((t) => <tr key={t.id}><td className={cell}>{t.peca}</td><td className={cell}>{t.comprador}</td><td className={cell}>{t.vendedor}</td><td className={cell}>{formatDateTime(t.criado_em)}</td><td className={cell}>{STATUS[t.status]}</td><td className={cell}>{formatCurrency(t.valor)}</td></tr>)}</tbody><tfoot><tr><th className={cell} colSpan={5}>Subtotal · {g.quantidade} transação(ões)</th><td data-testid={`subtotal-${g.categoria}`} className={cell}>{formatCurrency(g.subtotal)}</td></tr></tfoot></table></section>)}
    </> : data && <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">{[['Receitas previstas', 'receitas'], ['Despesas previstas', 'despesas'], ['A receber', 'aReceber'], ['A pagar', 'aPagar'], ['Recebido', 'recebido'], ['Pago', 'pago'], ['Resultado previsto', 'resultadoPrevisto'], ['Saldo realizado', 'saldoRealizado']].map(([label, key]) => <Summary key={key} label={label} value={data[key]} testId={`f-${key}`} />)}</div>
      {payments && <section aria-label="Pagamentos simulados" className="mb-8">
        <h2 className="font-serif text-xl mb-2">Pagamentos simulados</h2>
        <p className="text-gray-500 text-xs font-sans mb-3">Valores de terceiros, separados da receita da Lastro. Filtre pela data da retenção e pelo status; sem datas, a consulta considera todas. Nenhum valor real é movimentado.</p>
        <form onSubmit={filterPayments} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 items-end">
          <Field id="p-inicio" label="Retido a partir de" type="date" value={paymentFilters.dataInicial} onChange={(e) => setPaymentFilters({ ...paymentFilters, dataInicial: e.target.value })} />
          <Field id="p-fim" label="Retido até" type="date" value={paymentFilters.dataFinal} onChange={(e) => setPaymentFilters({ ...paymentFilters, dataFinal: e.target.value })} />
          <Field id="p-status" label="Status do pagamento"><select id="p-status" className={inputClass} value={paymentFilters.status} onChange={(e) => setPaymentFilters({ ...paymentFilters, status: e.target.value })}><option value="">Todos</option>{Object.entries(PAYMENT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <button className={buttonClass}>Filtrar pagamentos</button>
        </form>
        <div className="grid sm:grid-cols-3 gap-3 mb-4"><Summary label="Retido aguardando conferência" value={payments.retido} /><Summary label="Repasses liberados" value={payments.repassesLiberados} /><Summary label="Estornado ao comprador" value={payments.estornado} /></div>
        {payments.pagamentos.length === 0 ? <p className="text-gray-400 py-4">Nenhum pagamento simulado com esses filtros.</p> : <div className="overflow-x-auto border border-gray-800"><table className="w-full font-sans text-sm text-left"><caption className="sr-only">Pagamentos simulados</caption><thead><tr>{['Peça', 'Comprador', 'Vendedor', 'Valor', 'Repasse', 'Status', 'Retido em', 'Liberado / estornado em'].map((s) => <th className={cell} scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{payments.pagamentos.map((p) => <tr key={p.transacaoId} data-testid={`pagamento-${p.transacaoId}`}><td className={cell}>{p.peca}</td><td className={cell}>{p.comprador}</td><td className={cell}>{p.vendedor}</td><td className={cell}>{formatCurrency(p.valor)}</td><td className={cell}>{formatCurrency(p.repasse)}</td><td className={cell}>{PAYMENT_STATUS[p.status]}</td><td className={cell}>{formatDateTime(p.retidoEm)}</td><td className={cell}>{formatDateTime(p.liberadoEm || p.estornadoEm)}</td></tr>)}</tbody></table></div>}
      </section>}
      <section className="border border-gray-800 p-5 mb-6" aria-labelledby="novo-lancamento"><h2 id="novo-lancamento" className="font-serif text-2xl mb-4">Registrar conta</h2><p className="text-gray-500 font-sans text-xs mb-4">Comissões de venda são registradas automaticamente na conclusão. Cadastre aqui as demais receitas e despesas.</p><form onSubmit={create} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <Field id="f-tipo" label="Tipo"><select id="f-tipo" className={inputClass} value={entry.tipo} onChange={(e) => setEntry({ ...entry, tipo: e.target.value, categoria: e.target.value === 'receita' ? 'emissao_passaporte' : 'comissao_perito' })}><option value="receita">Receita</option><option value="despesa">Despesa</option></select></Field>
        <Field id="f-categoria" label="Categoria"><select id="f-categoria" className={inputClass} value={entry.categoria} onChange={(e) => setEntry({ ...entry, categoria: e.target.value })}>{manualCategories.map((c) => <option key={c} value={c}>{FINANCIAL_CATEGORIES[c]}</option>)}</select></Field>
        <Field id="f-descricao" label="Descrição" required maxLength={200} value={entry.descricao} onChange={(e) => setEntry({ ...entry, descricao: e.target.value })} />
        <Field id="f-valor" label="Valor (R$)" type="number" required min="0.01" max="999999999999.99" step="0.01" value={entry.valor} onChange={(e) => setEntry({ ...entry, valor: e.target.value })} />
        <Field id="f-competencia" label="Competência" type="date" required value={entry.competencia} onChange={(e) => setEntry({ ...entry, competencia: e.target.value })} />
        <Field id="f-vencimento" label="Vencimento" type="date" required value={entry.vencimento} onChange={(e) => setEntry({ ...entry, vencimento: e.target.value })} />
        <button disabled={busy} className={primaryClass}>Registrar lançamento</button>
      </form></section>
      {data.lancamentos.length === 0 ? <p className="text-gray-400 py-6">Nenhum lançamento no período e filtros informados.</p> : <div className="overflow-x-auto border border-gray-800"><table className="w-full font-sans text-sm text-left"><caption className="sr-only">Lançamentos financeiros</caption><thead><tr>{['Descrição / categoria', 'Competência / vencimento', 'Tipo', 'Valor', 'Situação', 'Ações'].map((s) => <th className={cell} scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{data.lancamentos.map((l) => <tr key={l.id} data-testid={`lancamento-${l.id}`}><td className={cell}>{l.descricao}<span className="block text-xs text-gray-500">{FINANCIAL_CATEGORIES[l.categoria]} · {l.origem === 'venda' ? 'Automático' : 'Manual'}</span></td><td className={cell}>{displayDate(l.competencia)}<span className="block text-gray-500">Vence: {displayDate(l.vencimento)}</span></td><td className={cell}>{l.tipo}</td><td className={cell}>{formatCurrency(l.valor)}</td><td className={cell}>{l.status}<p className="text-gray-500 text-xs">{l.motivo_cancelamento}</p></td><td className={cell}><div className="flex gap-2 flex-wrap">{l.status === 'aberto' && l.origem === 'manual' && <><button type="button" disabled={busy} aria-label={`Liquidar lançamento ${l.id}`} className={buttonClass} onClick={() => change(l, 'liquidar')}>Liquidar</button><button type="button" disabled={busy} aria-label={`Cancelar lançamento ${l.id}`} className={buttonClass} onClick={() => change(l, 'cancelar')}>Cancelar</button></>}<button type="button" className={buttonClass} aria-label={`Histórico do lançamento ${l.id}`} onClick={() => showHistory(l)}>Histórico</button></div></td></tr>)}</tbody></table></div>}
      {history && <section aria-label="Histórico financeiro" className="mt-6 border border-gray-800 p-5"><h2 className="font-serif text-xl mb-3">Histórico: {history.descricao}</h2><ol className="space-y-2 text-sm font-sans">{history.eventos.map((e) => <li key={e.id}>{e.acao} · {formatDateTime(e.criado_em)} · {e.perfis?.nome}<p className="text-gray-400">{e.observacao}</p></li>)}</ol></section>}
    </>}
  </OperationLayout>;
}
