import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, formatDateTime } from '../services/api';
import OperationLayout, { Field, Feedback } from '../components/OperationLayout';
import { CATEGORIAS_INTERESSE, STATUS_INSCRICAO } from '../services/growth';
import { buttonClass, inputClass, primaryClass } from '../services/operations';

const emptyFilters = { perfil: '', categoria: '', versao: '', origem: '', dataInicial: '', dataFinal: '' };
const cell = 'p-3 border-b border-gray-800 align-top';

// RFC17 - consulta, edição e exclusão das inscrições na lista de espera (RFS58 a RFS60)
const WaitlistAdmin = () => {
  const [filters, setFilters] = useState(emptyFilters);
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (params) => {
    try { setData(await apiFetch('/lista-espera', { params })); setError(''); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load({}); }, [load]);

  const run = async (fn, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); setEditing(null); await load(filters); setNotice(message); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const save = (e) => {
    e.preventDefault();
    const { id, ...body } = editing;
    run(() => apiFetch(`/lista-espera/${id}`, { method: 'PUT', body }), 'Inscrição atualizada.');
  };
  const remove = (i) => {
    if (!window.confirm(`Excluir a inscrição de ${i.email}? Use também quando o inscrito pedir a exclusão.`)) return;
    run(() => apiFetch(`/lista-espera/${i.id}`, { method: 'DELETE' }), 'Inscrição excluída.');
  };
  const setF = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <OperationLayout title="Lista de espera" description="Inscrições feitas pela página pública, com a versão da página e a origem do acesso, para os experimentos de aquisição.">
      <form onSubmit={(e) => { e.preventDefault(); load(filters); }} className="grid sm:grid-cols-3 lg:grid-cols-7 gap-4 items-end mb-6">
        <Field id="le-f-perfil" label="Perfil"><select id="le-f-perfil" className={inputClass} value={filters.perfil} onChange={setF('perfil')}><option value="">Todos</option><option value="comprador">Comprador</option><option value="vendedor">Vendedor</option></select></Field>
        <Field id="le-f-categoria" label="Categoria"><select id="le-f-categoria" className={inputClass} value={filters.categoria} onChange={setF('categoria')}><option value="">Todas</option>{CATEGORIAS_INTERESSE.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field id="le-f-versao" label="Versão da página" value={filters.versao} onChange={setF('versao')} />
        <Field id="le-f-origem" label="Origem" value={filters.origem} onChange={setF('origem')} />
        <Field id="le-f-inicio" label="Data inicial" type="date" value={filters.dataInicial} onChange={setF('dataInicial')} />
        <Field id="le-f-fim" label="Data final" type="date" value={filters.dataFinal} onChange={setF('dataFinal')} />
        <div className="flex gap-2"><button className={primaryClass}>Buscar</button><button type="button" className={buttonClass} onClick={() => { setFilters(emptyFilters); load({}); }}>Limpar</button></div>
      </form>
      <Feedback error={error} notice={notice} />
      {data && <>
        <section aria-label="Total por versão da página" className="grid sm:grid-cols-4 gap-3 mb-6">
          <div className="border border-gray-800 bg-[#111] p-4"><p className="text-gray-400 text-xs font-sans mb-1">Total</p><p data-testid="le-total" className="text-xl text-white">{data.total}</p></div>
          {data.porVersao.map((v) => <div key={v.versao} className="border border-gray-800 bg-[#111] p-4"><p className="text-gray-400 text-xs font-sans mb-1">Versão {v.versao}</p><p data-testid={`versao-${v.versao}`} className="text-xl text-white">{v.total}</p></div>)}
        </section>
        {data.inscricoes.length === 0 ? <p className="text-gray-400 py-6">Nenhuma inscrição com esses filtros.</p> : (
          <div className="overflow-x-auto border border-gray-800">
            <table className="w-full text-left font-sans text-sm">
              <caption className="sr-only">Inscrições na lista de espera</caption>
              <thead><tr>{['Nome / e-mail', 'Perfil', 'Categorias', 'Versão', 'Origem', 'Status', 'Data', 'Ações'].map((h) => <th key={h} scope="col" className={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {data.inscricoes.map((i) => editing?.id === i.id ? (
                  <tr key={i.id} data-testid={`inscricao-${i.id}`}>
                    <td className={cell} colSpan={8}>
                      <form onSubmit={save} className="grid sm:grid-cols-5 gap-3 items-end">
                        <Field id="le-e-nome" label="Nome" required value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} />
                        <Field id="le-e-email" label="E-mail" type="email" required value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                        <Field id="le-e-perfil" label="Perfil"><select id="le-e-perfil" className={inputClass} value={editing.perfil} onChange={(e) => setEditing({ ...editing, perfil: e.target.value })}><option value="comprador">Comprador</option><option value="vendedor">Vendedor</option></select></Field>
                        <Field id="le-e-status" label="Status"><select id="le-e-status" className={inputClass} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>{Object.entries(STATUS_INSCRICAO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                        <div className="flex gap-2"><button disabled={busy} className={primaryClass}>Salvar inscrição</button><button type="button" className={buttonClass} onClick={() => setEditing(null)}>Voltar</button></div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={i.id} data-testid={`inscricao-${i.id}`}>
                    <td className={cell}>{i.nome}<span className="block text-xs text-gray-500">{i.email}</span></td>
                    <td className={cell}>{i.perfil}</td>
                    <td className={cell}>{i.categorias.join(', ') || '—'}</td>
                    <td className={cell}>{i.versao}</td>
                    <td className={cell}>{i.origem}</td>
                    <td className={cell}>{STATUS_INSCRICAO[i.status]}</td>
                    <td className={cell}>{formatDateTime(i.criadoEm)}</td>
                    <td className={cell}>
                      <div className="flex gap-2 flex-wrap">
                        <button type="button" className={buttonClass} aria-label={`Editar inscrição ${i.email}`} onClick={() => setEditing({ id: i.id, nome: i.nome, email: i.email, perfil: i.perfil, categorias: i.categorias, status: i.status })}>Editar</button>
                        <button type="button" disabled={busy} className={buttonClass} aria-label={`Excluir inscrição ${i.email}`} onClick={() => remove(i)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}
    </OperationLayout>
  );
};

export default WaitlistAdmin;
