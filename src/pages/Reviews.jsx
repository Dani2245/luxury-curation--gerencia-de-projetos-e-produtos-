import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, formatDateTime, getUser } from '../services/api';
import OperationLayout, { Feedback } from '../components/OperationLayout';
import { buttonClass, inputClass, primaryClass } from '../services/operations';

const estrelas = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

// fora do componente da página: definido dentro, o React recriaria o campo de comentário a cada tecla
const Item = ({ a, children }) => (
  <li data-testid={`avaliacao-${a.id}`} className="border border-gray-800 p-4">
    <p className="text-white"><span className="text-[#D3BE96]" aria-label={`Nota ${a.nota} de 5`}>{estrelas(a.nota)}</span> · {a.avaliador.nome} avaliou {a.avaliado.nome} · {a.pecaNome}</p>
    {a.comentario && <p className="text-gray-300">{a.comentario}</p>}
    <p className="text-gray-500 text-xs">{formatDateTime(a.criadoEm)}{a.removidaEm && ` · removida: ${a.motivoRemocao}`}</p>
    {children}
  </li>
);

// RFC24 - avaliações após a transação concluída e reputação na plataforma (RFS85 a RFS88)
const Reviews = () => {
  const user = getUser();
  const admin = user.perfil === 'Administrador';
  const [data, setData] = useState(null);
  const [notas, setNotas] = useState({});
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await apiFetch('/avaliacoes')); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(); setNotice(message); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  };
  const avaliar = (p) => (e) => {
    e.preventDefault();
    const n = notas[p.transacaoId] || {};
    run(() => apiFetch('/avaliacoes', { method: 'POST', body: { transacaoId: p.transacaoId, nota: n.nota || 5, comentario: n.comentario || '' } }), 'Avaliação registrada.');
  };
  const salvarComentario = async (e) => {
    e.preventDefault();
    if (await run(() => apiFetch(`/avaliacoes/${editing.id}`, { method: 'PUT', body: { comentario: editing.comentario } }), 'Comentário alterado.')) setEditing(null);
  };
  const remover = (a) => {
    const motivo = window.prompt('Motivo da remoção:');
    if (!motivo) return;
    run(() => apiFetch(`/avaliacoes/${a.id}`, { method: 'DELETE', body: { motivo } }), 'Avaliação removida. O motivo ficou registrado.');
  };
  const setNota = (id, k, v) => setNotas({ ...notas, [id]: { ...notas[id], [k]: v } });


  return (
    <OperationLayout title="Avaliações e reputação" description="Depois de cada transação concluída, comprador e vendedor avaliam um ao outro. As avaliações formam a reputação de cada um na Lastro.">
      <Feedback error={error} notice={notice} />
      {data && admin && (
        <ul className="space-y-3 font-sans text-sm">
          {data.todas.length === 0 && <p className="text-gray-400">Nenhuma avaliação registrada.</p>}
          {data.todas.map((a) => (
            <Item key={a.id} a={a}>
              {!a.removidaEm && <button type="button" disabled={busy} className={`${buttonClass} mt-2`} aria-label={`Remover avaliação ${a.id}`} onClick={() => remover(a)}>Remover</button>}
            </Item>
          ))}
        </ul>
      )}
      {data && !admin && <>
        <section aria-label="Minha reputação" className="border border-gray-800 bg-[#111] p-5 mb-8 font-sans">
          <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Minha reputação</p>
          <p data-testid="reputacao" className="text-2xl text-white">{data.reputacao.total ? `${data.reputacao.media} de 5 · ${data.reputacao.total} avaliação(ões)` : 'Sem avaliações ainda'}</p>
        </section>
        <h2 className="font-serif text-2xl mb-3">Para avaliar</h2>
        {data.pendentes.length === 0 ? <p className="text-gray-400 mb-8">Nenhuma transação concluída aguardando sua avaliação.</p> : (
          <ul className="space-y-3 mb-8 font-sans text-sm">
            {data.pendentes.map((p) => (
              <li key={p.transacaoId} data-testid={`pendente-${p.transacaoId}`} className="border border-gray-800 p-4">
                <form onSubmit={avaliar(p)} className="grid sm:grid-cols-4 gap-3 items-end">
                  <p className="text-white">{p.pecaNome}<span className="block text-gray-400">Avaliar {p.contraparte}</span></p>
                  <div><label htmlFor={`nota-${p.transacaoId}`} className="block text-gray-400 text-xs uppercase tracking-widest mb-2">Nota</label>
                    <select id={`nota-${p.transacaoId}`} className={inputClass} value={notas[p.transacaoId]?.nota || 5} onChange={(e) => setNota(p.transacaoId, 'nota', Number(e.target.value))}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
                  <div><label htmlFor={`comentario-${p.transacaoId}`} className="block text-gray-400 text-xs uppercase tracking-widest mb-2">Comentário</label>
                    <input id={`comentario-${p.transacaoId}`} maxLength={1000} className={inputClass} value={notas[p.transacaoId]?.comentario || ''} onChange={(e) => setNota(p.transacaoId, 'comentario', e.target.value)} /></div>
                  <button disabled={busy} className={primaryClass} aria-label={`Avaliar transação ${p.transacaoId}`}>Avaliar</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <h2 className="font-serif text-2xl mb-3">Recebidas</h2>
        <ul className="space-y-3 mb-8 font-sans text-sm">
          {data.recebidas.length === 0 && <p className="text-gray-400">Nenhuma avaliação recebida.</p>}
          {data.recebidas.map((a) => <Item key={a.id} a={a} />)}
        </ul>
        <h2 className="font-serif text-2xl mb-3">Feitas por mim</h2>
        <ul className="space-y-3 font-sans text-sm">
          {data.feitas.map((a) => (
            <Item key={a.id} a={a}>
              {editing?.id === a.id ? (
                <form onSubmit={salvarComentario} className="flex gap-2 mt-2">
                  <input id={`editar-comentario-${a.id}`} maxLength={1000} className={inputClass} value={editing.comentario} onChange={(e) => setEditing({ ...editing, comentario: e.target.value })} />
                  <button disabled={busy} className={primaryClass}>Salvar comentário</button>
                </form>
              ) : a.editavel && !a.removidaEm && (
                <button type="button" className={`${buttonClass} mt-2`} aria-label={`Alterar comentário ${a.id}`} onClick={() => setEditing({ id: a.id, comentario: a.comentario || '' })}>Alterar comentário</button>
              )}
            </Item>
          ))}
        </ul>
      </>}
    </OperationLayout>
  );
};

export default Reviews;
