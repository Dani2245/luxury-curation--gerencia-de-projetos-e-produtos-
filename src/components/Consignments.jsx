import React, { useEffect, useState } from 'react';
import OperationLayout, { Field, Feedback } from './OperationLayout';
import { apiFetch, formatDateTime } from '../services/api';
import { inputClass, buttonClass, primaryClass, today, displayDate } from '../services/operations';

const fresh = () => ({ pecaId: '', entradaEm: today(), condicoes: '' });
export default function Consignments() {
  const [items, setItems] = useState([]),
    [pieces, setPieces] = useState([]),
    [entry, setEntry] = useState(fresh);
  const [filters, setFilters] = useState({ peca: '', status: '' }),
    [action, setAction] = useState(null),
    [history, setHistory] = useState(null);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const load = async (params = filters) => {
    setLoading(true);
    try {
      setItems(await apiFetch('/consignacoes', { params }));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    Promise.all([apiFetch('/consignacoes'), apiFetch('/consignacoes/pecas')])
      .then(([a, b]) => {
        setItems(a);
        setPieces(b);
      })
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
      setAction(null);
      setHistory(null);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const piece = pieces.find((p) => String(p.id) === entry.pecaId);
  const create = async (e) => {
    e.preventDefault();
    if (
      await run(
        () => apiFetch('/consignacoes', { method: 'POST', body: { ...entry, vendedorId: piece?.vendedor_id } }),
        'Consignação registrada.',
      )
    )
      setEntry(fresh());
  };
  const save = async (e) => {
    e.preventDefault();
    const exit = action.kind === 'exit';
    await run(
      () =>
        apiFetch(`/consignacoes/${action.id}${exit ? '/devolucao' : ''}`, {
          method: exit ? 'POST' : 'PATCH',
          body: exit ? { saidaEm: action.saidaEm, observacao: action.observacao } : { condicoes: action.condicoes },
        }),
      exit ? 'Devolução registrada. Histórico preservado.' : 'Condições atualizadas.',
    );
  };
  return (
    <OperationLayout
      title="Estoque em consignação"
      description="Registre o recebimento e as condições acordadas com o vendedor. A venda concluída após a conferência dá baixa automaticamente; devoluções são registradas aqui."
    >
      <Feedback error={error} notice={notice} />
      <section className="border border-gray-800 p-5 mb-8">
        <h2 className="text-2xl font-serif mb-4">Receber peça</h2>
        <form onSubmit={create} className="grid sm:grid-cols-2 gap-4">
          <Field id="co-peca" label="Peça">
            <select
              id="co-peca"
              className={inputClass}
              required
              value={entry.pecaId}
              onChange={(e) => setEntry({ ...entry, pecaId: e.target.value })}
            >
              <option value="">Selecione</option>
              {pieces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · #{p.id}
                </option>
              ))}
            </select>
          </Field>
          <Field id="co-vendedor" label="Vendedor consignante" readOnly value={piece?.perfis?.nome || ''} />
          <Field
            id="co-entrada"
            label="Data de entrada"
            type="date"
            required
            max={today()}
            value={entry.entradaEm}
            onChange={(e) => setEntry({ ...entry, entradaEm: e.target.value })}
          />
          <Field id="co-condicoes" label="Condições acordadas">
            <textarea
              id="co-condicoes"
              className={inputClass}
              required
              maxLength={2000}
              value={entry.condicoes}
              onChange={(e) => setEntry({ ...entry, condicoes: e.target.value })}
            />
          </Field>
          <button disabled={busy} className={primaryClass}>
            Registrar consignação
          </button>
        </form>
      </section>
      <form
        className="flex gap-4 flex-wrap items-end mb-5"
        onSubmit={(e) => {
          e.preventDefault();
          load().catch((e) => setError(e.message));
        }}
      >
        <Field
          id="co-filtro"
          label="Peça: nome ou número"
          value={filters.peca}
          onChange={(e) => setFilters({ ...filters, peca: e.target.value })}
        />
        <Field id="co-status" label="Situação">
          <select
            id="co-status"
            className={inputClass}
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Todas</option>
            <option value="em estoque">Em estoque</option>
            <option value="devolucao">Devolvida</option>
            <option value="venda">Vendida</option>
          </select>
        </Field>
        <button className={buttonClass}>Buscar</button>
      </form>
      <p className="text-sm text-gray-400 mb-3">Ordem de entrada: mais antigas primeiro.</p>
      {loading ? (
        <p role="status">Carregando consignações...</p>
      ) : !items.length ? (
        <p>Nenhuma consignação encontrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">Consignações por data de entrada</caption>
            <thead>
              <tr>
                {['Peça / vendedor', 'Entrada', 'Condições', 'Situação', 'Ações'].map((h) => (
                  <th className="p-3" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} data-testid={`consignacao-${c.id}`} className="border-t border-gray-800 align-top">
                  <td className="p-3">
                    {c.peca_nome}
                    <p className="text-gray-400">{c.vendedor_nome}</p>
                  </td>
                  <td className="p-3">{displayDate(c.entrada_em)}</td>
                  <td className="p-3 whitespace-pre-wrap max-w-sm">{c.condicoes}</td>
                  <td className="p-3">
                    {c.status === 'em estoque' ? 'Em estoque' : c.status === 'venda' ? 'Vendida' : 'Devolvida'}
                    {c.saida_em && (
                      <>
                        <p>{displayDate(c.saida_em)}</p>
                        <p>{c.observacao_saida}</p>
                        {c.transacao_id && <p>Transação #{c.transacao_id}</p>}
                      </>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {!c.saida_em && (
                        <>
                          <button
                            className={buttonClass}
                            aria-label={`Editar consignação ${c.id}`}
                            onClick={() => setAction({ ...c, kind: 'edit' })}
                          >
                            Editar condições
                          </button>
                          <button
                            className={buttonClass}
                            aria-label={`Devolver consignação ${c.id}`}
                            onClick={() => setAction({ ...c, kind: 'exit', saidaEm: today(), observacao: '' })}
                          >
                            Devolver
                          </button>
                        </>
                      )}
                      <button
                        className={buttonClass}
                        aria-label={`Histórico da consignação ${c.id}`}
                        onClick={() =>
                          apiFetch(`/consignacoes/${c.id}/historico`)
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
      {action && (
        <form onSubmit={save} className="border border-[#A69076] p-5 my-6 space-y-4">
          <h2 className="text-2xl font-serif">
            {action.kind === 'exit' ? 'Devolver ao vendedor' : 'Editar condições'}: {action.peca_nome}
          </h2>
          {action.kind === 'exit' ? (
            <>
              <Field
                id="co-saida"
                label="Data de devolução"
                type="date"
                required
                min={action.entrada_em}
                max={today()}
                value={action.saidaEm}
                onChange={(e) => setAction({ ...action, saidaEm: e.target.value })}
              />
              <Field
                id="co-motivo"
                label="Justificativa"
                required
                maxLength={500}
                value={action.observacao}
                onChange={(e) => setAction({ ...action, observacao: e.target.value })}
              />
            </>
          ) : (
            <Field id="co-edicao" label="Condições">
              <textarea
                id="co-edicao"
                className={inputClass}
                required
                maxLength={2000}
                value={action.condicoes}
                onChange={(e) => setAction({ ...action, condicoes: e.target.value })}
              />
            </Field>
          )}
          <div className="flex gap-3">
            <button disabled={busy} className={primaryClass}>
              Salvar consignação
            </button>
            <button type="button" className={buttonClass} onClick={() => setAction(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {history && (
        <section aria-label="Histórico da consignação" className="my-6 border border-gray-800 p-5">
          <h2 className="text-2xl font-serif mb-4">Histórico da consignação</h2>
          <ol className="space-y-4">
            {history.map((h) => (
              <li key={h.id}>
                <strong>{h.acao}</strong> · {formatDateTime(h.criado_em)}
                <p className="whitespace-pre-wrap">{h.atual.condicoes}</p>
                <p>{h.atual.observacao_saida}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </OperationLayout>
  );
}
