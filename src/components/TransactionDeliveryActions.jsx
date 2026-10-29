import React, { useState } from 'react';
import { apiFetch } from '../services/api';
import { buttonClass, primaryClass, inputClass, labelClass } from '../services/operations';

// Formulários de cada ação com texto: rótulo do campo, botão, requisição e mensagem de sucesso
const FORMS = {
  envio: { label: 'Rastreio ou comprovante de envio', max: 200, button: 'envio', method: 'POST', path: 'envio', body: (text) => ({ rastreio: text }), message: () => 'Envio registrado.' },
  contestar: { label: 'Motivo da contestação', max: 1000, button: 'contestação', method: 'POST', path: 'conferencia', body: (text, estado) => ({ aprovada: false, motivo: text, estadoObservado: estado }), message: () => 'Entrega contestada. O pagamento permanece retido.' },
  liberar: { label: 'Justificativa da decisão', max: 1000, button: 'liberação', method: 'POST', path: 'resolucao', body: (text) => ({ decisao: 'liberar', motivo: text }), message: (t) => t.status === 'em_conferencia' ? 'Prazo de conferência vencido: venda concluída e pagamento simulado liberado.' : 'Contestação resolvida: venda concluída e pagamento simulado liberado.' },
  estornar: { label: 'Justificativa da decisão', max: 1000, button: 'estorno', method: 'POST', path: 'resolucao', body: (text) => ({ decisao: 'estornar', motivo: text }), message: () => 'Contestação resolvida: pagamento simulado estornado.' },
  excluir: { label: 'Motivo da exclusão da retenção', max: 500, button: 'exclusão', method: 'DELETE', path: 'pagamento', body: (text) => ({ motivo: text }), message: () => 'Retenção excluída. A transação voltou a aguardar o pagamento.' }
};

export default function TransactionDeliveryActions({ transaction: t, perfil, busy, act }) {
  const [form, setForm] = useState(null);
  const [text, setText] = useState('');
  const [estado, setEstado] = useState('');
  const post = (path, body, message) => act(message, () => apiFetch(`/transacoes/${t.id}/${path}`, { method: 'POST', body }));
  const submit = async (e) => {
    e.preventDefault();
    const f = FORMS[form];
    const ok = await act(f.message(t), () => apiFetch(`/transacoes/${t.id}/${f.path}`, { method: f.method, body: f.body(text, estado) }));
    if (ok) { setForm(null); setText(''); setEstado(''); }
  };
  const show = (kind) => { setForm(kind); setText(''); setEstado(''); };
  // RFS39: depois do prazo a contestação não é aceita; o administrador pode liberar o pagamento retido
  const vencida = t.status === 'em_conferencia' && t.prazoSituacao === 'vencido';
  return <div className="space-y-3">
    <div className="flex flex-wrap justify-end gap-2">
      {t.status === 'aceita' && perfil === 'Comprador' && <button disabled={busy} type="button" className={primaryClass} aria-label={`Pagar simulado ${t.pecaNome}`} onClick={() => post('pagamento', undefined, 'Pagamento simulado registrado e retido até a conferência.')}>Pagar (simulado)</button>}
      {t.status === 'paga' && perfil === 'Vendedor' && <button disabled={busy} type="button" className={buttonClass} aria-label={`Registrar envio de ${t.pecaNome}`} onClick={() => show('envio')}>Registrar envio</button>}
      {t.status === 'paga' && perfil === 'Administrador' && <button disabled={busy} type="button" className={buttonClass} aria-label={`Excluir retenção de ${t.pecaNome}`} onClick={() => show('excluir')}>Excluir retenção (erro)</button>}
      {t.status === 'enviada' && perfil === 'Comprador' && <button disabled={busy} type="button" className={buttonClass} aria-label={`Receber ${t.pecaNome}`} onClick={() => post('recebimento', undefined, 'Recebimento confirmado. Confira a peça antes de aprovar.')}>Confirmar recebimento</button>}
      {t.status === 'em_conferencia' && perfil === 'Comprador' && <>
        <button disabled={busy} type="button" className={primaryClass} aria-label={`Aprovar entrega de ${t.pecaNome}`} onClick={() => window.confirm('Aprovar a peça recebida e liberar o pagamento simulado?') && post('conferencia', { aprovada: true }, 'Entrega aprovada. Venda concluída e pagamento simulado liberado.')}>Aprovar entrega</button>
        {!vencida && <button disabled={busy} type="button" className={buttonClass} aria-label={`Contestar entrega de ${t.pecaNome}`} onClick={() => show('contestar')}>Contestar</button>}
      </>}
      {vencida && perfil === 'Administrador' && <button disabled={busy} type="button" className={buttonClass} aria-label={`Liberar pagamento de ${t.pecaNome}`} onClick={() => show('liberar')}>Liberar (prazo vencido)</button>}
      {t.status === 'contestada' && perfil === 'Administrador' && <>
        <button disabled={busy} type="button" className={buttonClass} aria-label={`Liberar pagamento de ${t.pecaNome}`} onClick={() => show('liberar')}>Resolver e liberar</button>
        <button disabled={busy} type="button" className={buttonClass} aria-label={`Estornar pagamento de ${t.pecaNome}`} onClick={() => show('estornar')}>Resolver e estornar</button>
      </>}
    </div>
    {form && <form onSubmit={submit} className="min-w-64 border border-gray-700 p-3 text-left">
      <label htmlFor={`entrega-${t.id}`} className={labelClass}>{FORMS[form].label}</label>
      <textarea id={`entrega-${t.id}`} className={inputClass} required maxLength={FORMS[form].max} value={text} onChange={(e) => setText(e.target.value)} />
      {form === 'contestar' && <>
        <label htmlFor={`estado-${t.id}`} className={`${labelClass} mt-3`}>Estado observado (opcional)</label>
        <textarea id={`estado-${t.id}`} className={inputClass} maxLength={1000} value={estado} onChange={(e) => setEstado(e.target.value)} />
      </>}
      <div className="flex gap-2 mt-3"><button disabled={busy} className={primaryClass} aria-label={`Salvar ${form} de ${t.pecaNome}`}>Confirmar {FORMS[form].button}</button><button type="button" className={buttonClass} onClick={() => setForm(null)}>Voltar</button></div>
    </form>}
  </div>;
}
