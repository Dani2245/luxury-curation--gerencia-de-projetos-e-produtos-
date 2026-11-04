import React, { useState } from 'react';
import { apiFetch } from '../services/api';
import { Field, Feedback } from './OperationLayout';
import { formatValor } from '../services/growth';
import { inputClass, primaryClass, today } from '../services/operations';

const cell = 'p-3 border-b border-gray-800 align-top';
const COLUNAS = [
  ['usuarios', 'Usuários', 'qtd'],
  ['habituais', 'Habituais', '%'],
  ['diasPrimeiroInvestimento', 'Até o 1º investimento', 'dias'],
  ['sessoesSemGatilho', 'Sessões sem gatilho externo', '%'],
  ['atualizados90d', 'Passaportes atualizados (90 dias)', 'qtd'],
  ['consultasLink', 'Consultas vindas de link', 'qtd'],
  ['desativacaoAlertas', 'Desativação de alertas', '%']
];

// RF05 - relatório de indicadores do hábito, por coorte (mês de entrada)
export default function HabitReport() {
  const [filters, setFilters] = useState({ dataInicial: `${today().slice(0, 7)}-01`, dataFinal: today(), perfil: 'comprador', coorte: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { setData(await apiFetch('/growth/habito', { params: filters })); }
    catch (err) { setError(err.message); setData(null); }
    finally { setBusy(false); }
  };

  return (
    <section aria-label="Relatório do hábito">
      <form onSubmit={generate} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end mb-4">
        <Field id="h-inicio" label="Data inicial" type="date" required value={filters.dataInicial} onChange={(e) => setFilters({ ...filters, dataInicial: e.target.value })} />
        <Field id="h-fim" label="Data final" type="date" required value={filters.dataFinal} onChange={(e) => setFilters({ ...filters, dataFinal: e.target.value })} />
        <Field id="h-perfil" label="Perfil"><select id="h-perfil" className={inputClass} value={filters.perfil} onChange={(e) => setFilters({ ...filters, perfil: e.target.value })}><option value="comprador">Comprador</option><option value="proprietário">Proprietário</option><option value="vendedor">Vendedor</option></select></Field>
        <Field id="h-coorte" label="Coorte (AAAA-MM)" placeholder="Todas" value={filters.coorte} onChange={(e) => setFilters({ ...filters, coorte: e.target.value })} />
        <button disabled={busy} className={primaryClass}>Gerar relatório</button>
      </form>
      <p className="font-sans text-xs text-gray-500 mb-4">
        Habitual: comprador ou vendedor com sessão em todas as semanas do período; proprietário que atualiza passaporte ou peça da coleção em todos os meses do período. As metas são hipóteses iniciais.
      </p>
      <Feedback error={error} />
      {data && (data.coortes.length === 0 ? <p className="text-gray-400 py-6">Nenhum usuário nesse perfil e coorte.</p> : (
        <div className="overflow-x-auto border border-gray-800">
          <table className="w-full text-left font-sans text-sm">
            <caption className="text-left font-serif text-xl p-4 bg-[#111]">Indicadores do hábito · {data.perfil}</caption>
            <thead><tr><th scope="col" className={cell}>Coorte</th>{COLUNAS.map(([, h]) => <th key={h} scope="col" className={cell}>{h}</th>)}</tr></thead>
            <tbody>
              {data.coortes.map((c) => (
                <tr key={c.coorte} data-testid={`coorte-${c.coorte}`}>
                  <td className={cell}>{c.coorte}</td>
                  {COLUNAS.map(([k, , u]) => <td key={k} className={cell} data-col={k}>{formatValor(c[k], u)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-3 text-xs text-gray-500">Consultas anônimas por link ou QR no período (sem conta): {data.consultasLinkAnonimas}</p>
        </div>
      ))}
    </section>
  );
}
