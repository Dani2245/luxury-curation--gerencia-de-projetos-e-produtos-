import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { apiFetch, formatCurrency } from '../services/api';

// Validação dos anúncios pelo administrador antes da publicação (RFC02)
const AdminListingsPanel = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/pecas/pendentes')
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDecision = async (item, publicacao) => {
    setError('');
    try {
      await apiFetch(`/pecas/${item.id}/publicacao`, { method: 'PATCH', body: { publicacao } });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section aria-labelledby="anuncios-pendentes">
      <h2 id="anuncios-pendentes" className="text-2xl font-serif mb-6">Anúncios aguardando validação</h2>

      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 font-sans">Carregando anúncios...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-800">
          <p className="text-gray-500 font-sans">Nenhum anúncio pendente de validação.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id} className="bg-[#111] border border-gray-800 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <Link to={`/peca/${item.id}`} className="text-white font-serif text-lg hover:text-[#A69076]">{item.nome}</Link>
                <p className="text-gray-400 font-sans text-sm first-letter:uppercase">
                  {item.categoria} · {formatCurrency(item.valor)} · Vendedor: {item.vendedor.nome}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleDecision(item, 'publicada')}
                  className="flex items-center gap-2 bg-white text-black px-4 py-2 font-sans uppercase tracking-widest text-xs hover:bg-gray-200 transition-colors"
                >
                  <Check className="w-4 h-4" /> Publicar
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision(item, 'rejeitada')}
                  className="flex items-center gap-2 border border-gray-700 text-gray-300 px-4 py-2 font-sans uppercase tracking-widest text-xs hover:border-red-400 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" /> Rejeitar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default AdminListingsPanel;
