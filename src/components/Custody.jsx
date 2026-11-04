import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, formatDateTime } from '../services/api';
import OperationLayout, { Field, Feedback } from './OperationLayout';
import { buttonClass, primaryClass, inputClass, displayDate, today } from '../services/operations';

const emptyFilters = { peca: '', local: '', status: '' };
const freshEntry = () => ({ pecaId: '', tipoLocal: 'cofre', local: '', entradaEm: today(), responsavel: '' });
const LocationType = ({ id, value, onChange }) => <Field id={id} label="Tipo de local"><select id={id} value={value} onChange={onChange} className={inputClass}><option value="cofre">Cofre</option><option value="sala de guarda">Sala de guarda</option></select></Field>;

export default function Custody() {
  const [items, setItems] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [entry, setEntry] = useState(freshEntry);
  const [action, setAction] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const load = useCallback(async (params) => {
    const id = ++request.current;
    setLoading(true);
    try { const data = await apiFetch('/custodias', { params }); if (id === request.current) setItems(data); }
    catch (e) { if (id === request.current) setError(e.message); }
    finally { if (id === request.current) setLoading(false); }
  }, []);
  useEffect(() => {
    load({});
    apiFetch('/custodias/pecas').then(setPieces).catch((e) => setError(e.message));
  }, [load]);
  const run = async (requestFn, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await requestFn(); setNotice(message); setAction(null); setHistory(null); await load(filters); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  };
  const create = async (e) => {
    e.preventDefault();
    if (await run(() => apiFetch('/custodias', { method: 'POST', body: entry }), 'Entrada registrada.')) setEntry(freshEntry());
  };
  const submitAction = async (e) => {
    e.preventDefault();
    const exit = action.kind === 'exit';
    await run(() => apiFetch(`/custodias/${action.id}${exit ? '/saida' : ''}`, {
      method: exit ? 'POST' : 'PATCH', body: exit ? { saidaEm: action.saidaEm, motivo: action.motivo }
        : { tipoLocal: action.tipoLocal, local: action.local, observacao: action.observacao }
    }), exit ? 'Saída registrada. O histórico foi preservado.' : 'Localização atualizada.');
  };
  const showHistory = async (item) => {
    setError('');
    try { setHistory({ nome: item.peca_nome, eventos: await apiFetch(`/custodias/${item.id}/historico`) }); }
    catch (e) { setError(e.message); }
  };
  return <OperationLayout title="Custódia física" description="Controle a entrada, a localização e a saída das peças sob guarda. Cada movimentação mantém o histórico do recebimento até a retirada.">
    <Feedback error={error} notice={notice} />
    <section className="border border-gray-800 bg-[#101010] p-5 mb-8" aria-labelledby="custodia-entrada">
      <h2 id="custodia-entrada" className="font-serif text-2xl mb-5">Registrar entrada</h2>
      <form onSubmit={create} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field id="c-peca" label="Peça"><select id="c-peca" required value={entry.pecaId} onChange={(e) => setEntry({ ...entry, pecaId: e.target.value })} className={inputClass}><option value="">Selecione uma peça</option>{pieces.map((p) => <option key={p.id} value={p.id}>{p.nome} · #{p.id}</option>)}</select></Field>
        <LocationType id="c-tipo" value={entry.tipoLocal} onChange={(e) => setEntry({ ...entry, tipoLocal: e.target.value })} />
        <Field id="c-local" label="Local de guarda" required maxLength={150} value={entry.local} onChange={(e) => setEntry({ ...entry, local: e.target.value })} placeholder="Ex.: Cofre A, gaveta 2" />
        <Field id="c-entrada" label="Data de entrada" type="date" required max={today()} value={entry.entradaEm} onChange={(e) => setEntry({ ...entry, entradaEm: e.target.value })} />
        <Field id="c-responsavel" label="Responsável pelo recebimento" required maxLength={150} value={entry.responsavel} onChange={(e) => setEntry({ ...entry, responsavel: e.target.value })} />
        <div className="self-end"><button disabled={busy} className={primaryClass}>Registrar entrada</button></div>
      </form>
    </section>
    <form onSubmit={(e) => { e.preventDefault(); setError(''); load(filters); }} className="grid sm:grid-cols-4 gap-4 mb-6 items-end">
      <Field id="c-filtro-peca" label="Peça: nome ou número" value={filters.peca} onChange={(e) => setFilters({ ...filters, peca: e.target.value })} />
      <Field id="c-filtro-local" label="Local" value={filters.local} onChange={(e) => setFilters({ ...filters, local: e.target.value })} />
      <Field id="c-filtro-status" label="Situação"><select id="c-filtro-status" className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Todas</option><option value="em custodia">Em custódia</option><option value="retirada">Retirada</option></select></Field>
      <div className="flex gap-2"><button className={buttonClass}>Buscar</button><button type="button" className={buttonClass} onClick={() => { setFilters(emptyFilters); load({}); }}>Limpar</button></div>
    </form>
    {loading ? <p role="status">Carregando custódias...</p> : items.length === 0 ? <p className="text-gray-400 py-10">Nenhuma custódia encontrada.</p> : <div className="overflow-x-auto border border-gray-800"><table className="w-full font-sans text-sm text-left">
      <caption className="sr-only">Custódias</caption><thead className="bg-[#151515] text-gray-400"><tr>{['Peça', 'Local', 'Entrada / responsável', 'Situação', 'Ações'].map((h) => <th scope="col" className="p-4" key={h}>{h}</th>)}</tr></thead>
      <tbody>{items.map((c) => <tr key={c.id} data-testid={`custodia-${c.id}`} className="border-t border-gray-800 align-top">
        <td className="p-4 text-white">{c.peca_nome}<span className="block text-gray-500 text-xs">Guarda #{c.id}</span></td>
        <td className="p-4">{c.tipo_local}: {c.local}</td><td className="p-4">{displayDate(c.entrada_em)}<span className="block text-gray-400">{c.responsavel}</span></td>
        <td className="p-4">{c.saida_em ? <><span className="text-gray-400">Retirada em {displayDate(c.saida_em)}</span><p>{c.motivo_saida}</p></> : <span className="text-emerald-400">Em custódia</span>}</td>
        <td className="p-4"><div className="flex gap-2 flex-wrap">
          {!c.saida_em && <><button type="button" className={buttonClass} aria-label={`Mover custódia ${c.id}`} onClick={() => setAction({ ...c, kind: 'move', tipoLocal: c.tipo_local, observacao: '' })}>Mover</button><button type="button" className={buttonClass} aria-label={`Saída da custódia ${c.id}`} onClick={() => setAction({ ...c, kind: 'exit', saidaEm: today(), motivo: '' })}>Registrar saída</button></>}
          <button type="button" className={buttonClass} aria-label={`Histórico da custódia ${c.id}`} onClick={() => showHistory(c)}>Histórico</button>
        </div></td></tr>)}</tbody></table></div>}
    {action && <section className="my-6 border border-[#A69076]/50 p-5" aria-labelledby="custodia-acao"><h2 id="custodia-acao" className="font-serif text-2xl mb-4">{action.kind === 'exit' ? 'Registrar saída' : 'Mover peça'}: {action.peca_nome}</h2><form onSubmit={submitAction} className="grid sm:grid-cols-3 gap-4 items-end">
      {action.kind === 'exit' ? <><Field id="c-saida" label="Data de saída" type="date" required min={action.entrada_em} max={today()} value={action.saidaEm} onChange={(e) => setAction({ ...action, saidaEm: e.target.value })} /><Field id="c-motivo" label="Motivo da saída" required maxLength={500} value={action.motivo} onChange={(e) => setAction({ ...action, motivo: e.target.value })} /></> : <><LocationType id="c-novo-tipo" value={action.tipoLocal} onChange={(e) => setAction({ ...action, tipoLocal: e.target.value })} /><Field id="c-novo-local" label="Novo local" required maxLength={150} value={action.local} onChange={(e) => setAction({ ...action, local: e.target.value })} /><Field id="c-observacao" label="Observação" maxLength={500} value={action.observacao} onChange={(e) => setAction({ ...action, observacao: e.target.value })} /></>}
      <div className="flex gap-2"><button disabled={busy} className={primaryClass}>Salvar movimentação</button><button type="button" className={buttonClass} onClick={() => setAction(null)}>Cancelar</button></div>
    </form></section>}
    {history && <section className="mt-6 border border-gray-800 p-5" aria-label="Histórico da custódia"><h2 className="font-serif text-2xl mb-4">Histórico: {history.nome}</h2><ol className="space-y-3">{history.eventos.map((e) => <li key={e.id} className="border-l border-[#A69076] pl-4 font-sans text-sm"><strong>{e.tipo}</strong> · {formatDateTime(e.criado_em)} · {e.perfis?.nome}<p>{e.local_anterior}{e.local_destino && ` → ${e.local_destino}`}</p><p className="text-gray-400">{e.observacao}</p></li>)}</ol></section>}
  </OperationLayout>;
}
