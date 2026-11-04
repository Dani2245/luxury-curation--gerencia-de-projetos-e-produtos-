import React, { useEffect, useState } from 'react';
import { apiFetch, formatCurrency } from '../services/api';

const faixa = (min, max) => {
  if (min === null && max === null) return 'qualquer valor';
  if (min === null) return `até ${formatCurrency(max)}`;
  if (max === null) return `a partir de ${formatCurrency(min)}`;
  return `${formatCurrency(min)} a ${formatCurrency(max)}`;
};

// RFS78 - o administrador vê só a demanda agregada das listas de desejos, sem identificar o comprador
const WishlistDemandPanel = () => {
  const [demanda, setDemanda] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/listas/demanda')
      .then(setDemanda)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <section aria-labelledby="demanda-listas" className="mt-16">
      <h2 id="demanda-listas" className="text-2xl font-serif mb-2">Demanda das listas de desejos</h2>
      <p className="text-gray-500 font-sans text-sm mb-6">Somente dados agregados, sem identificar compradores.</p>

      {error && <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">{error}</div>}

      {demanda && (demanda.categorias.length === 0 ? (
        <p className="text-gray-500 font-sans text-sm">Nenhuma lista de desejos criada.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 overflow-x-auto border border-gray-800">
            <table className="w-full font-sans text-sm">
              <thead className="bg-[#111] text-gray-400 text-xs uppercase tracking-widest">
                <tr>
                  <th scope="col" className="text-left px-4 py-3">Categoria</th>
                  <th scope="col" className="text-right px-4 py-3">Listas</th>
                  <th scope="col" className="text-right px-4 py-3">Compradores</th>
                  <th scope="col" className="text-right px-4 py-3">Faixa média</th>
                </tr>
              </thead>
              <tbody>
                {demanda.categorias.map((c) => (
                  <tr key={c.categoria} data-testid={`demanda-${c.categoria}`} className="border-t border-gray-800">
                    <td className="px-4 py-3 text-gray-200 first-letter:uppercase">{c.categoria}</td>
                    <td className="px-4 py-3 text-right text-white" data-col="listas">{c.listas}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{c.compradores}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{faixa(c.valorMinMedio, c.valorMaxMedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-[#111] border border-gray-800 p-5">
            <h3 className="text-gray-400 uppercase tracking-widest text-xs font-sans mb-3">Peças mais salvas</h3>
            {demanda.pecasMaisSalvas.length === 0 ? (
              <p className="text-gray-500 font-sans text-sm">Nenhuma peça salva.</p>
            ) : (
              <ol className="space-y-2 font-sans text-sm text-gray-300 list-decimal list-inside">
                {demanda.pecasMaisSalvas.map((p) => (
                  <li key={p.nome}>{p.nome} <span className="text-gray-500">· {p.vezes}×</span></li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ))}
    </section>
  );
};

export default WishlistDemandPanel;
