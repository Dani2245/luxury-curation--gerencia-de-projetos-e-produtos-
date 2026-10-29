import React, { useState } from 'react';
import { apiFetch } from '../services/api';
import { buttonClass, primaryClass, inputClass, labelClass } from '../services/operations';

export default function TransactionDeliveryActions({ transaction: t, perfil, busy, act }) {
  const [form, setForm] = useState(null);
  const [text, setText] = useState('');
  const post = (path, body, message) => act(message, () => apiFetch(`/transacoes/${t.id}/${path}`, { method: 'POST', body }));
  const submit = async (e) => {
    e.preventDefault();
    const envio = form === 'envio';
    const contestacao = form === 'contestar';
    const ok = await post(envio ? 'envio' : contestacao ? 'conferencia' : 'resolucao',
      envio ? { rastreio: text } : contestacao ? { aprovada: false, motivo: text } : { decisao: form, motivo: text },
      envio ? 'Envio registrado.' : contestacao ? 'Entrega contestada. O pagamento permanece retido.' : form === 'liberar' ? 'Contestação resolvida: venda concluída e pagamento simulado liberado.' : 'Contestação resolvida: pagamento simulado estornado.');
    if (ok) { setForm(null); setText(''); }
  };
  const show = (kind) => { setForm(kind); setText(''); };
  return <div className="space-y-3">
    <div className="flex flex-wrap justify-end gap-2">
      {t.status === 'aceita' && perfil === 'Comprador' && <button disabled={busy} type="button" className={primaryClass} aria-label={`Pagar simulado ${t.pecaNome}`} onClick={() => post('pagamento', undefined, 'Pagamento simulado registrado e retido até a conferência.')}>Pagar (simulado)</button>}
      {t.status === 'paga' && perfil === 'Vendedor' && <button disabled={busy} type="button" className={buttonClass} aria-label={`Registrar envio de ${t.pecaNome}`} onClick={() => show('envio')}>Registrar envio</button>}
      {t.status === 'enviada' && perfil === 'Comprador' && <button disabled={busy} type="button" className={buttonClass} aria-label={`Receber ${t.pecaNome}`} onClick={() => post('recebimento', undefined, 'Recebimento confirmado. Confira a peça antes de aprovar.')}>Confirmar recebimento</button>}
      {t.status === 'em_conferencia' && perfil === 'Comprador' && <>
        <button disabled={busy} type="button" className={primaryClass} aria-label={`Aprovar entrega de ${t.pecaNome}`} onClick={() => window.confirm('Aprovar a peça recebida e liberar o pagamento simulado?') && post('conferencia', { aprovada: true }, 'Entrega aprovada. Venda concluída e pagamento simulado liberado.')}>Aprovar entrega</button>
        <button disabled={busy} type="button" className={buttonClass} aria-label={`Contestar entrega de ${t.pecaNome}`} onClick={() => show('contestar')}>Contestar</button>
      </>}
      {t.status === 'contestada' && perfil === 'Administrador' && <>
        <button disabled={busy} type="button" className={buttonClass} aria-label={`Liberar pagamento de ${t.pecaNome}`} onClick={() => show('liberar')}>Resolver e liberar</button>
        <button disabled={busy} type="button" className={buttonClass} aria-label={`Estornar pagamento de ${t.pecaNome}`} onClick={() => show('estornar')}>Resolver e estornar</button>
      </>}
    </div>
    {form && <form onSubmit={submit} className="min-w-64 border border-gray-700 p-3 text-left">
      <label htmlFor={`entrega-${t.id}`} className={labelClass}>{form === 'envio' ? 'Rastreio ou comprovante de envio' : form === 'contestar' ? 'Motivo da contestação' : 'Justificativa da decisão'}</label>
      <textarea id={`entrega-${t.id}`} className={inputClass} required maxLength={form === 'envio' ? 200 : 1000} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2 mt-3"><button disabled={busy} className={primaryClass} aria-label={`Salvar ${form} de ${t.pecaNome}`}>Confirmar {form === 'envio' ? 'envio' : form === 'contestar' ? 'contestação' : form === 'liberar' ? 'liberação' : 'estorno'}</button><button type="button" className={buttonClass} onClick={() => setForm(null)}>Voltar</button></div>
    </form>}
  </div>;
}
