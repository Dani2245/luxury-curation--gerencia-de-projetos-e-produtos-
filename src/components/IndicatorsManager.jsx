import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, formatDateTime } from '../services/api';
import { Field, Feedback } from './OperationLayout';
import { ETAPAS_INDICADOR, FREQUENCIAS, LADOS, SITUACAO_META, formatMeta, formatValor } from '../services/growth';
import { buttonClass, inputClass, primaryClass, displayDate } from '../services/operations';

const emptyForm = { codigo: '', nome: '', etapa: 'aquisição', lado: 'ambos', formula: '', metaMin: '', metaMax: '', frequencia: 'mensal' };

// RFC19 - North Star, métricas de proteção e indicadores do funil AARRR, com fórmula, meta e frequência (RFS65 a RFS68)
export default function IndicatorsManager() {
  const [items, setItems] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [filters, setFilters] = useState({ etapa: '', lado: '' });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (params) => {
    try { setItems(await apiFetch('/growth/indicadores', { params })); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => {
    load({});
    apiFetch('/growth/formulas').then(setFormulas).catch((e) => setError(e.message));
  }, [load]);

  const run = async (fn, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(filters); setNotice(message); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  };
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(() => apiFetch(editingId ? `/growth/indicadores/${editingId}` : '/growth/indicadores', { method: editingId ? 'PUT' : 'POST', body: form }),
      editingId ? 'Indicador atualizado. As metas anteriores ficaram no histórico.' : 'Indicador cadastrado.');
    if (ok) { setForm(emptyForm); setEditingId(null); }
  };
  const edit = (i) => {
    setEditingId(i.id);
    setForm({ codigo: i.codigo, nome: i.nome, etapa: i.etapa, lado: i.lado, formula: i.formula, metaMin: i.metaMin ?? '', metaMax: i.metaMax ?? '', frequencia: i.frequencia });
  };
  const toggle = (i) => run(() => apiFetch(`/growth/indicadores/${i.id}/ativo`, { method: 'PATCH', body: { ativo: !i.ativo } }),
    i.ativo ? 'Indicador desativado. Os valores medidos foram preservados.' : 'Indicador reativado.');
  const showHistory = async (i) => {
    try { setHistory({ indicador: i, ...(await apiFetch(`/growth/indicadores/${i.id}/historico`)) }); }
    catch (e) { setError(e.message); }
  };
  const setFld = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <section aria-label="Indicadores de growth">
      <form onSubmit={submit} aria-label={editingId ? 'Editar indicador' : 'Novo indicador'} className="border border-gray-800 p-5 mb-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <Field id="i-codigo" label="Código" required maxLength={10} value={form.codigo} onChange={setFld('codigo')} />
        <Field id="i-nome" label="Nome" required maxLength={150} value={form.nome} onChange={setFld('nome')} />
        <Field id="i-etapa" label="Etapa"><select id="i-etapa" className={inputClass} value={form.etapa} onChange={setFld('etapa')}>{ETAPAS_INDICADOR.map((et) => <option key={et} value={et}>{et}</option>)}</select></Field>
        <Field id="i-lado" label="Lado"><select id="i-lado" className={inputClass} value={form.lado} onChange={setFld('lado')}>{LADOS.map((l) => <option key={l} value={l}>{l}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field id="i-formula" label="Fórmula (calculada pelos eventos de uso)"><select id="i-formula" required className={inputClass} value={form.formula} onChange={setFld('formula')}><option value="">Escolha…</option>{formulas.map((f) => <option key={f.chave} value={f.chave}>{f.descricao} ({f.unidade})</option>)}</select></Field></div>
        <Field id="i-min" label="Meta mínima" type="number" step="0.01" value={form.metaMin} onChange={setFld('metaMin')} />
        <Field id="i-max" label="Meta máxima" type="number" step="0.01" value={form.metaMax} onChange={setFld('metaMax')} />
        <Field id="i-frequencia" label="Frequência"><select id="i-frequencia" className={inputClass} value={form.frequencia} onChange={setFld('frequencia')}>{FREQUENCIAS.map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
        <div className="flex gap-2"><button disabled={busy} className={primaryClass}>Salvar indicador</button>{editingId && <button type="button" className={buttonClass} onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancelar edição</button>}</div>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); load(filters); }} className="flex flex-wrap gap-4 items-end mb-4">
        <Field id="i-f-etapa" label="Etapa"><select id="i-f-etapa" className={inputClass} value={filters.etapa} onChange={(e) => setFilters({ ...filters, etapa: e.target.value })}><option value="">Todas</option>{ETAPAS_INDICADOR.map((et) => <option key={et} value={et}>{et}</option>)}</select></Field>
        <Field id="i-f-lado" label="Lado"><select id="i-f-lado" className={inputClass} value={filters.lado} onChange={(e) => setFilters({ ...filters, lado: e.target.value })}><option value="">Todos</option>{LADOS.map((l) => <option key={l} value={l}>{l}</option>)}</select></Field>
        <button className={buttonClass}>Filtrar indicadores</button>
      </form>
      <Feedback error={error} notice={notice} />
      <ul className="space-y-3 font-sans text-sm">
        {items.map((i) => (
          <li key={i.id} data-testid={`indicador-${i.codigo}`} className={`border border-gray-800 p-4 ${i.ativo ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-white">{i.codigo} · {i.nome} {!i.ativo && <span className="text-gray-400">(desativado)</span>}</p>
                <p className="text-gray-400">{i.etapa} · {i.lado} · {i.frequencia} · {formatMeta(i.metaMin, i.metaMax, i.unidade)}</p>
                <p className="text-gray-500 text-xs">{i.formulaDescricao}</p>
                <p className={`text-xs ${SITUACAO_META[i.situacao]}`}>
                  Último valor: {formatValor(i.ultimoValor, i.unidade)}{i.ultimoPeriodo && ` (${displayDate(i.ultimoPeriodo.inicio)} a ${displayDate(i.ultimoPeriodo.fim)})`} · {i.situacao}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" className={buttonClass} aria-label={`Editar indicador ${i.codigo}`} onClick={() => edit(i)}>Editar</button>
                <button type="button" disabled={busy} className={buttonClass} aria-label={`${i.ativo ? 'Desativar' : 'Reativar'} indicador ${i.codigo}`} onClick={() => toggle(i)}>{i.ativo ? 'Desativar' : 'Reativar'}</button>
                <button type="button" className={buttonClass} aria-label={`Histórico do indicador ${i.codigo}`} onClick={() => showHistory(i)}>Histórico</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {history && (
        <section aria-label={`Histórico do indicador ${history.indicador.codigo}`} className="border border-gray-800 p-5 mt-6 font-sans text-sm">
          <h3 className="font-serif text-xl mb-3">Histórico: {history.indicador.codigo}</h3>
          <p className="text-gray-400 mb-2">Metas anteriores</p>
          {history.metas.length === 0 ? <p className="text-gray-500 mb-4">Nenhuma alteração de meta.</p> : (
            <ul className="mb-4 space-y-1">{history.metas.map((m) => <li key={m.id}>{formatMeta(m.meta_min === null ? null : Number(m.meta_min), m.meta_max === null ? null : Number(m.meta_max), history.indicador.unidade)} · {m.frequencia} · vigente até {formatDateTime(m.vigente_ate)}</li>)}</ul>
          )}
          <p className="text-gray-400 mb-2">Valores medidos</p>
          {history.medicoes.length === 0 ? <p className="text-gray-500">Nenhuma medição ainda.</p> : (
            <ul className="space-y-1">{history.medicoes.map((m) => <li key={m.id}>{displayDate(m.inicio)} a {displayDate(m.fim)}: {formatValor(m.valor === null ? null : Number(m.valor), history.indicador.unidade)}</li>)}</ul>
          )}
        </section>
      )}
    </section>
  );
}
