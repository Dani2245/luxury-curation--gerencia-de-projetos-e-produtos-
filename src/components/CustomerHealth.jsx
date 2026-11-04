import React, { useEffect, useState } from 'react';
import OperationLayout, { Field, Feedback } from './OperationLayout';
import { apiFetch, getUser, formatDateTime } from '../services/api';
import { inputClass, primaryClass, buttonClass, today, displayDate } from '../services/operations';
const labels = { risco: 'Risco', atencao: 'Atenção', saudavel: 'Saudável' };
const initialFilters = () => ({ dataInicial: today().slice(0, 8) + '01', dataFinal: today(), perfil: '', coorte: '' });
const configLabels = {
  peso_atividade: 'Peso da atividade',
  peso_passaporte: 'Peso do uso de passaporte',
  peso_fluxo: 'Peso do fluxo principal',
  dias_meta: 'Meta de dias ativos',
  limite_atencao: 'Atenção a partir de',
  limite_saudavel: 'Saudável a partir de',
};
const explanation =
  'Atividade conta dias com login; passaporte conta consulta, emissão, atualização ou uso de laudos. Fluxo principal: vendedor cadastra peça, compartilha passaporte ou aceita proposta; comprador salva peça, mantém coleção ou conclui compra; perito assina laudo ou emite passaporte.';
export default function CustomerHealth() {
  const admin = getUser()?.perfil === 'Administrador';
  const [data, setData] = useState(null),
    [config, setConfig] = useState(null),
    [history, setHistory] = useState(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const load = async () =>
    setData(await apiFetch(admin ? '/clientes/saude' : '/clientes/meu-health', admin ? { params: filters } : {}));
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch(admin ? '/clientes/saude' : '/clientes/meu-health', admin ? { params: initialFilters() } : {}),
      admin ? apiFetch('/clientes/health-config') : Promise.resolve(null),
    ])
      .then(([d, c]) => {
        if (active) {
          setData(d);
          setConfig(c ? { ...c, motivo: '' } : null);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [admin]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiFetch('/clientes/health-config', { method: 'PUT', body: config });
      await load();
      setConfig({ ...config, motivo: '' });
      setHistory(null);
      setNotice('Regras atualizadas com histórico.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const c = data?.config;
  return (
    <OperationLayout
      title={admin ? 'Saúde da base de clientes' : 'Meu Health Score'}
      description={
        admin
          ? 'Resumo agregado de participação por perfil, coorte e período. As regras ficam explícitas e cada alteração tem justificativa.'
          : 'Veja sua participação nos últimos 30 dias, os sinais usados e como a pontuação é calculada.'
      }
    >
      <Feedback error={error} notice={notice} />
      {admin && (
        <form onSubmit={submit} className="grid sm:grid-cols-5 gap-4 mb-6 items-end">
          <Field
            id="hs-inicio"
            label="Data inicial"
            type="date"
            required
            max={today()}
            value={filters.dataInicial}
            onChange={(e) => setFilters({ ...filters, dataInicial: e.target.value })}
          />
          <Field
            id="hs-fim"
            label="Data final"
            type="date"
            required
            max={today()}
            value={filters.dataFinal}
            onChange={(e) => setFilters({ ...filters, dataFinal: e.target.value })}
          />
          <Field id="hs-perfil" label="Perfil">
            <select
              id="hs-perfil"
              className={inputClass}
              value={filters.perfil}
              onChange={(e) => setFilters({ ...filters, perfil: e.target.value })}
            >
              <option value="">Todos</option>
              {['Comprador', 'Vendedor', 'Perito'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="hs-coorte"
            label="Coorte (mês de cadastro)"
            type="month"
            value={filters.coorte}
            onChange={(e) => setFilters({ ...filters, coorte: e.target.value })}
          />
          <button disabled={busy} className={primaryClass}>
            Consultar saúde
          </button>
        </form>
      )}
      {!data && !error && <p role="status">Carregando indicadores...</p>}
      {data && (
        <>
          <p className="text-gray-400 mb-4">
            Período: {displayDate(data.inicio)} a {displayDate(data.fim)}
          </p>
          {admin ? (
            <>
              <div className="grid sm:grid-cols-3 gap-4 mb-6">
                {[
                  ['Contas', data.total],
                  ['Contas com login', data.ativos],
                  ['Pontuação média', data.media ?? 'Sem base'],
                ].map(([label, value]) => (
                  <div key={label} className="border border-gray-800 p-5">
                    {label}
                    <p className="text-3xl mt-2">{value}</p>
                  </div>
                ))}
              </div>
              {data.total === 0 ? (
                <p>Nenhuma conta encontrada para os filtros.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Saúde agregada por perfil e faixa</caption>
                    <thead>
                      <tr>
                        {['Perfil', 'Faixa', 'Quantidade', 'Média'].map((h) => (
                          <th className="p-3" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.grupos.map((g) => (
                        <tr key={`${g.perfil}-${g.faixa}`} className="border-t border-gray-800">
                          <td className="p-3">{g.perfil}</td>
                          <td className="p-3">{labels[g.faixa]}</td>
                          <td className="p-3">{g.quantidade}</td>
                          <td className="p-3">{g.media}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="border border-gray-800 p-6">
              <p className="text-4xl font-serif">
                {data.pontuacao} / 100 · {labels[data.faixa]}
              </p>
              <ul className="mt-5 space-y-2">
                <li>
                  Dias com login: {data.diasAtivos} (meta: {c.dias_meta})
                </li>
                <li>Uso de passaporte: {data.usoPassaporte ? 'registrado' : 'ainda não registrado'}</li>
                <li>Uso do fluxo principal: {data.fluxoConcluido ? 'registrado' : 'ainda não registrado'}</li>
              </ul>
            </div>
          )}
          <section className="my-6 border border-gray-800 p-5">
            <h2 className="text-xl font-serif mb-3">Como a pontuação é calculada</h2>
            <p className="text-sm text-gray-400 mb-3">{explanation}</p>
            <p>
              {c.peso_atividade} × mínimo(dias ativos / {c.dias_meta}, 1) + {c.peso_passaporte} se houve uso de
              passaporte + {c.peso_fluxo} se houve uso do fluxo principal.
            </p>
            <p className="mt-2">
              Risco: abaixo de {c.limite_atencao}. Atenção: de {c.limite_atencao} até menos de {c.limite_saudavel}.
              Saudável: a partir de {c.limite_saudavel}.
            </p>
            <p className="text-sm text-gray-400 mt-3">
              As regras vigentes são aplicadas ao período consultado. Esta pontuação orienta o acompanhamento do uso e
              não limita acesso, preços ou transações.
            </p>
          </section>
        </>
      )}
      {admin && config && (
        <section className="border border-gray-800 p-5 mt-8">
          <h2 className="text-2xl font-serif mb-5">Regras do Health Score</h2>
          <form onSubmit={save} className="grid sm:grid-cols-3 gap-4">
            {Object.entries(configLabels).map(([key, label]) => (
              <Field
                key={key}
                id={`hs-${key}`}
                label={label}
                type="number"
                required
                min={key === 'dias_meta' ? 1 : 0}
                max={key === 'dias_meta' ? 30 : 100}
                step="1"
                value={config[key]}
                onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
              />
            ))}
            <Field
              id="hs-motivo"
              label="Justificativa da alteração"
              required
              maxLength={500}
              value={config.motivo}
              onChange={(e) => setConfig({ ...config, motivo: e.target.value })}
            />
            <div className="self-end">
              <button disabled={busy} className={primaryClass}>
                Salvar regras
              </button>
            </div>
          </form>
          <button
            className={`${buttonClass} mt-5`}
            onClick={() =>
              apiFetch('/clientes/health-config/historico')
                .then(setHistory)
                .catch((e) => setError(e.message))
            }
          >
            Histórico de regras
          </button>
          {history && (
            <ol className="space-y-3 mt-4">
              {history.length === 0 && <li>Nenhuma alteração registrada.</li>}
              {history.map((h) => (
                <li key={h.id}>
                  {formatDateTime(h.criado_em)} · {h.motivo}
                  <p className="text-sm text-gray-400">
                    Pesos: {h.anterior.peso_atividade}/{h.anterior.peso_passaporte}/{h.anterior.peso_fluxo} →{' '}
                    {h.atual.peso_atividade}/{h.atual.peso_passaporte}/{h.atual.peso_fluxo}; meta de dias:{' '}
                    {h.anterior.dias_meta} → {h.atual.dias_meta}; faixas: {h.anterior.limite_atencao}/
                    {h.anterior.limite_saudavel} → {h.atual.limite_atencao}/{h.atual.limite_saudavel}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </OperationLayout>
  );
}
