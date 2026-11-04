import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../services/api';
import { Field, Feedback } from './OperationLayout';
import { buttonClass, inputClass, primaryClass, today, displayDate } from '../services/operations';

const NAMES = { X1: 'Passaporte privado primeiro', X2: 'Leitura do passaporte-exemplo', X3: 'Programa de perito fundador', X4: 'Vendedor indicado pelo perito' };
const CRITERIA = { X1: 'Pelo menos 2 de 5 vendedores aceitam o diagnóstico.', X2: 'Pelo menos 4 de 5 explicam procedência, conservação e quem assinou, sem ajuda.', X3: 'Pelo menos 2 dos 4 laboratórios aceitam assinar um laudo piloto.', X4: 'Pelo menos 1 em cada 3 indicados chega ao diagnóstico.' };
const fresh = () => ({ experimento: 'X1', participante: '', ocorridoEm: today(), resultado: 'pendente', observacao: '', referencia: '', demonstracao: true, indicacaoId: '', laudoId: '', leitura: { procedencia: false, conservacao: false, assinante: false, semAjuda: false } });
const period = () => ({ inicio: today().slice(0,7) + '-01', fim: today() });
export default function GrowthPilots() {
  const [form, setForm] = useState(fresh);
  const [items, setItems] = useState([]);
  const [indicacoes, setIndicacoes] = useState([]);
  const [laudos, setLaudos] = useState([]);
  const [dates, setDates] = useState(period);
  const [summary, setSummary] = useState(null);
  const [example, setExample] = useState({ token: '', nivel: '', estado: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (params) => {
    const [e, s] = await Promise.all([apiFetch('/pilotos/evidencias'), apiFetch('/pilotos/resumo', { params })]);
    setItems(e); setSummary(s);
  }, []);
  useEffect(() => {
    load(period()).catch((e) => setError(e.message));
    apiFetch('/pilotos/indicacoes-peritos').then(setIndicacoes).catch((e) => setError(e.message));
    apiFetch('/laudos').then(setLaudos).catch((e) => setError(e.message));
  }, [load]);
  const run = async (fn, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(dates); setNotice(message); return true; }
    catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  };
  const save = async (e) => {
    e.preventDefault();
    if (await run(() => apiFetch('/pilotos/evidencias', { method: 'POST', body: form }), 'Evidência registrada. Demonstrações não entram nos resultados reais.')) setForm(fresh());
  };
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const results = form.experimento === 'X2' ? ['leitura realizada'] : form.experimento === 'X4' ? ['pendente','recusou','diagnóstico realizado'] : ['pendente','aceitou','recusou'];
  return <section aria-label="Pilotos X1 a X5" className="space-y-6">
    <div className="border border-gray-700 p-5 space-y-2"><h2 className="font-serif text-2xl">Execução e evidências dos pilotos</h2><p className="text-sm text-gray-400">Registre o que foi observado em campo. Use um código para cada participante; não inclua dados pessoais nos relatos. Demonstrações e registros anulados ficam fora dos resultados. Para corrigir uma evidência, anule com justificativa e registre novamente.</p><div className="flex flex-wrap gap-3 text-[#A69076]"><Link to="/passaporte-exemplo">Abrir passaporte-exemplo (X2)</Link><Link to="/peritos-fundadores">Programa de perito fundador (X3)</Link><Link to="/dashboard/indicacoes">Indicar vendedor (X4)</Link><Link to="/lista-de-espera?v=a">Lista sem bolsas (X5 A)</Link><Link to="/lista-de-espera?v=b">Lista com bolsas (X5 B)</Link></div></div>
    <Feedback error={error} notice={notice} />
    <form onSubmit={save} className="grid sm:grid-cols-2 gap-4 border border-gray-800 p-5">
      <Field id="piloto-x" label="Experimento"><select id="piloto-x" className={inputClass} value={form.experimento} onChange={(e) => setForm({ ...fresh(), experimento: e.target.value, resultado: e.target.value === 'X2' ? 'leitura realizada' : 'pendente' })}>{Object.entries(NAMES).map(([x,n]) => <option key={x} value={x}>{x} · {n}</option>)}</select></Field>
      <Field id="piloto-participante" label="Código do participante ou laboratório" required maxLength={100} value={form.participante} onChange={set('participante')} />
      <Field id="piloto-data" label="Data observada" type="date" required max={today()} value={form.ocorridoEm} onChange={set('ocorridoEm')} />
      <Field id="piloto-resultado" label="Resultado observado"><select id="piloto-resultado" className={inputClass} value={form.resultado} onChange={set('resultado')}>{results.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
      {form.experimento === 'X2' && <fieldset className="sm:col-span-2 border border-gray-800 p-4"><legend>Critérios da leitura</legend>{Object.entries({ procedencia: 'Explicou a procedência', conservacao: 'Explicou o estado de conservação', assinante: 'Identificou quem assinou', semAjuda: 'Leu sem ajuda' }).map(([k,v]) => <label key={k} className="block text-sm my-2"><input id={`leitura-${k}`} type="checkbox" checked={form.leitura[k]} onChange={(e) => setForm({ ...form, leitura: { ...form.leitura, [k]: e.target.checked } })} /> {v}</label>)}</fieldset>}
      {form.experimento === 'X4' && <Field id="piloto-indicacao" label="Indicação de vendedor feita por perito"><select id="piloto-indicacao" required className={inputClass} value={form.indicacaoId} onChange={set('indicacaoId')}><option value="">Selecione a indicação</option>{indicacoes.map((i) => <option key={i.id} value={i.id}>{i.nome} · {displayDate(i.criado_em.slice(0,10))}</option>)}</select></Field>}
      {form.experimento === 'X3' && <Field id="piloto-laudo" label="Laudo piloto assinado (quando existir)"><select id="piloto-laudo" className={inputClass} value={form.laudoId} onChange={set('laudoId')}><option value="">Ainda sem laudo</option>{laudos.map((l) => <option key={l.id} value={l.id}>#{l.id} · {l.perito_nome} · {l.peca_nome}</option>)}</select></Field>}
      <div className="sm:col-span-2"><Field id="piloto-observacao" label="Evidência observada ou motivo da recusa"><textarea id="piloto-observacao" required maxLength={2000} className={inputClass} value={form.observacao} onChange={set('observacao')} /></Field></div>
      <Field id="piloto-referencia" label="Referência da evidência (opcional)" maxLength={500} value={form.referencia} onChange={set('referencia')} />
      <label className="flex gap-3 items-center text-sm"><input id="piloto-demo" type="checkbox" checked={form.demonstracao} onChange={(e) => setForm({ ...form, demonstracao: e.target.checked })} />Demonstração — excluir dos resultados reais</label>
      <p className="sm:col-span-2 text-gray-400 text-sm">Critério do plano: {CRITERIA[form.experimento]}</p>
      <button disabled={busy} className={primaryClass}>Registrar evidência</button>
    </form>
    <form onSubmit={(e) => { e.preventDefault(); run(() => load(dates), 'Resultados do período atualizados.'); }} className="flex flex-wrap gap-4 items-end">
      <Field id="piloto-inicio" label="Início do período" type="date" required value={dates.inicio} onChange={(e) => setDates({ ...dates, inicio: e.target.value })} /><Field id="piloto-fim" label="Fim do período" type="date" required value={dates.fim} onChange={(e) => setDates({ ...dates, fim: e.target.value })} /><button className={buttonClass}>Consultar resultados reais</button>
    </form>
    {summary && <div data-testid="pilotos-resumo" className="grid sm:grid-cols-2 gap-4">{Object.entries(NAMES).map(([x,n]) => { const row = summary.evidencias.find((e) => e.experimento === x); return <div key={x} className="border border-gray-800 p-4"><h3>{x} · {n}</h3><p className="text-lg" data-testid={`piloto-total-${x}`}>{row ? `${row.positivos} / ${row.total} com resultado positivo` : 'Sem evidências reais no período'}</p><p className="text-gray-500 text-xs">{CRITERIA[x]}</p>{x === 'X4' && row?.dias_ate_diagnostico != null && <p className="text-sm">Tempo médio da indicação ao diagnóstico: {row.dias_ate_diagnostico} dia(s)</p>}</div>; })}<div className="border border-gray-800 p-4 sm:col-span-2"><h3>X5 · Inscrições de compradores por versão</h3><p>A: {summary.x5.a} · B: {summary.x5.b} · Interesse em bolsas: {summary.x5.interesseBolsas}</p><p>Variação de B sobre A: {summary.x5.variacaoPercentual === null ? 'sem base de comparação' : `${summary.x5.variacaoPercentual}%`} · Critério: pelo menos 30% a mais.</p><p className="text-gray-500 text-xs">Exclui inscrições E2E. Compare campanhas nos mesmos canais e período; o sistema não presume que as exposições foram equivalentes.</p></div></div>}
    <details className="border border-gray-800 p-5"><summary className="cursor-pointer">Selecionar o passaporte-exemplo do X2</summary><form onSubmit={(e) => { e.preventDefault(); run(() => apiFetch('/pilotos/exemplo', { method: 'PUT', body: example }), 'Passaporte-exemplo configurado.'); }} className="space-y-3 mt-4"><p className="text-gray-400 text-sm">Use o código de um link ativo que o proprietário autorizou para demonstração pública. O link precisa permitir documentos e histórico. A revogação também encerra o exemplo.</p><Field id="exemplo-token" label="Código do link (trecho após /p/)" required value={example.token} onChange={(e) => setExample({ ...example, token: e.target.value })} /><Field id="exemplo-nivel" label="Nível de verificação declarado" required maxLength={500} value={example.nivel} onChange={(e) => setExample({ ...example, nivel: e.target.value })} /><Field id="exemplo-estado" label="Estado de conservação declarado" required maxLength={500} value={example.estado} onChange={(e) => setExample({ ...example, estado: e.target.value })} /><button disabled={busy} className={buttonClass}>Salvar passaporte-exemplo</button></form></details>
    <h2 className="font-serif text-2xl">Registros e trilha de correções</h2>
    <ul className="space-y-3">{items.map((e) => <li key={e.id} data-testid={`evidencia-${e.id}`} className="border border-gray-800 p-4 text-sm space-y-2"><p>{e.experimento} · {e.participante} · {displayDate(e.ocorrido_em)} · {e.resultado}</p><p>{e.demonstracao ? 'Demonstração' : 'Evidência real'}{e.anulada_em && ' · Anulada'}</p><p className="whitespace-pre-wrap text-gray-400">{e.observacao}</p>{e.referencia && <p>Referência: {e.referencia}</p>}{e.indicacao_id && <p>Indicação #{e.indicacao_id}</p>}{e.laudo_id && <p>Laudo piloto #{e.laudo_id}</p>}{e.anulada_em ? <p>Motivo da anulação: {e.motivo_anulacao}</p> : <button className={buttonClass} aria-label={`Anular evidência ${e.id}`} disabled={busy} onClick={() => { const motivo = window.prompt('Motivo da anulação:'); if (motivo !== null) run(() => apiFetch(`/pilotos/evidencias/${e.id}/anular`, { method: 'POST', body: { motivo } }), 'Evidência anulada; histórico preservado.'); }}>Anular registro</button>}</li>)}</ul>
  </section>;
}
