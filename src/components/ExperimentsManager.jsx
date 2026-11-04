import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { Field, Feedback } from './OperationLayout';
import { ETAPAS_FUNIL, STATUS_EXPERIMENTO } from '../services/growth';
import { buttonClass, inputClass, primaryClass } from '../services/operations';

const emptyForm = {
  titulo: '', hipotese: '', etapa: 'aquisição', indicador: '', impacto: 5, confianca: 5, facilidade: 5,
  criterioSucesso: '', status: 'backlog', resultado: '', decisao: ''
};
const ice = (f) => Math.round(((Number(f.impacto) + Number(f.confianca) + Number(f.facilidade)) / 3) * 10) / 10;

// RFC20 - experimentos com hipótese, etapa, indicador e critério de sucesso, priorizados pelo ICE Score (RFS69 a RFS72)
export default function ExperimentsManager() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ etapa: '', status: '' });
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (params) => {
    try { setItems(await apiFetch('/growth/experimentos', { params })); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load({}); }, [load]);

  const run = async (fn, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(filters); setNotice(message); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  };
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(() => apiFetch(editing ? `/growth/experimentos/${editing.id}` : '/growth/experimentos', { method: editing ? 'PUT' : 'POST', body: form }),
      editing ? 'Experimento atualizado.' : `Experimento registrado no backlog com ICE ${ice(form)}.`);
    if (ok) { setForm(emptyForm); setEditing(null); }
  };
  const edit = (x) => {
    setEditing(x);
    setForm({
      titulo: x.titulo, hipotese: x.hipotese, etapa: x.etapa, indicador: x.indicador, impacto: x.impacto, confianca: x.confianca,
      facilidade: x.facilidade, criterioSucesso: x.criterioSucesso, status: x.status, resultado: x.resultado || '', decisao: x.decisao || ''
    });
    window.scrollTo(0, 0);
  };
  const remove = (x) => {
    if (!window.confirm(`Excluir o experimento "${x.titulo}" do backlog?`)) return;
    run(() => apiFetch(`/growth/experimentos/${x.id}`, { method: 'DELETE' }), 'Experimento excluído.');
  };
  const setFld = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const historico = editing && ['concluído', 'descartado'].includes(editing.status);

  return (
    <section aria-label="Experimentos de growth">
      <form onSubmit={submit} aria-label={editing ? 'Editar experimento' : 'Novo experimento'} className="border border-gray-800 p-5 mb-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div className="sm:col-span-2"><Field id="x-titulo" label="Título" required maxLength={150} value={form.titulo} onChange={setFld('titulo')} /></div>
        <Field id="x-etapa" label="Etapa do funil"><select id="x-etapa" className={inputClass} value={form.etapa} onChange={setFld('etapa')}>{ETAPAS_FUNIL.map((et) => <option key={et} value={et}>{et}</option>)}</select></Field>
        <Field id="x-indicador" label="Indicador" required maxLength={200} value={form.indicador} onChange={setFld('indicador')} />
        <div className="sm:col-span-2 lg:col-span-4"><Field id="x-hipotese" label="Hipótese"><textarea id="x-hipotese" required maxLength={2000} className={inputClass} value={form.hipotese} onChange={setFld('hipotese')} /></Field></div>
        <Field id="x-impacto" label="Impacto (1 a 10)" type="number" min="1" max="10" required value={form.impacto} onChange={setFld('impacto')} />
        <Field id="x-confianca" label="Confiança (1 a 10)" type="number" min="1" max="10" required value={form.confianca} onChange={setFld('confianca')} />
        <Field id="x-facilidade" label="Facilidade (1 a 10)" type="number" min="1" max="10" required value={form.facilidade} onChange={setFld('facilidade')} />
        <p className="font-sans text-sm text-gray-300 pb-2">ICE Score: <span data-testid="x-ice">{ice(form)}</span></p>
        <div className="sm:col-span-2 lg:col-span-4"><Field id="x-criterio" label="Critério de sucesso" required maxLength={1000} value={form.criterioSucesso} onChange={setFld('criterioSucesso')} /></div>
        {editing && <>
          <Field id="x-status" label="Status"><select id="x-status" className={inputClass} value={form.status} onChange={setFld('status')}>{STATUS_EXPERIMENTO.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
          <Field id="x-resultado" label="Resultado" maxLength={2000} value={form.resultado} onChange={setFld('resultado')} />
          <Field id="x-decisao" label="Decisão tomada" maxLength={1000} value={form.decisao} onChange={setFld('decisao')} />
        </>}
        <div className="flex gap-2"><button disabled={busy || historico} className={primaryClass}>Salvar experimento</button>{editing && <button type="button" className={buttonClass} onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancelar edição</button>}</div>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); load(filters); }} className="flex flex-wrap gap-4 items-end mb-4">
        <Field id="x-f-etapa" label="Etapa"><select id="x-f-etapa" className={inputClass} value={filters.etapa} onChange={(e) => setFilters({ ...filters, etapa: e.target.value })}><option value="">Todas</option>{ETAPAS_FUNIL.map((et) => <option key={et} value={et}>{et}</option>)}</select></Field>
        <Field id="x-f-status" label="Status"><select id="x-f-status" className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Todos</option>{STATUS_EXPERIMENTO.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        <button className={buttonClass}>Filtrar experimentos</button>
      </form>
      <Feedback error={error} notice={notice} />
      <p className="font-sans text-xs text-gray-500 mb-3">Backlog ordenado pelo ICE Score (média de impacto, confiança e facilidade).</p>
      <ol className="space-y-3 font-sans text-sm">
        {items.map((x) => (
          <li key={x.id} data-testid={`experimento-${x.id}`} className="border border-gray-800 p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div className="max-w-3xl">
                <p className="text-white">{x.titulo} · <span data-col="ice">ICE {x.ice}</span> · {x.etapa} · <span data-col="status">{x.status}</span></p>
                <p className="text-gray-400">{x.hipotese}</p>
                <p className="text-gray-500 text-xs">Indicador: {x.indicador} · I {x.impacto} · C {x.confianca} · F {x.facilidade} · Critério: {x.criterioSucesso}</p>
                {x.resultado && <p className="text-gray-300 text-xs">Resultado: {x.resultado} · Decisão: {x.decisao}</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" className={buttonClass} aria-label={`Editar experimento ${x.titulo}`} onClick={() => edit(x)}>Editar</button>
                {x.status === 'backlog' && <button type="button" disabled={busy} className={buttonClass} aria-label={`Excluir experimento ${x.titulo}`} onClick={() => remove(x)}>Excluir</button>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
