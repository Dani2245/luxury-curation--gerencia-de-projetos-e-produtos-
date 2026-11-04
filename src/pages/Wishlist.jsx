import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, Pencil, Trash2 } from 'lucide-react';
import WishlistForm from '../components/WishlistForm';
import { apiFetch, formatCurrency } from '../services/api';
import { formatCriterios } from '../services/wishlist';

const SITUACAO = {
  disponível: 'text-emerald-400 border-emerald-500/50',
  'em negociação': 'text-yellow-400 border-yellow-500/50',
  vendida: 'text-gray-400 border-gray-600',
  indisponível: 'text-gray-400 border-gray-600'
};

const actionClass = 'flex items-center gap-2 border border-gray-700 px-4 py-2 font-sans text-xs uppercase tracking-widest text-gray-300 hover:border-white transition-colors';

// RFC22 - consulta (RFS78), edição (RFS79) e exclusão (RFS80) de uma lista de desejos
const Wishlist = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lista, setLista] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setLista(await apiFetch(`/listas/${id}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action, message) => {
    setError('');
    setNotice('');
    try {
      await action();
      await load();
      setNotice(message);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const handleUpdate = async (values) => {
    setSaving(true);
    const ok = await run(() => apiFetch(`/listas/${id}`, { method: 'PUT', body: values }), 'Lista atualizada.');
    setSaving(false);
    if (ok) setEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('Excluir esta lista? Os alertas vinculados a ela também serão excluídos.')) return;
    try {
      await apiFetch(`/listas/${id}`, { method: 'DELETE' });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  const semCriterio = lista && !lista.categorias.length && lista.valorMin === null && lista.valorMax === null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-sans uppercase tracking-widest text-xs">
        <ArrowLeft className="w-4 h-4" /> Voltar ao painel
      </Link>

      {error && <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">{error}</div>}
      {notice && <div role="status" className="bg-emerald-900/40 border border-emerald-500 text-emerald-200 px-4 py-3 mb-6 font-sans text-sm">{notice}</div>}

      {lista && (
        <>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 border-b border-gray-800 pb-8">
            <div>
              <p className="text-gray-500 font-sans text-xs tracking-widest uppercase mb-2">Lista de desejos</p>
              <h1 className="text-4xl font-serif">{lista.nome}</h1>
              <p data-testid="criterios" className="text-gray-400 font-sans text-sm mt-2 first-letter:uppercase">{formatCriterios(lista)}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to={lista.alertaId ? '/dashboard/alertas' : `/dashboard/alertas?lista=${lista.id}`} className={actionClass}>
                <Bell className="w-4 h-4" /> {lista.alertaId ? 'Alerta configurado' : 'Configurar alerta'}
              </Link>
              <button type="button" onClick={() => setEditing((v) => !v)} className={actionClass} aria-expanded={editing}>
                <Pencil className="w-4 h-4" /> Editar critérios
              </button>
              <button type="button" onClick={handleDelete} className={`${actionClass} hover:border-red-400 hover:text-red-400`}>
                <Trash2 className="w-4 h-4" /> Excluir lista
              </button>
            </div>
          </div>

          {editing && (
            <div className="mb-10">
              <WishlistForm initial={lista} submitLabel="Salvar critérios" onSubmit={handleUpdate} onCancel={() => setEditing(false)} saving={saving} />
            </div>
          )}

          <section aria-labelledby="pecas-salvas" className="mb-10">
            <h2 id="pecas-salvas" className="text-2xl font-serif mb-4">Peças salvas</h2>
            {lista.pecasSalvas.length === 0 ? (
              <p className="text-gray-500 font-sans text-sm">Nenhuma peça salva nesta lista.</p>
            ) : (
              <ul className="space-y-3">
                {lista.pecasSalvas.map((p) => (
                  <li key={p.id} data-testid={`salva-${p.id}`} className="bg-[#111] border border-gray-800 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      {p.situacao === 'disponível' || p.situacao === 'em negociação'
                        ? <Link to={`/peca/${p.id}`} className="text-white font-serif text-lg hover:text-[#A69076]">{p.nome}</Link>
                        : <span className="text-gray-300 font-serif text-lg">{p.nome}</span>}
                      <p className="text-gray-400 font-sans text-sm first-letter:uppercase">{p.categoria} · {formatCurrency(p.valor)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`border px-3 py-1 font-sans text-xs uppercase tracking-widest ${SITUACAO[p.situacao]}`}>{p.situacao}</span>
                      <button
                        type="button"
                        aria-label={`Retirar ${p.nome}`}
                        onClick={() => run(() => apiFetch(`/listas/${lista.id}/pecas/${p.id}`, { method: 'DELETE' }), 'Peça retirada da lista.')}
                        className={actionClass}
                      >
                        Retirar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="pecas-compativeis">
            <h2 id="pecas-compativeis" className="text-2xl font-serif mb-2">Peças da curadoria compatíveis</h2>
            <p className="text-gray-500 font-sans text-sm mb-4">Peças publicadas que combinam com os critérios da lista. As novas foram publicadas depois que a lista foi criada.</p>
            {lista.pecasCompativeis.length === 0 ? (
              <p className="text-gray-500 font-sans text-sm">
                {semCriterio ? 'Defina categorias ou faixa de valor para ver peças compatíveis.' : 'Nenhuma peça compatível no momento.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {lista.pecasCompativeis.map((p) => (
                  <li key={p.id} data-testid={`compativel-${p.id}`} className="bg-[#111] border border-gray-800 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <Link to={`/peca/${p.id}`} className="text-white font-serif text-lg hover:text-[#A69076]">{p.nome}</Link>
                        {p.nova && <span data-testid="nova" className="bg-[#A69076] text-black px-2 py-0.5 font-sans text-[10px] uppercase tracking-widest font-bold">Nova</span>}
                      </div>
                      <p className="text-gray-400 font-sans text-sm first-letter:uppercase">{p.categoria} · {formatCurrency(p.valor)}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Salvar ${p.nome} na lista`}
                      onClick={() => run(() => apiFetch(`/listas/${lista.id}/pecas`, { method: 'POST', body: { pecaId: p.id } }), 'Peça salva na lista.')}
                      className={actionClass}
                    >
                      Salvar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default Wishlist;
