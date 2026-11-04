import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import OperationLayout, { Field, Feedback } from './OperationLayout';
import { apiFetch, getUser, formatDateTime } from '../services/api';
import { buttonClass, primaryClass, inputClass } from '../services/operations';
const stages = {
  diagnostico: 'Diagnóstico',
  verificacao: 'Verificação',
  dossie: 'Dossiê',
  pericia: 'Perícia',
  curadoria: 'Curadoria',
  publicacao: 'Publicação',
};
const statuses = { ativo: 'Em acompanhamento', desistido: 'Desistência registrada', concluido: 'Publicado' };
const fresh = () => ({ pecaId: '', diagnostico: '', documentacao: '' });
export default function OnboardingDossiers() {
  const admin = getUser()?.perfil === 'Administrador';
  const [items, setItems] = useState([]),
    [pieces, setPieces] = useState([]),
    [form, setForm] = useState(fresh);
  const [filters, setFilters] = useState({ status: '', parados: '', busca: '' });
  const [movement, setMovement] = useState(null),
    [history, setHistory] = useState(null);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const load = async (params = filters) => {
    const [d, p] = await Promise.all([apiFetch('/cs/dossies', { params }), apiFetch('/cs/dossies/pecas')]);
    setItems(d);
    setPieces(p);
  };
  useEffect(() => {
    load({})
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
      setHistory(null);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async (e) => {
    e.preventDefault();
    if (
      await run(
        () => apiFetch(`/cs/dossies${form.id ? `/${form.id}` : ''}`, { method: form.id ? 'PUT' : 'POST', body: form }),
        'Dossiê salvo com histórico.',
      )
    )
      setForm(fresh());
  };
  const move = async (e) => {
    e.preventDefault();
    if (
      await run(
        () => apiFetch(`/cs/dossies/${movement.id}/movimentos`, { method: 'POST', body: movement }),
        'Movimentação registrada.',
      )
    )
      setMovement(null);
  };
  return (
    <OperationLayout
      title="Dossiês de onboarding"
      description="Acompanhe cada peça do diagnóstico à publicação. Dossiês sem avanço de etapa há mais de 10 dias ficam destacados; editar uma observação não reinicia esse prazo."
    >
      <Feedback error={error} notice={notice} />
      <ol className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {Object.values(stages).map((s, i) => (
          <li key={s} className="border border-gray-800 p-3">
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <form onSubmit={save} className="border border-gray-800 p-5 mb-8 space-y-4">
        <h2 className="text-2xl font-serif">{form.id ? `Editar dossiê #${form.id}` : 'Abrir dossiê'}</h2>
        {!form.id && (
          <Field id="do-peca" label="Peça ainda não publicada">
            <select
              id="do-peca"
              className={inputClass}
              required
              value={form.pecaId}
              onChange={(e) => setForm({ ...form, pecaId: e.target.value })}
            >
              <option value="">Selecione</option>
              {pieces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · #{p.id}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="do-diagnostico" label="Diagnóstico inicial">
          <textarea
            id="do-diagnostico"
            className={inputClass}
            required
            maxLength={2000}
            value={form.diagnostico}
            onChange={(e) => setForm({ ...form, diagnostico: e.target.value })}
          />
        </Field>
        <Field id="do-documentacao" label="Dossiê: procedência, documentos reunidos e pendências">
          <textarea
            id="do-documentacao"
            className={inputClass}
            maxLength={4000}
            value={form.documentacao}
            onChange={(e) => setForm({ ...form, documentacao: e.target.value })}
          />
        </Field>
        <p className="text-sm text-gray-400">
          Fotografias são anexadas no cadastro da peça. Laudo e passaporte são emitidos pelo perito. O administrador
          registra a verificação e valida o avanço das etapas.
        </p>
        <div className="flex gap-3">
          <button disabled={busy || loading} className={primaryClass}>
            Salvar dossiê
          </button>
          {form.id && (
            <button type="button" className={buttonClass} onClick={() => setForm(fresh())}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>
      <form
        className="flex gap-4 flex-wrap items-end mb-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError('');
          try {
            await load();
          } catch (e) {
            setError(e.message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <Field
          id="do-busca"
          label="Peça ou número do dossiê"
          value={filters.busca}
          onChange={(e) => setFilters({ ...filters, busca: e.target.value })}
        />
        <Field id="do-status" label="Situação">
          <select
            id="do-status"
            className={inputClass}
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Todas</option>
            {Object.entries(statuses).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex gap-2 items-center py-2">
          <input
            id="do-parados"
            type="checkbox"
            checked={filters.parados === 'true'}
            onChange={(e) => setFilters({ ...filters, parados: e.target.checked ? 'true' : '' })}
          />
          Somente parados há mais de 10 dias
        </label>
        <button className={buttonClass} disabled={busy || loading}>
          Consultar dossiês
        </button>
      </form>
      {loading ? (
        <p role="status">Carregando dossiês...</p>
      ) : !items.length ? (
        <p>Nenhum dossiê encontrado.</p>
      ) : (
        <div className="space-y-5">
          {items.map((d) => (
            <article key={d.id} data-testid={`dossie-${d.id}`} className="border border-gray-800 p-5">
              <h2 className="text-2xl font-serif">
                {d.peca?.nome} · #{d.id}
              </h2>
              <p className="mt-2">
                {statuses[d.status]} · Etapa: <strong>{stages[d.etapa]}</strong>
              </p>
              <p className="text-sm text-gray-400">Nesta etapa desde {formatDateTime(d.etapa_em)}</p>
              {d.parado && <p className="text-orange-300 mt-2">Parado há mais de 10 dias — requer acompanhamento.</p>}
              <p className="mt-3 whitespace-pre-wrap">{d.diagnostico}</p>
              <p className="text-gray-400 whitespace-pre-wrap">
                {d.documentacao || 'Documentação ainda não descrita.'}
              </p>
              {d.motivo && <p className="mt-2">Motivo da desistência: {d.motivo}</p>}
              {d.status === 'ativo' && d.etapa === 'curadoria' && (
                <p className="mt-3">
                  A publicação pela curadoria conclui este dossiê automaticamente. Peças privadas precisam da
                  autorização do vendedor para anunciar.
                </p>
              )}
              <div className="flex gap-3 flex-wrap mt-4">
                <Link className={buttonClass} to={`/peca/${d.peca_id}`}>
                  Ver peça
                </Link>
                {d.status === 'ativo' && (
                  <>
                    {['diagnostico', 'verificacao', 'dossie'].includes(d.etapa) && (
                      <button
                        className={buttonClass}
                        aria-label={`Editar dossiê ${d.id}`}
                        onClick={() => {
                          setForm({ id: d.id, diagnostico: d.diagnostico, documentacao: d.documentacao });
                          setMovement(null);
                        }}
                      >
                        Editar
                      </button>
                    )}
                    {admin && d.etapa !== 'curadoria' && (
                      <button
                        className={buttonClass}
                        aria-label={`Avançar dossiê ${d.id}`}
                        onClick={() => setMovement({ id: d.id, acao: 'avancar', observacao: '' })}
                      >
                        Validar e avançar
                      </button>
                    )}
                    <button
                      className={buttonClass}
                      aria-label={`Desistir do dossiê ${d.id}`}
                      onClick={() => setMovement({ id: d.id, acao: 'desistir', observacao: '' })}
                    >
                      Registrar desistência
                    </button>
                  </>
                )}
                {d.status === 'desistido' && (
                  <button
                    className={buttonClass}
                    aria-label={`Retomar dossiê ${d.id}`}
                    onClick={() => setMovement({ id: d.id, acao: 'retomar', observacao: '' })}
                  >
                    Retomar
                  </button>
                )}
                <button
                  className={buttonClass}
                  aria-label={`Histórico do dossiê ${d.id}`}
                  onClick={() =>
                    apiFetch(`/cs/dossies/${d.id}/historico`)
                      .then((h) => setHistory({ id: d.id, items: h }))
                      .catch((e) => setError(e.message))
                  }
                >
                  Histórico
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {movement && (
        <form onSubmit={move} className="border border-[#A69076] p-5 mt-6 space-y-4">
          <h2 className="text-xl font-serif">
            {movement.acao === 'avancar'
              ? 'Validar e avançar'
              : movement.acao === 'desistir'
                ? 'Registrar desistência'
                : 'Retomar acompanhamento'}{' '}
            · #{movement.id}
          </h2>
          <Field id="do-observacao" label="Verificação realizada / justificativa">
            <textarea
              id="do-observacao"
              className={inputClass}
              required
              maxLength={1000}
              value={movement.observacao}
              onChange={(e) => setMovement({ ...movement, observacao: e.target.value })}
            />
          </Field>
          <div className="flex gap-3">
            <button className={primaryClass} disabled={busy}>
              Confirmar movimentação
            </button>
            <button type="button" className={buttonClass} onClick={() => setMovement(null)}>
              Voltar
            </button>
          </div>
        </form>
      )}
      {history && (
        <section className="mt-6 border border-gray-800 p-5">
          <h2 className="text-xl font-serif">Histórico do dossiê #{history.id}</h2>
          <ol className="space-y-4 mt-4">
            {history.items.map((h) => (
              <li key={h.id}>
                {formatDateTime(h.criado_em)} · {h.acao}
                <p>{h.observacao}</p>
                <p className="text-sm text-gray-400">
                  {h.anterior ? `${stages[h.anterior.etapa]} → ` : ''}
                  {stages[h.atual.etapa]} · {statuses[h.atual.status]}
                </p>
                {h.acao === 'edicao' && (
                  <p className="text-sm text-gray-400">
                    Diagnóstico anterior: {h.anterior.diagnostico}
                    <br />
                    Documentação anterior: {h.anterior.documentacao || 'Não descrita'}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </OperationLayout>
  );
}
