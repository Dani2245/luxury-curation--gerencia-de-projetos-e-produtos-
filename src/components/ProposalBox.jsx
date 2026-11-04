import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, formatCurrency, getUser } from '../services/api';

const inputClass = 'w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans';
const labelClass = 'block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2';

// RFS13 - proposta de compra pelo comprador (ou pelo administrador, em nome de um comprador)
const ProposalBox = ({ item, onRegistered }) => {
  const user = getUser();
  const isAdmin = user?.perfil === 'Administrador';
  const [valor, setValor] = useState(String(item.valor));
  const [compradorId, setCompradorId] = useState('');
  const [compradores, setCompradores] = useState([]);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch('/usuarios', { params: { perfil: 'Comprador' } })
      .then((data) => {
        setCompradores(data);
        if (data[0]) setCompradorId(data[0].id);
      })
      .catch((err) => setError(err.message));
  }, [isAdmin]);

  if (item.vendida) {
    return <p className="text-gray-400 font-sans text-sm border border-gray-800 px-4 py-3">Esta peça já foi vendida.</p>;
  }

  if (item.emNegociacao && !registered) {
    return <p className="text-yellow-400 font-sans text-sm border border-yellow-500/40 px-4 py-3">Esta peça possui uma proposta em andamento.</p>;
  }

  if (registered) {
    return (
      <div role="status" className="bg-emerald-900/40 border border-emerald-500 text-emerald-200 px-4 py-3 font-sans text-sm">
        Proposta registrada. <Link to="/dashboard/transacoes" className="underline">Acompanhar transações</Link>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/transacoes', {
        method: 'POST',
        body: { pecaId: item.id, valor: Number(valor), ...(isAdmin ? { compradorId } : {}) }
      });
      setRegistered(true);
      onRegistered?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-gray-800 bg-[#111] p-5 space-y-4" aria-label="Enviar proposta">
      <h3 className="text-white font-serif text-lg">Enviar Proposta</h3>
      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 font-sans text-sm">{error}</div>
      )}
      {isAdmin && (
        <div>
          <label htmlFor="proposta-comprador" className={labelClass}>Comprador</label>
          <select id="proposta-comprador" value={compradorId} onChange={(e) => setCompradorId(e.target.value)} className={`${inputClass} appearance-none`} required>
            {compradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="proposta-valor" className={labelClass}>Valor da proposta (R$)</label>
        <input id="proposta-valor" type="number" min="0.01" step="0.01" required value={valor} onChange={(e) => setValor(e.target.value)} className={inputClass} />
        <p className="text-gray-500 font-sans text-xs mt-1">Valor pretendido pelo vendedor: {formatCurrency(item.valor)}</p>
      </div>
      <button type="submit" disabled={loading} className="w-full bg-white text-black py-3 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">
        {loading ? 'Enviando...' : 'Enviar Proposta'}
      </button>
    </form>
  );
};

export default ProposalBox;
