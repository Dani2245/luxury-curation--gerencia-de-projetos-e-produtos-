import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, formatCurrency, formatDateTime } from '../services/api';
import OperationLayout, { Field, Feedback } from '../components/OperationLayout';
import { buttonClass, displayDate, inputClass, primaryClass } from '../services/operations';

const CATEGORIAS = ['obra de arte', 'joia', 'relógio', 'bolsa'];
const ESTADOS = ['excelente', 'muito bom', 'bom', 'regular', 'precisa de restauro'];
const DOCUMENTOS = ['nota fiscal', 'laudo', 'certificado'];
const emptyForm = { nome: '', categoria: 'joia', estadoConservacao: 'bom', fotografias: '', documentos: [], ultimaManutencao: '', valorReferencia: '', visibilidade: 'privado' };
const slug = (t) => t.replace(/\s+/g, '-');

// Planilha do proprietário (CSV com ; ou ,): nome, categoria, estado, valor de referência, última manutenção (AAAA-MM-DD)
const parsePlanilha = (texto) => texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  .map((l) => l.split(/[;,]/).map((c) => c.trim()))
  .filter((c) => c[0] && c[0].toLowerCase() !== 'nome')
  .map(([nome, categoria, estado, valor, manutencao]) => ({
    nome, categoria: (categoria || '').toLowerCase(), estadoConservacao: (estado || 'bom').toLowerCase(),
    valorReferencia: valor || undefined, ultimaManutencao: manutencao || undefined
  }));

// RFC23 - coleção privada do proprietário (RFS81 a RFS84) e exportação dos dados (RNF05)
const Collection = () => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await apiFetch('/colecao')); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(); setNotice(message); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  };
  const body = () => ({ ...form, fotografias: form.fotografias.split('\n').map((f) => f.trim()).filter(Boolean) });
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(() => apiFetch(editingId ? `/colecao/${editingId}` : '/colecao', { method: editingId ? 'PUT' : 'POST', body: body() }),
      editingId ? 'Peça atualizada. A alteração foi para o histórico.' : 'Peça registrada na sua coleção privada.');
    if (ok) { setForm(emptyForm); setEditingId(null); }
  };
  const edit = (i) => {
    setEditingId(i.id);
    setForm({ nome: i.nome, categoria: i.categoria, estadoConservacao: i.estadoConservacao, fotografias: i.fotografias.join('\n'), documentos: i.documentos,
      ultimaManutencao: i.ultimaManutencao || '', valorReferencia: i.valorReferencia ?? '', visibilidade: i.visibilidade });
    window.scrollTo(0, 0);
  };
  const toggleDoc = (d) => setForm({ ...form, documentos: form.documentos.includes(d) ? form.documentos.filter((x) => x !== d) : [...form.documentos, d] });
  const importar = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const itens = parsePlanilha(await file.text());
    run(() => apiFetch('/colecao/importar', { method: 'POST', body: { itens } }), `${itens.length} peça(s) importada(s) como rascunho. Complete os dados de cada uma.`);
  };
  const exportar = async () => {
    try {
      const dados = await apiFetch('/colecao/exportar');
      const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'lastro-meus-dados.json'; a.click();
      URL.revokeObjectURL(url);
      setNotice(`Exportação gerada: ${dados.colecao.length} peça(s) da coleção e ${dados.passaportes.length} passaporte(s).`);
    } catch (err) { setError(err.message); }
  };
  const showHistory = async (i) => {
    try { setHistory({ nome: i.nome, eventos: await apiFetch(`/colecao/${i.id}/historico`) }); }
    catch (e) { setError(e.message); }
  };
  const remove = (i) => {
    if (!window.confirm(`Excluir "${i.nome}" da sua coleção?`)) return;
    run(() => apiFetch(`/colecao/${i.id}`, { method: 'DELETE' }), 'Peça excluída da coleção.');
  };
  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <OperationLayout title="Minha coleção" description="Registre as peças que você já possui, sem anunciá-las. Só você vê a coleção e o valor de referência. Cada peça pode virar passaporte quando você quiser.">
      <div className="flex flex-wrap gap-3 mb-6">
        <label htmlFor="col-planilha" className={`${buttonClass} cursor-pointer`}>Importar planilha (CSV)</label>
        <input id="col-planilha" type="file" accept=".csv,text/csv" className="sr-only" onChange={importar} />
        <button type="button" className={buttonClass} onClick={exportar}>Exportar meus dados</button>
      </div>
      <form onSubmit={submit} aria-label={editingId ? 'Editar peça' : 'Nova peça'} className="border border-gray-800 p-5 mb-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div className="sm:col-span-2"><Field id="col-nome" label="Nome da peça" required maxLength={256} value={form.nome} onChange={setF('nome')} /></div>
        <Field id="col-categoria" label="Categoria"><select id="col-categoria" className={inputClass} value={form.categoria} onChange={setF('categoria')}>{CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field id="col-estado" label="Estado de conservação"><select id="col-estado" className={inputClass} value={form.estadoConservacao} onChange={setF('estadoConservacao')}>{ESTADOS.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field id="col-manutencao" label="Última manutenção" type="date" value={form.ultimaManutencao} onChange={setF('ultimaManutencao')} />
        <Field id="col-valor" label="Valor de referência (só você vê)" type="number" min="0.01" step="0.01" value={form.valorReferencia} onChange={setF('valorReferencia')} />
        <Field id="col-visibilidade" label="Visibilidade"><select id="col-visibilidade" className={inputClass} value={form.visibilidade} onChange={setF('visibilidade')}><option value="privado">Privado</option><option value="público">Público</option></select></Field>
        <fieldset><legend className="block text-gray-400 font-sans text-xs uppercase tracking-widest mb-2">Documentos</legend>
          <div className="flex flex-wrap gap-3 text-sm text-gray-300">{DOCUMENTOS.map((d) => <label key={d} htmlFor={`col-doc-${slug(d)}`} className="flex items-center gap-1"><input id={`col-doc-${slug(d)}`} type="checkbox" checked={form.documentos.includes(d)} onChange={() => toggleDoc(d)} />{d}</label>)}</div>
        </fieldset>
        <div className="sm:col-span-2 lg:col-span-3"><Field id="col-fotos" label="Fotografias (um endereço por linha)"><textarea id="col-fotos" rows={2} className={inputClass} value={form.fotografias} onChange={setF('fotografias')} /></Field></div>
        <div className="flex gap-2"><button disabled={busy} className={primaryClass}>{editingId ? 'Salvar peça' : 'Registrar peça'}</button>{editingId && <button type="button" className={buttonClass} onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancelar edição</button>}</div>
      </form>
      <Feedback error={error} notice={notice} />
      {items.length === 0 ? <p className="text-gray-400 py-6">Sua coleção ainda está vazia.</p> : (
        <ul className="space-y-3 font-sans text-sm">
          {items.map((i) => (
            <li key={i.id} data-testid={`colecao-${i.id}`} className="border border-gray-800 p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="text-white">{i.nome} · {i.categoria} {i.status !== 'registrado' && <span className="text-[#D3BE96]">({i.status})</span>}</p>
                  <p className="text-gray-400">Estado: {i.estadoConservacao} · Manutenção: {displayDate(i.ultimaManutencao)} · {i.visibilidade}{i.valorReferencia !== null && ` · ${formatCurrency(i.valorReferencia)}`}</p>
                  <p className="text-gray-500 text-xs">Atualizada em {formatDateTime(i.atualizadoEm)}</p>
                  {/* mesmo critério do lembrete de conservação (RFC21) */}
                  {Date.now() - new Date(i.atualizadoEm).getTime() > 90 * 24 * 60 * 60 * 1000 && (
                    <p data-testid={`colecao-${i.id}-conservacao`} className="text-orange-300 text-xs">Estado de conservação sem atualização há mais de 90 dias</p>
                  )}
                  <p data-testid={`colecao-${i.id}-pendencias`} className={i.pendencias.length ? 'text-orange-300 text-xs' : 'text-emerald-400 text-xs'}>
                    {i.pendencias.length ? `Para o passaporte falta: ${i.pendencias.join(', ')}` : 'Pronta para o passaporte'}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className={buttonClass} aria-label={`Editar ${i.nome}`} onClick={() => edit(i)}>Editar</button>
                  <button type="button" className={buttonClass} aria-label={`Histórico de ${i.nome}`} onClick={() => showHistory(i)}>Histórico</button>
                  {i.status !== 'passaporte solicitado' && <>
                    <button type="button" disabled={busy} className={buttonClass} aria-label={`Solicitar passaporte de ${i.nome}`} onClick={() => run(() => apiFetch(`/colecao/${i.id}/passaporte`, { method: 'POST' }), 'Passaporte solicitado à curadoria.')}>Solicitar passaporte</button>
                    <button type="button" disabled={busy} className={buttonClass} aria-label={`Excluir ${i.nome}`} onClick={() => remove(i)}>Excluir</button>
                  </>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {history && (
        <section aria-label="Histórico da peça" className="border border-gray-800 p-5 mt-6 font-sans text-sm">
          <h2 className="font-serif text-xl mb-3">Histórico: {history.nome}</h2>
          <ol className="space-y-1">{history.eventos.map((h) => <li key={h.id}>{formatDateTime(h.criado_em)} · {h.descricao}</li>)}</ol>
        </section>
      )}
    </OperationLayout>
  );
};

export default Collection;
