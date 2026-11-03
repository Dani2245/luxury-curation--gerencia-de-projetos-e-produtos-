import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, getUser } from '../services/api';
import OperationLayout, { Field, Feedback } from './OperationLayout';
import AppraisalDetails from './AppraisalDetails';
import { buttonClass, inputClass, primaryClass, today } from '../services/operations';

const empty = () => ({ pecaId: '', parecer: '', valorAvaliacao: '', emitidoEm: today() });
export default function Appraisals() {
  const user = getUser();
  const [params] = useSearchParams();
  const [items, setItems] = useState([]);
  const [pecas, setPecas] = useState([]);
  const [filters, setFilters] = useState({ peca: '', perito: '', inicio: '', fim: '', pecaId: params.get('pecaId') || '' });
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [files, setFiles] = useState([]);
  const [kept, setKept] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const load = useCallback(async (query) => {
    try { setItems(await apiFetch('/laudos', { params: query })); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => {
    load({ pecaId: params.get('pecaId') || '' });
    if (user?.perfil === 'Perito') apiFetch('/laudos/pecas').then(setPecas).catch((e) => setError(e.message));
  }, [load, params, user?.perfil]);
  const run = async (fn, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(filters); setNotice(message); return true; }
    catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  };
  const reset = () => { setEditing(null); setForm(empty()); setFiles([]); setKept([]); setInputKey((v) => v + 1); };
  const save = async (e) => {
    e.preventDefault();
    const data = new FormData(); Object.entries(form).forEach(([k, v]) => data.append(k, v));
    data.append('fotografiasMantidas', JSON.stringify(kept.map((f) => f.path)));
    files.forEach((f) => data.append('fotografias', f));
    if (await run(() => apiFetch(editing ? `/laudos/${editing.id}` : '/laudos', { method: editing ? 'PUT' : 'POST', formData: data }), 'Laudo salvo e assinado pelo perito.')) reset();
  };
  const edit = (item) => {
    setEditing(item); setForm({ pecaId: String(item.peca_id), parecer: item.parecer, valorAvaliacao: item.valor_avaliacao, emitidoEm: item.emitido_em });
    setKept(item.fotografias); setFiles([]); setInputKey((v) => v + 1); setNotice(''); window.scrollTo(0, 0);
  };
  const field = (name) => (e) => setForm({ ...form, [name]: e.target.value });
  return <OperationLayout title="Laudos periciais" description="Parecer técnico, avaliação de valor e fotografias assinados pelo perito responsável. Ao vincular ao passaporte, o laudo fica preservado e não pode mais ser corrigido ou removido.">
    <Feedback error={error} notice={notice} />
    {user?.perfil === 'Perito' && <form onSubmit={save} className="border border-gray-800 p-6 space-y-4 mb-8">
      <h2 className="font-serif text-xl">{editing ? 'Corrigir laudo' : 'Emitir laudo'}</h2>
      <Field id="laudo-peca" label="Peça"><select id="laudo-peca" required disabled={Boolean(editing)} className={inputClass} value={form.pecaId} onChange={field('pecaId')}><option value="">Selecione</option>{pecas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Field>
      <div className="grid sm:grid-cols-2 gap-4"><Field id="laudo-valor" label="Valor de avaliação (R$)" type="number" required min="0.01" step="0.01" value={form.valorAvaliacao} onChange={field('valorAvaliacao')} /><Field id="laudo-data" label="Data de emissão" type="date" required max={today()} value={form.emitidoEm} onChange={field('emitidoEm')} /></div>
      <Field id="laudo-parecer" label="Parecer técnico"><textarea id="laudo-parecer" required maxLength={10000} rows={5} className={inputClass} value={form.parecer} onChange={field('parecer')} /></Field>
      {kept.length > 0 && <ul className="flex flex-wrap gap-4">{kept.map((f, i) => <li key={f.path}><img src={f.url} alt="Fotografia atual" className="w-24 h-24 object-cover" /><button type="button" className={buttonClass} aria-label={`Remover foto do laudo ${i + 1}`} onClick={() => setKept(kept.filter((a) => a.path !== f.path))}>Remover foto</button></li>)}</ul>}
      <Field id="laudo-fotos" label="Fotografias da perícia (1 a 10, até 5 MB cada)"><input key={inputKey} id="laudo-fotos" type="file" multiple accept="image/jpeg,image/png,image/webp" required={!kept.length} onChange={(e) => setFiles(Array.from(e.target.files))} className={inputClass} /></Field>
      <div className="flex gap-3"><button disabled={busy} className={primaryClass}>Salvar e assinar laudo</button>{editing && <button type="button" onClick={reset} className={buttonClass}>Cancelar correção</button>}</div>
    </form>}
    <form onSubmit={(e) => { e.preventDefault(); setError(''); load(filters); }} className="grid sm:grid-cols-2 lg:grid-cols-5 items-end gap-3 mb-6">
      {['peca', 'perito', 'inicio', 'fim'].map((k) => <Field key={k} id={`laudo-f-${k}`} label={{ peca: 'Peça', perito: 'Perito responsável', inicio: 'Emitido a partir de', fim: 'Emitido até' }[k]} type={['inicio', 'fim'].includes(k) ? 'date' : 'text'} value={filters[k]} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })} />)}
      <button className={buttonClass}>Consultar laudos</button>
    </form>
    {items.length === 0 && <p className="text-gray-400">Nenhum laudo encontrado.</p>}
    <div className="space-y-5">{items.map((item) => <article key={item.id} data-testid={`laudo-${item.id}`} className="border border-gray-800 p-6 space-y-4">
      <h2 className="text-2xl font-serif">Laudo {item.id} · {item.peca_nome}</h2>
      <AppraisalDetails item={item} />
      <div className="flex flex-wrap gap-3 items-center">
        {item.passaporte_id ? <Link to={`/peca/${item.peca_id}/passaporte`} className="text-emerald-400">Vinculado ao passaporte {item.passaporte_id}</Link> : <>
          <span className="text-gray-400">Ainda não vinculado</span>
          {user?.perfil === 'Perito' && item.perito_id === user.id && <>
            <button disabled={busy} className={buttonClass} aria-label={`Corrigir laudo ${item.id}`} onClick={() => edit(item)}>Corrigir</button>
            <button disabled={busy} className={primaryClass} aria-label={`Vincular laudo ${item.id}`} onClick={() => { if (window.confirm('Vincular ao passaporte desta peça? O laudo ficará imutável.')) run(() => apiFetch(`/laudos/${item.id}/vincular`, { method: 'POST' }), 'Laudo vinculado. Assinatura do passaporte renovada.'); }}>Vincular ao passaporte</button>
            {!pecas.find((p) => p.id === item.peca_id)?.passaporte_id && <Link className={buttonClass} to={`/dashboard/passaportes/${item.peca_id}/emitir`}>Emitir passaporte da peça</Link>}
          </>}
          {(user?.perfil === 'Administrador' || (user?.perfil === 'Perito' && item.perito_id === user.id)) && <button disabled={busy} className={buttonClass} aria-label={`Remover laudo ${item.id}`} onClick={() => { if (window.confirm('Remover este laudo cadastrado incorretamente?')) run(() => apiFetch(`/laudos/${item.id}`, { method: 'DELETE' }), 'Laudo removido.'); }}>Remover</button>}
        </>}
      </div>
    </article>)}</div>
  </OperationLayout>;
}
