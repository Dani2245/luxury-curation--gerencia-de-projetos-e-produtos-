import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Heart } from 'lucide-react';
import WishlistForm from './WishlistForm';
import { apiFetch } from '../services/api';
import { formatCriterios } from '../services/wishlist';

const plural = (n, singular, pluralForm) => `${n} ${n === 1 ? singular : pluralForm}`;

// RFC22 - listas de desejos do comprador: criação (RFS77) e resumo de cada lista (RFS78)
const WishlistsPanel = () => {
  const [listas, setListas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setListas(await apiFetch('/listas'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (values) => {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await apiFetch('/listas', { method: 'POST', body: values });
      await load();
      setFormKey((k) => k + 1);
      setNotice('Lista criada. Peças novas da curadoria que combinarem com ela aparecerão aqui.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="listas-desejos" className="mt-12">
      <h2 id="listas-desejos" className="text-2xl font-serif mb-2">Listas de desejos</h2>
      <p className="text-gray-500 font-sans text-sm mb-6">
        Monte listas por categoria e faixa de valor e salve as peças que consultar. A lista mostra as peças novas da curadoria que combinam com ela.
      </p>

      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">{error}</div>
      )}
      {notice && (
        <div role="status" className="bg-emerald-900/40 border border-emerald-500 text-emerald-200 px-4 py-3 mb-6 font-sans text-sm">{notice}</div>
      )}

      {loading ? (
        <p className="text-gray-400 font-sans mb-8">Carregando listas...</p>
      ) : listas.length === 0 ? (
        <p className="text-gray-500 font-sans text-sm mb-8">Você ainda não tem listas de desejos.</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {listas.map((lista) => (
            <li key={lista.id} data-testid={`lista-${lista.id}`} className="bg-[#111] border border-gray-800 p-5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/dashboard/listas/${lista.id}`} className="flex items-center gap-2 text-white font-serif text-lg hover:text-[#A69076]">
                  <Heart className="w-4 h-4 text-[#A69076]" /> {lista.nome}
                </Link>
                {lista.alertaId && (
                  <span className="flex items-center gap-1 text-xs font-sans text-emerald-400"><Bell className="w-3 h-3" /> Alerta</span>
                )}
              </div>
              <p className="text-gray-400 font-sans text-sm first-letter:uppercase">{formatCriterios(lista)}</p>
              <p className="text-gray-500 font-sans text-xs">
                {plural(lista.pecasIds.length, 'peça salva', 'peças salvas')} · {plural(lista.compativeis, 'compatível', 'compatíveis')}
                {lista.novas > 0 && <span className="text-[#A69076]"> · {plural(lista.novas, 'nova', 'novas')}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h3 className="text-gray-400 uppercase tracking-widest text-xs font-sans mb-3">Nova lista</h3>
      <WishlistForm key={formKey} submitLabel="Criar lista" onSubmit={handleCreate} saving={saving} />
    </section>
  );
};

export default WishlistsPanel;
