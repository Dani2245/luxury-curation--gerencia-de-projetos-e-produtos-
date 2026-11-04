import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, formatDateTime, getUser } from '../services/api';
import OperationLayout, { Field, Feedback } from '../components/OperationLayout';
import { STATUS_INDICACAO } from '../services/growth';
import { buttonClass, inputClass, primaryClass } from '../services/operations';

const emptyForm = { nome: '', contato: '', perfil: 'comprador' };
const conviteUrl = (codigo) => `${window.location.origin}/lista-de-espera?convite=${codigo}`;

// RFC18 - indicar novos compradores e vendedores e acompanhar cada indicação (RFS61 a RFS64)
const Referrals = () => {
  const user = getUser();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [convite, setConvite] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await apiFetch('/indicacoes')); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, message) => {
    setBusy(true); setError(''); setNotice('');
    try { const result = await fn(); await load(); setNotice(message); return result || true; }
    catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  };
  const create = async (e) => {
    e.preventDefault();
    setConvite('');
    const result = await run(() => apiFetch('/indicacoes', { method: 'POST', body: form }), 'Indicação registrada. Envie o convite à pessoa indicada.');
    if (result?.codigo) { setConvite(conviteUrl(result.codigo)); setForm(emptyForm); }
  };
  const save = async (e) => {
    e.preventDefault();
    if (await run(() => apiFetch(`/indicacoes/${editing.id}`, { method: 'PUT', body: { nome: editing.nome, contato: editing.contato } }), 'Indicação atualizada.')) setEditing(null);
  };
  const cancel = (i) => {
    if (!window.confirm(`Cancelar a indicação de ${i.contato}?`)) return;
    run(() => apiFetch(`/indicacoes/${i.id}`, { method: 'DELETE' }), 'Indicação cancelada.');
  };

  return (
    <OperationLayout title="Indicações" description="Indique quem pode comprar ou vender na Lastro. A pessoa entra pela lista de espera com o seu convite e, quando a conta for criada, a indicação fica registrada como origem.">
      <form onSubmit={create} className="grid sm:grid-cols-4 gap-4 items-end mb-4" aria-label="Nova indicação">
        <Field id="ind-nome" label="Nome do indicado" required maxLength={150} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <Field id="ind-contato" label="E-mail do indicado" type="email" required maxLength={255} value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} />
        <Field id="ind-perfil" label="Perfil"><select id="ind-perfil" className={inputClass} value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value })}><option value="comprador">Comprador</option><option value="vendedor">Vendedor</option></select></Field>
        <button disabled={busy} className={primaryClass}>Indicar</button>
      </form>
      <Feedback error={error} notice={notice} />
      {convite && (
        <p className="border border-[#A69076] p-4 mb-6 font-sans text-sm text-gray-300">
          Link do convite: <span data-testid="convite-link" className="text-[#D3BE96] break-all">{convite}</span>
        </p>
      )}
      {items.length === 0 ? <p className="text-gray-400 py-6">Nenhuma indicação registrada.</p> : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} data-testid={`indicacao-${i.id}`} className="border border-gray-800 p-4 font-sans text-sm">
              {editing?.id === i.id ? (
                <form onSubmit={save} className="grid sm:grid-cols-3 gap-3 items-end">
                  <Field id="ind-e-nome" label="Nome" required value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} />
                  <Field id="ind-e-contato" label="E-mail" type="email" required value={editing.contato} onChange={(e) => setEditing({ ...editing, contato: e.target.value })} />
                  <div className="flex gap-2"><button disabled={busy} className={primaryClass}>Salvar indicação</button><button type="button" className={buttonClass} onClick={() => setEditing(null)}>Voltar</button></div>
                </form>
              ) : (
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="text-white">{i.nome} · {i.contato}</p>
                    <p className="text-gray-400">
                      {i.perfil} · <span data-testid={`indicacao-${i.id}-status`}>{STATUS_INDICACAO[i.status]}</span> · indicada em {formatDateTime(i.criadoEm)}
                      {user.perfil === 'Administrador' && ` · por ${i.indicador.nome}`}
                    </p>
                    {i.status === 'enviada' && <p className="text-gray-500 text-xs break-all">Convite: {conviteUrl(i.codigo)}</p>}
                  </div>
                  {i.status === 'enviada' && (
                    <div className="flex gap-2">
                      <button type="button" className={buttonClass} aria-label={`Editar indicação ${i.contato}`} onClick={() => setEditing({ id: i.id, nome: i.nome, contato: i.contato })}>Editar</button>
                      <button type="button" disabled={busy} className={buttonClass} aria-label={`Cancelar indicação ${i.contato}`} onClick={() => cancel(i)}>Cancelar</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </OperationLayout>
  );
};

export default Referrals;
