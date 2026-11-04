import React, { useEffect, useState } from 'react';
import OperationLayout, { Field, Feedback } from './OperationLayout';
import { apiFetch, formatDateTime } from '../services/api';
import { inputClass, buttonClass, primaryClass } from '../services/operations';
const types = { 'casa de leilao': 'Casa de leilão', seguradora: 'Seguradora', galeria: 'Galeria' };
const fresh = () => ({ nome: '', tipo: 'casa de leilao', contato: '', dados: '', condicoes: '' });
export default function Partnerships() {
  const [items, setItems] = useState([]),
    [form, setForm] = useState(fresh),
    [filters, setFilters] = useState({ nome: '', tipo: '', status: '' });
  const [closing, setClosing] = useState(null),
    [history, setHistory] = useState(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      setItems(await apiFetch('/parcerias', { params: filters }));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    apiFetch('/parcerias')
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const run = async (fn, message) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
      setNotice(message);
      setForm(fresh());
      setClosing(null);
      setHistory(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const change = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return (
    <OperationLayout
      title="Parcerias comerciais"
      description="Cadastre casas de leilão, seguradoras e galerias, com contatos e condições comerciais. O encerramento preserva os dados e todas as alterações."
    >
      <Feedback error={error} notice={notice} />
      <form
        className="border border-gray-800 p-5 grid sm:grid-cols-2 gap-4 mb-8"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              apiFetch(`/parcerias${form.id ? `/${form.id}` : ''}`, { method: form.id ? 'PATCH' : 'POST', body: form }),
            form.id ? 'Parceria atualizada.' : 'Parceria cadastrada.',
          );
        }}
      >
        <h2 className="text-2xl font-serif sm:col-span-2">{form.id ? 'Editar parceria' : 'Nova parceria'}</h2>
        <Field
          id="pa-nome"
          label="Nome do parceiro"
          required
          maxLength={150}
          value={form.nome}
          onChange={change('nome')}
        />
        <Field id="pa-tipo" label="Tipo">
          <select id="pa-tipo" className={inputClass} value={form.tipo} onChange={change('tipo')}>
            {Object.entries(types).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="pa-contato"
          label="Contato"
          required
          maxLength={200}
          value={form.contato}
          onChange={change('contato')}
        />
        <Field id="pa-dados" label="Dados do parceiro (endereço, documento ou observações)">
          <textarea
            id="pa-dados"
            className={inputClass}
            maxLength={2000}
            value={form.dados}
            onChange={change('dados')}
          />
        </Field>
        <Field id="pa-condicoes" label="Condições comerciais">
          <textarea
            id="pa-condicoes"
            className={inputClass}
            required
            maxLength={2000}
            value={form.condicoes}
            onChange={change('condicoes')}
          />
        </Field>
        <div className="flex gap-3 items-end">
          <button disabled={busy} className={primaryClass}>
            Salvar parceria
          </button>
          {form.id && (
            <button type="button" className={buttonClass} onClick={() => setForm(fresh())}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>
      <form
        className="flex flex-wrap gap-4 mb-6 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          load().catch((e) => setError(e.message));
        }}
      >
        <Field
          id="pa-filtro-nome"
          label="Nome"
          value={filters.nome}
          onChange={(e) => setFilters({ ...filters, nome: e.target.value })}
        />
        <Field id="pa-filtro-tipo" label="Tipo de parceiro">
          <select
            id="pa-filtro-tipo"
            className={inputClass}
            value={filters.tipo}
            onChange={(e) => setFilters({ ...filters, tipo: e.target.value })}
          >
            <option value="">Todos</option>
            {Object.entries(types).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field id="pa-status" label="Situação">
          <select
            id="pa-status"
            className={inputClass}
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Todas</option>
            <option value="ativa">Ativa</option>
            <option value="encerrada">Encerrada</option>
          </select>
        </Field>
        <button className={buttonClass}>Buscar</button>
      </form>
      {loading ? (
        <p role="status">Carregando parcerias...</p>
      ) : !items.length ? (
        <p>Nenhuma parceria encontrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">Parcerias comerciais</caption>
            <thead>
              <tr>
                {['Parceiro', 'Contato / dados', 'Condições', 'Situação', 'Ações'].map((h) => (
                  <th className="p-3" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} data-testid={`parceria-${p.id}`} className="border-t border-gray-800 align-top">
                  <td className="p-3">
                    {p.nome}
                    <p>{types[p.tipo]}</p>
                  </td>
                  <td className="p-3 whitespace-pre-wrap max-w-xs">
                    {p.contato}
                    <p>{p.dados}</p>
                  </td>
                  <td className="p-3 whitespace-pre-wrap max-w-sm">{p.condicoes}</td>
                  <td className="p-3">
                    {p.encerrada_em ? (
                      <>
                        Encerrada<p>{formatDateTime(p.encerrada_em)}</p>
                        <p>{p.motivo_encerramento}</p>
                      </>
                    ) : (
                      'Ativa'
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {!p.encerrada_em && (
                        <>
                          <button
                            className={buttonClass}
                            aria-label={`Editar parceria ${p.id}`}
                            onClick={() => {
                              setForm(p);
                              document.getElementById('pa-nome')?.focus();
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className={buttonClass}
                            aria-label={`Encerrar parceria ${p.id}`}
                            onClick={() => setClosing({ ...p, motivo: '' })}
                          >
                            Encerrar
                          </button>
                        </>
                      )}
                      <button
                        className={buttonClass}
                        aria-label={`Histórico da parceria ${p.id}`}
                        onClick={() =>
                          apiFetch(`/parcerias/${p.id}/historico`)
                            .then(setHistory)
                            .catch((e) => setError(e.message))
                        }
                      >
                        Histórico
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {closing && (
        <form
          className="my-6 border border-[#A69076] p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => apiFetch(`/parcerias/${closing.id}/encerrar`, { method: 'POST', body: { motivo: closing.motivo } }),
              'Parceria encerrada. Histórico preservado.',
            );
          }}
        >
          <h2 className="text-2xl font-serif">Encerrar: {closing.nome}</h2>
          <Field
            id="pa-motivo"
            label="Motivo do encerramento"
            required
            maxLength={500}
            value={closing.motivo}
            onChange={(e) => setClosing({ ...closing, motivo: e.target.value })}
          />
          <div className="flex gap-3">
            <button disabled={busy} className={primaryClass}>
              Confirmar encerramento
            </button>
            <button type="button" className={buttonClass} onClick={() => setClosing(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {history && (
        <section aria-label="Histórico da parceria" className="my-6 border border-gray-800 p-5">
          <h2 className="text-2xl font-serif mb-4">Histórico da parceria</h2>
          <ol className="space-y-4">
            {history.map((h) => (
              <li key={h.id}>
                <strong>{h.acao}</strong> · {formatDateTime(h.criado_em)}
                <p>
                  {h.atual.nome} · {types[h.atual.tipo]} · {h.atual.contato}
                </p>
                <p className="whitespace-pre-wrap">{h.atual.dados}</p>
                <p className="whitespace-pre-wrap">{h.atual.condicoes}</p>
                <p>{h.atual.motivo_encerramento}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </OperationLayout>
  );
}
