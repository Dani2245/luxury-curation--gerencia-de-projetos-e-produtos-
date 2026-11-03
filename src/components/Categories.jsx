import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, getUser } from '../services/api';
import OperationLayout, { Field, Feedback } from './OperationLayout';
import { buttonClass, inputClass, primaryClass } from '../services/operations';

export default function Categories() {
  const admin = getUser()?.perfil === 'Administrador';
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [nome, setNome] = useState('');
  const [atributos, setAtributos] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setItems(await apiFetch('/categorias')); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const reset = () => { setEditing(null); setNome(''); setAtributos(''); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await apiFetch(editing ? `/categorias/${editing.id}` : '/categorias', {
        method: editing ? 'PUT' : 'POST', body: { nome, atributos: atributos.split('\n').map((a) => a.trim()).filter(Boolean) }
      });
      reset(); await load(); setNotice('Categoria salva. Disponível nos cadastros e filtros de peças.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const remove = async (item) => {
    if (!window.confirm(`Remover a categoria ${item.nome}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await apiFetch(`/categorias/${item.id}`, { method: 'DELETE' }); await load(); setNotice('Categoria removida.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <OperationLayout title="Categorias de peças" description="Consulte as categorias e seus atributos de classificação. Categorias usadas em peças ou listas de desejos são preservadas.">
    <Feedback error={error} notice={notice} />
    {admin && <form onSubmit={save} className="border border-gray-800 p-6 mb-6 space-y-4">
      <h2 className="text-xl font-serif">{editing ? 'Editar categoria' : 'Nova categoria'}</h2>
      <Field id="categoria-nome" label="Nome da categoria" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
      <Field id="categoria-atributos" label="Atributos de classificação (um por linha)"><textarea id="categoria-atributos" className={inputClass} rows={4} value={atributos} onChange={(e) => setAtributos(e.target.value)} /></Field>
      <p className="text-gray-400 text-sm">Até 20 atributos. Exemplo: marca, modelo, material. O vendedor preenche os valores no cadastro da peça.</p>
      <div className="flex gap-3"><button disabled={busy} className={primaryClass}>Salvar categoria</button>{editing && <button type="button" className={buttonClass} onClick={reset}>Cancelar edição</button>}</div>
    </form>}
    <Field id="categoria-busca" label="Consultar por nome ou atributo" value={search} onChange={(e) => setSearch(e.target.value)} />
    <ul className="space-y-3 mt-5">{items.filter((c) => `${c.nome} ${c.atributos.join(' ')}`.toLowerCase().includes(search.toLowerCase())).map((c) => <li key={c.id} data-testid={`categoria-${c.id}`} className="border border-gray-800 p-5 flex justify-between gap-4 flex-wrap">
      <div><h2 className="font-serif text-xl">{c.nome}</h2><p className="text-gray-400 text-sm">{c.atributos.join(' · ') || 'Sem atributos específicos'}</p></div>
      {admin && <div className="flex gap-2"><button className={buttonClass} aria-label={`Editar categoria ${c.nome}`} onClick={() => { setEditing(c); setNome(c.nome); setAtributos(c.atributos.join('\n')); setNotice(''); window.scrollTo(0, 0); }}>Editar</button><button disabled={busy} className={buttonClass} aria-label={`Remover categoria ${c.nome}`} onClick={() => remove(c)}>Remover</button></div>}
    </li>)}</ul>
  </OperationLayout>;
}
