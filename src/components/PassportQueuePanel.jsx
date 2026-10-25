import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2 } from 'lucide-react';
import { apiFetch } from '../services/api';

// Peças aguardando a emissão do passaporte digital pelo perito (RFS05)
const PassportQueuePanel = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/passaportes/pendentes')
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section aria-labelledby="sem-passaporte">
      <h2 id="sem-passaporte" className="text-2xl font-serif mb-6">Peças aguardando passaporte</h2>

      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-gray-400 font-sans">Carregando peças...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-800">
          <p className="text-gray-500 font-sans">Todas as peças já possuem passaporte digital.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id} className="bg-[#111] border border-gray-800 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <Link to={`/peca/${item.id}`} className="text-white font-serif text-lg hover:text-[#A69076]">{item.nome}</Link>
                <p className="text-gray-400 font-sans text-sm">{item.categoria} · Vendedor: {item.vendedor.nome}</p>
              </div>
              <Link
                to={`/dashboard/passaportes/${item.id}/emitir`}
                aria-label={`Emitir passaporte de ${item.nome}`}
                className="flex items-center gap-2 bg-white text-black px-4 py-2 font-sans uppercase tracking-widest text-xs hover:bg-gray-200 transition-colors"
              >
                <FilePlus2 className="w-4 h-4" /> Emitir passaporte
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default PassportQueuePanel;
