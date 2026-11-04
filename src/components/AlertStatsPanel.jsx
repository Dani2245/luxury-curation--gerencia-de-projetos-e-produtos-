import React, { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { TIPOS_ALERTA, slug } from '../services/wishlist';

// RFS74 - o administrador vê a taxa de desativação dos alertas (métrica de proteção do Plano de Growth)
const AlertStatsPanel = () => {
  const [resumo, setResumo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/alertas/resumo')
      .then(setResumo)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <section aria-labelledby="resumo-alertas" className="mt-16">
      <h2 id="resumo-alertas" className="text-2xl font-serif mb-2">Alertas e lembretes</h2>
      <p className="text-gray-500 font-sans text-sm mb-6">
        Taxa de desativação: alertas desligados ou excluídos enquanto ligados, sobre os alertas criados.
      </p>

      {error && <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">{error}</div>}

      {resumo && (
        <div className="overflow-x-auto border border-gray-800">
          <table className="w-full font-sans text-sm">
            <thead className="bg-[#111] text-gray-400 text-xs uppercase tracking-widest">
              <tr>
                <th scope="col" className="text-left px-4 py-3">Tipo</th>
                <th scope="col" className="text-right px-4 py-3">Criados</th>
                <th scope="col" className="text-right px-4 py-3">Ligados</th>
                <th scope="col" className="text-right px-4 py-3">Desligados</th>
                <th scope="col" className="text-right px-4 py-3">Excluídos</th>
                <th scope="col" className="text-right px-4 py-3">Envios</th>
                <th scope="col" className="text-right px-4 py-3">Abertos</th>
                <th scope="col" className="text-right px-4 py-3">Taxa de desativação</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r) => (
                <tr key={r.tipo} data-testid={`resumo-alerta-${slug(r.tipo)}`} className="border-t border-gray-800">
                  <td className="px-4 py-3 text-gray-200">{TIPOS_ALERTA[r.tipo]}</td>
                  <td className="px-4 py-3 text-right text-white" data-col="criados">{r.criados}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{r.ativos}</td>
                  <td className="px-4 py-3 text-right text-gray-300" data-col="desativados">{r.desativados}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{r.removidos}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{r.envios}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{r.abertos}</td>
                  <td className="px-4 py-3 text-right text-white" data-col="taxa">{r.taxaDesativacao === null ? '—' : `${r.taxaDesativacao}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default AlertStatsPanel;
