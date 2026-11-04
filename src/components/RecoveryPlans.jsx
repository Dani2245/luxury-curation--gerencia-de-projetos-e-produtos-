import React, { useEffect, useState } from 'react';
import OperationLayout, { Field, Feedback } from './OperationLayout';
import { apiFetch, getUser, formatDateTime } from '../services/api';
import { buttonClass, primaryClass, inputClass, today, displayDate } from '../services/operations';
const labels = {
  ativo: 'Ativo',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};
export default function RecoveryPlans() {
  const user = getUser(),
    admin = user?.perfil === 'Administrador';
  const fresh = () => ({ clienteId: '', responsavelId: user.id, objetivo: '', prazo: today() });
  const [plans, setPlans] = useState([]),
    [people, setPeople] = useState([]),
    [filter, setFilter] = useState('');
  const [plan, setPlan] = useState(fresh),
    [action, setAction] = useState(null),
    [change, setChange] = useState(null),
    [history, setHistory] = useState(null);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const load = async (status = filter) => setPlans(await apiFetch('/cs/planos', { params: { status } }));
  useEffect(() => {
    Promise.all([apiFetch('/cs/planos'), admin ? apiFetch('/cs/pessoas') : Promise.resolve([])])
      .then(([p, u]) => {
        setPlans(p);
        setPeople(u);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [admin]);
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
  const savePlan = async (e) => {
    e.preventDefault();
    if (
      await run(
        () => apiFetch(`/cs/planos${plan.id ? `/${plan.id}` : ''}`, { method: plan.id ? 'PUT' : 'POST', body: plan }),
        'Plano salvo com histórico.',
      )
    )
      setPlan(fresh());
  };
  const saveAction = async (e) => {
    e.preventDefault();
    if (
      await run(
        () =>
          apiFetch(`/cs/acoes${action.id ? `/${action.id}` : ''}`, {
            method: action.id ? 'PUT' : 'POST',
            body: action,
          }),
        'Ação salva.',
      )
    )
      setAction(null);
  };
  const saveStatus = async (e) => {
    e.preventDefault();
    if (
      await run(
        () =>
          apiFetch(
            `/cs/${change.kind === 'plano' ? 'planos' : 'acoes'}/${change.id}/${change.kind === 'plano' ? 'encerramento' : 'status'}`,
            { method: 'POST', body: { status: change.status, motivo: change.text, resultado: change.text } },
          ),
        'Situação atualizada com histórico.',
      )
    )
      setChange(null);
  };
  return (
    <OperationLayout
      title={admin ? 'Planos de recuperação' : 'Meu plano de recuperação'}
      description="Combine ações para retomar a participação, com responsável, prazo e acompanhamento. As ações não alteram artificialmente o Health Score; ele continua sendo calculado pelos eventos reais."
    >
      <Feedback error={error} notice={notice} />
      {admin && (
        <form onSubmit={savePlan} className="border border-gray-800 p-5 space-y-4 mb-8">
          <h2 className="text-2xl font-serif">{plan.id ? `Editar plano #${plan.id}` : 'Novo plano de recuperação'}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="pr-cliente" label="Cliente">
              <select
                id="pr-cliente"
                required
                disabled={Boolean(plan.id)}
                className={inputClass}
                value={plan.clienteId}
                onChange={(e) => setPlan({ ...plan, clienteId: e.target.value })}
              >
                <option value="">Selecione</option>
                {people
                  .filter((p) => p.perfil !== 'Administrador')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} · {p.perfil}
                    </option>
                  ))}
              </select>
            </Field>
            <Field id="pr-responsavel" label="Responsável pelo acompanhamento">
              <select
                id="pr-responsavel"
                required
                className={inputClass}
                value={plan.responsavelId}
                onChange={(e) => setPlan({ ...plan, responsavelId: e.target.value })}
              >
                {people
                  .filter((p) => p.perfil === 'Administrador')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Field id="pr-objetivo" label="Objetivo / situação a recuperar">
            <textarea
              id="pr-objetivo"
              className={inputClass}
              required
              maxLength={1000}
              value={plan.objetivo}
              onChange={(e) => setPlan({ ...plan, objetivo: e.target.value })}
            />
          </Field>
          <Field
            id="pr-prazo"
            label="Prazo do plano"
            type="date"
            required
            min={today()}
            value={plan.prazo}
            onChange={(e) => setPlan({ ...plan, prazo: e.target.value })}
          />
          <div className="flex gap-3">
            <button className={primaryClass} disabled={busy || loading}>
              Salvar plano
            </button>
            {plan.id && (
              <button type="button" className={buttonClass} onClick={() => setPlan(fresh())}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      )}
      <form
        className="flex gap-4 items-end mb-6"
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
        <Field id="pr-filtro" label="Situação">
          <select id="pr-filtro" className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas</option>
            {['ativo', 'concluido', 'cancelado'].map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </Field>
        <button className={buttonClass} disabled={busy || loading}>
          Consultar planos
        </button>
      </form>
      {loading ? (
        <p role="status">Carregando planos...</p>
      ) : !plans.length ? (
        <p>Nenhum plano encontrado.</p>
      ) : (
        <div className="space-y-6">
          {plans.map((p) => (
            <article key={p.id} data-testid={`plano-${p.id}`} className="border border-gray-800 p-5">
              <h2 className="text-2xl font-serif">
                Plano #{p.id}
                {admin ? ` · ${p.cliente?.nome || 'Cliente'}` : ''}
              </h2>
              <p className="my-3 whitespace-pre-wrap">{p.objetivo}</p>
              <p>
                {labels[p.status]} · Prazo: {displayDate(p.prazo)} · Responsável:{' '}
                {p.responsavel?.nome || 'Administrador'}
              </p>
              {p.status === 'ativo' && p.prazo < today() && <p className="text-orange-300">Plano com prazo vencido.</p>}
              {p.motivo && <p className="text-gray-400 mt-2">Encerramento: {p.motivo}</p>}
              <ul className="space-y-3 my-5">
                {!p.acoes.length && (
                  <li>Nenhuma ação cadastrada. O plano só pode ser concluído após executar as ações.</li>
                )}
                {p.acoes.map((a) => (
                  <li key={a.id} data-testid={`recuperacao-acao-${a.id}`} className="border border-gray-800 p-4">
                    <p className="whitespace-pre-wrap">{a.descricao}</p>
                    <p className="text-sm text-gray-400">
                      {labels[a.status]} · Prazo: {displayDate(a.prazo)}
                    </p>
                    {['pendente', 'em_andamento'].includes(a.status) && a.prazo < today() && (
                      <p className="text-orange-300">Ação atrasada</p>
                    )}
                    {a.resultado && <p className="mt-2 whitespace-pre-wrap">Resultado: {a.resultado}</p>}
                    {p.status === 'ativo' && ['pendente', 'em_andamento'].includes(a.status) && (
                      <div className="flex gap-3 flex-wrap mt-3">
                        {admin && (
                          <button
                            className={buttonClass}
                            aria-label={`Editar ação ${a.id}`}
                            onClick={() =>
                              setAction({
                                id: a.id,
                                planoId: p.id,
                                descricao: a.descricao,
                                prazo: a.prazo,
                                max: p.prazo,
                              })
                            }
                          >
                            Editar ação
                          </button>
                        )}
                        {a.status === 'pendente' && (
                          <button
                            className={buttonClass}
                            aria-label={`Iniciar ação ${a.id}`}
                            onClick={() => setChange({ kind: 'acao', id: a.id, status: 'em_andamento', text: '' })}
                          >
                            Iniciar
                          </button>
                        )}
                        <button
                          className={buttonClass}
                          aria-label={`Concluir ação ${a.id}`}
                          onClick={() => setChange({ kind: 'acao', id: a.id, status: 'concluida', text: '' })}
                        >
                          Concluir ação
                        </button>
                        {admin && (
                          <button
                            className={buttonClass}
                            aria-label={`Cancelar ação ${a.id}`}
                            onClick={() => setChange({ kind: 'acao', id: a.id, status: 'cancelada', text: '' })}
                          >
                            Cancelar ação
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex gap-3 flex-wrap">
                {admin && p.status === 'ativo' && (
                  <>
                    <button
                      className={buttonClass}
                      aria-label={`Editar plano ${p.id}`}
                      onClick={() =>
                        setPlan({
                          id: p.id,
                          clienteId: p.cliente_id,
                          responsavelId: p.responsavel_id,
                          objetivo: p.objetivo,
                          prazo: p.prazo,
                        })
                      }
                    >
                      Editar plano
                    </button>
                    <button
                      className={buttonClass}
                      aria-label={`Adicionar ação ao plano ${p.id}`}
                      onClick={() => setAction({ planoId: p.id, descricao: '', prazo: p.prazo, max: p.prazo })}
                    >
                      Adicionar ação
                    </button>
                    <button
                      className={buttonClass}
                      aria-label={`Concluir plano ${p.id}`}
                      onClick={() => setChange({ kind: 'plano', id: p.id, status: 'concluido', text: '' })}
                    >
                      Concluir plano
                    </button>
                    <button
                      className={buttonClass}
                      aria-label={`Cancelar plano ${p.id}`}
                      onClick={() => setChange({ kind: 'plano', id: p.id, status: 'cancelado', text: '' })}
                    >
                      Cancelar plano
                    </button>
                  </>
                )}
                <button
                  className={buttonClass}
                  aria-label={`Histórico do plano ${p.id}`}
                  onClick={() =>
                    apiFetch(`/cs/planos/${p.id}/historico`)
                      .then((items) => setHistory({ id: p.id, items }))
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
      {action && (
        <form onSubmit={saveAction} className="border border-[#A69076] p-5 space-y-4 mt-6">
          <h2 className="text-xl font-serif">
            {action.id ? 'Editar ação' : 'Adicionar ação'} · Plano #{action.planoId}
          </h2>
          <Field id="pr-acao" label="Ação combinada">
            <textarea
              id="pr-acao"
              className={inputClass}
              required
              maxLength={1000}
              value={action.descricao}
              onChange={(e) => setAction({ ...action, descricao: e.target.value })}
            />
          </Field>
          <Field
            id="pr-acao-prazo"
            label="Prazo da ação"
            type="date"
            required
            min={today()}
            max={action.max}
            value={action.prazo}
            onChange={(e) => setAction({ ...action, prazo: e.target.value })}
          />
          <div className="flex gap-3">
            <button className={primaryClass} disabled={busy}>
              Salvar ação
            </button>
            <button type="button" className={buttonClass} onClick={() => setAction(null)}>
              Voltar
            </button>
          </div>
        </form>
      )}
      {change && (
        <form onSubmit={saveStatus} className="border border-[#A69076] p-5 mt-6 space-y-4">
          <h2 className="text-xl font-serif">
            Registrar {labels[change.status].toLowerCase()} · {change.kind === 'plano' ? 'Plano' : 'Ação'} #{change.id}
          </h2>
          <Field id="pr-resultado" label="Resultado / justificativa">
            <textarea
              id="pr-resultado"
              className={inputClass}
              required
              maxLength={1000}
              value={change.text}
              onChange={(e) => setChange({ ...change, text: e.target.value })}
            />
          </Field>
          <div className="flex gap-3">
            <button className={primaryClass} disabled={busy}>
              Confirmar situação
            </button>
            <button type="button" className={buttonClass} onClick={() => setChange(null)}>
              Voltar
            </button>
          </div>
        </form>
      )}
      {history && (
        <section className="border border-gray-800 p-5 mt-6">
          <h2 className="text-xl font-serif">Histórico do plano #{history.id}</h2>
          <ol className="space-y-4 mt-4">
            {history.items.map((h) => (
              <li key={h.id}>
                {formatDateTime(h.criado_em)} · {h.acao.replaceAll('_', ' ')}
                {h.acao_id ? ` · Ação #${h.acao_id}` : ''}
                <p>{h.atual.objetivo || h.atual.descricao}</p>
                <p>
                  {h.anterior ? `${labels[h.anterior.status]} → ` : ''}
                  {labels[h.atual.status]} · {displayDate(h.atual.prazo)}
                </p>
                <p>{h.atual.resultado || h.atual.motivo}</p>
                {h.anterior && (
                  <p className="text-sm text-gray-400">
                    Anterior: {h.anterior.objetivo || h.anterior.descricao} · {displayDate(h.anterior.prazo)}
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
