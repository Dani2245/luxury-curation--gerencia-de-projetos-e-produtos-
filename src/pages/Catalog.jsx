import React, { useCallback, useRef, useState } from 'react';
import ItemCard from '../components/ItemCard';
import { apiFetch, getUser } from '../services/api';

const inputClass = 'w-full bg-[#111] border border-gray-800 rounded-none py-2 px-3 text-gray-300 focus:outline-none focus:border-gray-500 font-sans transition-colors';
const labelClass = 'block text-gray-500 font-sans text-xs tracking-widest uppercase mb-2';

// Consultar Peça (RFS02): filtros por categoria, faixa de valor e vendedor
const Catalog = () => {
  const isAdmin = getUser()?.perfil === 'Administrador';
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ categoria: '', valorMin: '', valorMax: '', vendedor: '', publicacao: '' });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const lastRequest = useRef(0);

  // Ignora respostas de buscas antigas que chegam depois da mais recente
  const fetchItems = useCallback(async (params) => {
    const requestId = ++lastRequest.current;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/pecas', { params });
      if (requestId === lastRequest.current) setItems(data);
    } catch (err) {
      if (requestId !== lastRequest.current) return;
      setItems([]);
      setError(err.message);
    } finally {
      if (requestId === lastRequest.current) setLoading(false);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    // RFS02: é necessário preencher um dos filtros (categoria, faixa de valor ou vendedor)
    if (!filters.categoria && !filters.valorMin && !filters.valorMax && !filters.vendedor.trim()) {
      setItems([]);
      setSearched(false);
      setError('Preencha ao menos um filtro: categoria, faixa de valor ou vendedor');
      return;
    }
    setSearched(true);
    fetchItems(filters);
  };

  const handleClear = () => {
    lastRequest.current += 1;
    setFilters({ categoria: '', valorMin: '', valorMax: '', vendedor: '', publicacao: '' });
    setItems([]);
    setSearched(false);
    setLoading(false);
    setError('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24">
      <div className="mb-8">
        <h1 className="text-4xl md:text-5xl font-serif mb-4">Catálogo de Peças</h1>
        <p className="text-gray-400 font-sans max-w-2xl">
          Explore nossa seleção exclusiva de obras de arte, joias e relógios de alto padrão.
          Todas as peças possuem garantia de autenticidade Lastro.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-12 border-b border-gray-800 pb-8 items-end">
        <div className="col-span-2 md:col-span-1">
          <label htmlFor="f-categoria" className={labelClass}>Categoria</label>
          <select id="f-categoria" value={filters.categoria} onChange={(e) => setFilters({ ...filters, categoria: e.target.value })} className={`${inputClass} appearance-none`}>
            <option value="">Todas</option>
            <option value="obra de arte">Obra de Arte</option>
            <option value="joia">Joia</option>
            <option value="relógio">Relógio</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-min" className={labelClass}>Valor mínimo</label>
          <input id="f-min" type="number" min="0" step="0.01" value={filters.valorMin} onChange={(e) => setFilters({ ...filters, valorMin: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="f-max" className={labelClass}>Valor máximo</label>
          <input id="f-max" type="number" min="0" step="0.01" value={filters.valorMax} onChange={(e) => setFilters({ ...filters, valorMax: e.target.value })} className={inputClass} />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label htmlFor="f-vendedor" className={labelClass}>Vendedor</label>
          <input id="f-vendedor" type="text" value={filters.vendedor} onChange={(e) => setFilters({ ...filters, vendedor: e.target.value })} className={inputClass} placeholder="Nome do vendedor" />
        </div>
        {isAdmin && (
          <div className="col-span-2 md:col-span-1">
            <label htmlFor="f-publicacao" className={labelClass}>Anúncio</label>
            <select id="f-publicacao" value={filters.publicacao} onChange={(e) => setFilters({ ...filters, publicacao: e.target.value })} className={`${inputClass} appearance-none`}>
              <option value="">Todos</option>
              <option value="pendente">Em validação</option>
              <option value="publicada">Publicada</option>
              <option value="rejeitada">Rejeitada</option>
            </select>
          </div>
        )}
        <div className="col-span-2 md:col-span-1 flex gap-2">
          <button type="submit" className="flex-1 bg-white text-black py-2 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors">
            Buscar
          </button>
          <button type="button" onClick={handleClear} className="px-3 border border-gray-700 text-gray-400 font-sans text-xs uppercase tracking-widest hover:border-white hover:text-white transition-colors">
            Limpar
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
        </div>
      ) : !searched && !error ? (
        <p className="text-center text-gray-500 font-sans py-16">Informe ao menos um filtro (categoria, faixa de valor ou vendedor) para consultar as peças.</p>
      ) : items.length === 0 && !error ? (
        <p className="text-center text-gray-500 font-sans py-16">Nenhuma peça encontrada para os filtros informados.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Catalog;
