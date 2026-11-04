import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getUser } from '../services/api';
import AppraisalDetails from './AppraisalDetails';

export default function PassportAppraisals({ pecaId }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState({});
  useEffect(() => {
    apiFetch('/laudos', { params: { pecaId, vinculados: 'true' } }).then(setItems).catch((e) => setError(e.message));
  }, [pecaId]);
  const toggle = async (item) => {
    setOpened((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
    if (!opened[item.id]) {
      try { await apiFetch(`/laudos/${item.id}/consulta`, { method: 'POST' }); }
      catch (e) { setError(e.message); }
    }
  };
  return <section aria-label="Laudos assinados" className="mb-8 border border-gray-800 p-6 space-y-4">
    <h2 className="text-2xl font-serif">Laudos assinados</h2>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {items.length === 0 && <p className="text-gray-400 text-sm">Nenhum laudo estruturado vinculado. Documentos anteriores permanecem na seção abaixo.</p>}
    {items.map((item) => <article key={item.id}><button type="button" aria-expanded={Boolean(opened[item.id])} className="border border-gray-700 px-4 py-3 mb-3" onClick={() => toggle(item)}>Abrir laudo {item.id} · {item.perito_nome}</button>{opened[item.id] && <AppraisalDetails item={item} />}</article>)}
    {getUser()?.perfil === 'Perito' && <Link to={`/dashboard/laudos?pecaId=${pecaId}`} className="inline-block text-[#A69076]">Emitir ou vincular laudo pericial</Link>}
  </section>;
}
