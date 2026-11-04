import React, { useState } from 'react';
import { apiFetch, formatDateTime } from '../services/api';
import { Field, Feedback } from './OperationLayout';
import { ETAPAS_INDICADOR, LADOS, SITUACAO_META, formatMeta, formatValor } from '../services/growth';
import { inputClass, primaryClass, today } from '../services/operations';

const cell = 'p-3 border-b border-gray-800 align-top';
const initial = () => ({ dataInicial: `${today().slice(0, 7)}-01`, dataFinal: today(), etapa: '', lado: '' });

// RF04 - painel de indicadores de growth: North Star, proteção e funil AARRR, com valor, meta e status,
// e os experimentos concluídos no período com resultado e decisão
export default function GrowthPanel() {
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { setData(await apiFetch('/growth/painel', { params: filters })); }
    catch (err) { setError(err.message); setData(null); }
    finally { setBusy(false); }
  };
  const etapas = data ? ETAPAS_INDICADOR.filter((et) => data.indicadores.some((i) => i.etapa === et)) : [];

  return (
    <section aria-label="Painel de growth">
      <form onSubmit={generate} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end mb-4">
        <Field id="g-inicio" label="Data inicial" type="date" required value={filters.dataInicial} onChange={(e) => setFilters({ ...filters, dataInicial: e.target.value })} />
        <Field id="g-fim" label="Data final" type="date" required value={filters.dataFinal} onChange={(e) => setFilters({ ...filters, dataFinal: e.target.value })} />
        <Field id="g-etapa" label="Etapa"><select id="g-etapa" className={inputClass} value={filters.etapa} onChange={(e) => setFilters({ ...filters, etapa: e.target.value })}><option value="">Todas</option>{ETAPAS_INDICADOR.map((et) => <option key={et} value={et}>{et}</option>)}</select></Field>
        <Field id="g-lado" label="Lado"><select id="g-lado" className={inputClass} value={filters.lado} onChange={(e) => setFilters({ ...filters, lado: e.target.value })}><option value="">Todos</option>{LADOS.map((l) => <option key={l} value={l}>{l}</option>)}</select></Field>
        <button disabled={busy} className={primaryClass}>Gerar painel</button>
      </form>
      <p className="font-sans text-xs text-gray-500 mb-4">Indicadores ativos calculados a partir dos eventos de uso, apenas com dados agregados. Cada geração registra a medição do período.</p>
      <Feedback error={error} />
      {data && <>
        {etapas.length === 0 && <p className="text-gray-400 py-6">Nenhum indicador ativo para esses filtros.</p>}
        {etapas.map((et) => (
          <div key={et} className="mb-6 overflow-x-auto border border-gray-800">
            <table className="w-full text-left font-sans text-sm">
              <caption className="text-left font-serif text-xl p-4 bg-[#111] capitalize">{et}</caption>
              <thead><tr>{['Código', 'Indicador', 'Lado', 'Valor', 'Meta', 'Status'].map((h) => <th key={h} scope="col" className={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {data.indicadores.filter((i) => i.etapa === et).map((i) => (
                  <tr key={i.id} data-testid={`painel-${i.codigo}`}>
                    <td className={cell}>{i.codigo}</td>
                    <td className={cell}>{i.nome}<span className="block text-xs text-gray-500">{i.formula}</span></td>
                    <td className={cell}>{i.lado}</td>
                    <td className={cell} data-col="valor">{formatValor(i.valor, i.unidade)}</td>
                    <td className={cell}>{formatMeta(i.metaMin, i.metaMax, i.unidade)}</td>
                    <td className={`${cell} ${SITUACAO_META[i.situacao]}`} data-col="situacao">{i.situacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <h2 className="font-serif text-2xl mt-8 mb-3">Experimentos concluídos no período</h2>
        {data.experimentos.length === 0 ? <p className="text-gray-400">Nenhum experimento concluído no período.</p> : (
          <ul className="space-y-3 font-sans text-sm">
            {data.experimentos.map((x) => (
              <li key={x.id} data-testid={`painel-experimento-${x.id}`} className="border border-gray-800 p-4">
                <p className="text-white">{x.titulo} · ICE {x.ice} · {x.etapa}</p>
                <p className="text-gray-400">Resultado: {x.resultado}</p>
                <p className="text-gray-400">Decisão: {x.decisao}</p>
                <p className="text-gray-500 text-xs">Concluído em {formatDateTime(x.concluidoEm)}</p>
              </li>
            ))}
          </ul>
        )}
      </>}
    </section>
  );
}
