import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { apiFetch } from '../services/api';

const NOVA = 'nova';
const inputClass = 'w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans';

// RFS77/RFS79 - o comprador salva a peça consultada numa lista existente ou cria uma lista nova com ela
const SaveToWishlist = ({ pecaId }) => {
  const [listas, setListas] = useState([]);
  const [destino, setDestino] = useState(NOVA);
  const [nomeNova, setNomeNova] = useState('Peças salvas');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/listas');
      setListas(data);
      const disponivel = data.find((l) => !l.pecasIds.includes(pecaId));
      setDestino(disponivel ? String(disponivel.id) : NOVA);
    } catch (err) {
      setError(err.message);
    }
  }, [pecaId]);

  useEffect(() => {
    load();
  }, [load]);

  const salvaEm = listas.filter((l) => l.pecasIds.includes(pecaId));
  const disponiveis = listas.filter((l) => !l.pecasIds.includes(pecaId));

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      let nome;
      if (destino === NOVA) {
        await apiFetch('/listas', { method: 'POST', body: { nome: nomeNova, pecaId } });
        nome = nomeNova.trim();
      } else {
        await apiFetch(`/listas/${destino}/pecas`, { method: 'POST', body: { pecaId } });
        nome = listas.find((l) => String(l.id) === destino)?.nome;
      }
      await load();
      setNotice(`Peça salva em "${nome}".`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} aria-label="Salvar na lista de desejos" className="bg-[#111] border border-gray-800 p-6 mb-8 space-y-4">
      <h3 className="flex items-center gap-2 text-lg font-serif text-white"><Heart className="w-5 h-5 text-[#A69076]" /> Lista de desejos</h3>

      {salvaEm.length > 0 && (
        <p data-testid="salva-em" className="font-sans text-sm text-gray-300">
          Salva em:{' '}
          {salvaEm.map((l, i) => (
            <React.Fragment key={l.id}>
              {i > 0 && ', '}
              <Link to={`/dashboard/listas/${l.id}`} className="text-[#A69076] hover:text-white">{l.nome}</Link>
            </React.Fragment>
          ))}
        </p>
      )}

      {error && <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 font-sans text-sm">{error}</div>}
      {notice && <div role="status" className="bg-emerald-900/40 border border-emerald-500 text-emerald-200 px-4 py-3 font-sans text-sm">{notice}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="lista-salvar" className="block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2">Salvar em</label>
          <select id="lista-salvar" value={destino} onChange={(e) => setDestino(e.target.value)} className={`${inputClass} appearance-none`}>
            {disponiveis.map((l) => <option key={l.id} value={String(l.id)}>{l.nome}</option>)}
            <option value={NOVA}>Nova lista…</option>
          </select>
        </div>
        {destino === NOVA && (
          <div>
            <label htmlFor="lista-nova-nome" className="block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2">Nome da nova lista</label>
            <input id="lista-nova-nome" type="text" required maxLength={100} value={nomeNova} onChange={(e) => setNomeNova(e.target.value)} className={inputClass} />
          </div>
        )}
      </div>

      <button type="submit" disabled={saving} className="w-full border border-[#A69076] text-[#A69076] py-3 font-sans uppercase tracking-widest text-xs hover:bg-[#A69076] hover:text-black transition-colors disabled:opacity-50">
        {saving ? 'Salvando...' : 'Salvar na lista'}
      </button>
    </form>
  );
};

export default SaveToWishlist;
