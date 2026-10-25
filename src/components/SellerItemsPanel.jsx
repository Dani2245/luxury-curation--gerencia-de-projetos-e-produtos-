import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { apiFetch, formatCurrency } from '../services/api';

const PUBLICACAO_LABEL = {
  pendente: { text: 'Em validação', className: 'text-yellow-400' },
  publicada: { text: 'Publicada', className: 'text-emerald-400' },
  rejeitada: { text: 'Rejeitada', className: 'text-red-400' }
};

// Gestão das próprias peças do vendedor (RFS01, RFS03, RFS04)
const SellerItemsPanel = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/pecas/minhas')
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (item) => {
    if (!window.confirm(`Remover a peça "${item.nome}"? Esta ação não pode ser desfeita.`)) return;
    setError('');
    try {
      await apiFetch(`/pecas/${item.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const count = (publicacao) => items.filter((i) => i.publicacao === publicacao).length;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="bg-[#111] border border-gray-800 p-6">
          <h3 className="text-gray-400 uppercase tracking-widest text-xs font-sans mb-4">Peças Publicadas</h3>
          <p className="text-4xl font-serif text-white">{count('publicada')}</p>
        </div>
        <div className="bg-[#111] border border-gray-800 p-6">
          <h3 className="text-gray-400 uppercase tracking-widest text-xs font-sans mb-4">Em Validação</h3>
          <p className="text-4xl font-serif text-white">{count('pendente')}</p>
        </div>
        <div className="bg-[#111] border border-gray-800 p-6">
          <h3 className="text-gray-400 uppercase tracking-widest text-xs font-sans mb-4">Rejeitadas</h3>
          <p className="text-4xl font-serif text-white">{count('rejeitada')}</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 font-sans">Carregando peças...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gray-800">
          <p className="text-gray-500 font-sans">Nenhuma peça cadastrada ainda.</p>
          <Link to="/dashboard/nova-peca" className="inline-block mt-4 text-[#A69076] hover:text-white transition-colors font-sans text-sm uppercase tracking-widest">
            Comece agora
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-800">
          <table className="w-full text-left font-sans text-sm">
            <caption className="sr-only">Suas peças cadastradas</caption>
            <thead className="bg-[#111] text-gray-400 uppercase tracking-widest text-xs">
              <tr>
                <th scope="col" className="px-4 py-3">Peça</th>
                <th scope="col" className="px-4 py-3">Categoria</th>
                <th scope="col" className="px-4 py-3">Valor</th>
                <th scope="col" className="px-4 py-3">Anúncio</th>
                <th scope="col" className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const label = PUBLICACAO_LABEL[item.publicacao];
                return (
                  <tr key={item.id} className="border-t border-gray-800">
                    <td className="px-4 py-3 text-white">
                      <Link to={`/peca/${item.id}`} className="hover:text-[#A69076]">{item.nome}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-400 first-letter:uppercase">{item.categoria}</td>
                    <td className="px-4 py-3 text-gray-300">{formatCurrency(item.valor)}</td>
                    <td className={`px-4 py-3 ${label.className}`}>
                      {label.text}
                      {item.emNegociacao && <span className="block text-xs text-gray-500">Em negociação</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3">
                        <Link
                          to={`/dashboard/peca/${item.id}/editar`}
                          aria-label={`Editar ${item.nome}`}
                          title={item.emNegociacao ? 'Peça em negociação' : 'Editar'}
                          className={`text-gray-400 hover:text-white ${item.emNegociacao ? 'pointer-events-none opacity-40' : ''}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={item.emNegociacao}
                          aria-label={`Remover ${item.nome}`}
                          title={item.emNegociacao ? 'Peça em negociação' : 'Remover'}
                          className="text-gray-400 hover:text-red-400 disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default SellerItemsPanel;
