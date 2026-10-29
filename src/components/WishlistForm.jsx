import React, { useState } from 'react';
import { CATEGORIAS, slug } from '../services/wishlist';

const inputClass = 'w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans';
const labelClass = 'block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2';

const toField = (valor) => (valor === null || valor === undefined ? '' : String(valor));
const toValue = (campo) => (campo === '' ? null : Number(campo));

// Nome, categorias e faixa de valor da lista de desejos (RFS77 e RFS79)
const WishlistForm = ({ initial = {}, submitLabel, onSubmit, onCancel, saving }) => {
  const [nome, setNome] = useState(initial.nome || '');
  const [categorias, setCategorias] = useState(initial.categorias || []);
  const [valorMin, setValorMin] = useState(toField(initial.valorMin));
  const [valorMax, setValorMax] = useState(toField(initial.valorMax));

  const toggleCategoria = (categoria) =>
    setCategorias((prev) => (prev.includes(categoria) ? prev.filter((c) => c !== categoria) : [...prev, categoria]));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ nome, categorias, valorMin: toValue(valorMin), valorMax: toValue(valorMax) });
  };

  return (
    <form onSubmit={handleSubmit} aria-label={submitLabel} className="bg-[#111] border border-gray-800 p-6 space-y-6">
      <div>
        <label htmlFor="lista-nome" className={labelClass}>Nome da lista *</label>
        <input id="lista-nome" type="text" required maxLength={100} value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} placeholder="Ex.: Relógios vintage" />
      </div>

      <fieldset>
        <legend className={labelClass}>Categorias (nenhuma marcada = todas)</legend>
        <div className="flex flex-wrap gap-6">
          {CATEGORIAS.map((categoria) => (
            <label key={categoria} htmlFor={`lista-cat-${slug(categoria)}`} className="flex items-center gap-2 font-sans text-sm text-gray-300 cursor-pointer first-letter:uppercase">
              <input
                id={`lista-cat-${slug(categoria)}`}
                type="checkbox"
                checked={categorias.includes(categoria)}
                onChange={() => toggleCategoria(categoria)}
                className="accent-[#A69076] w-4 h-4"
              />
              {categoria}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="lista-min" className={labelClass}>Valor mínimo (R$)</label>
          <input id="lista-min" type="number" min="0" step="0.01" value={valorMin} onChange={(e) => setValorMin(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="lista-max" className={labelClass}>Valor máximo (R$)</label>
          <input id="lista-max" type="number" min="0" step="0.01" value={valorMax} onChange={(e) => setValorMax(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        {onCancel && (
          <button type="button" onClick={onCancel} className="border border-gray-700 text-gray-300 px-6 py-3 font-sans uppercase tracking-widest text-xs hover:border-white transition-colors">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={saving} className="bg-white text-black px-8 py-3 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">
          {saving ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default WishlistForm;
