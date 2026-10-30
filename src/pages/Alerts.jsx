import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, History, Power, Trash2 } from 'lucide-react';
import { apiFetch, formatDate, formatDateTime, getUser } from '../services/api';
import { FREQUENCIAS, TIPOS_ALERTA } from '../services/wishlist';

const inputClass = 'w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans appearance-none';
const labelClass = 'block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2';
const actionClass = 'flex items-center gap-2 border border-gray-700 px-3 py-2 font-sans text-xs uppercase tracking-widest text-gray-300 hover:border-white transition-colors';

const CanalOptions = () => (
  <>
    <option value="plataforma">Plataforma</option>
    <option value="email" disabled>E-mail (indisponível nesta versão)</option>
  </>
);

const proximoEnvio = (alerta) => {
  if (!alerta.ativo) return 'Desligado: nenhum envio';
  if (!alerta.proximoEnvio) return 'Sai assim que houver novidade';
  return `Próximo envio a partir de ${formatDate(alerta.proximoEnvio)}`;
};

// RFC21 - Alertas e lembretes (RFS73 a RFS76): opcionais, desligáveis e com frequência conservadora (RNF05)
const Alerts = () => {
  const user = getUser();
  const comprador = user?.perfil === 'Comprador';
  const tipo = comprador ? 'peca compativel' : 'passaporte incompleto';
  const [searchParams] = useSearchParams();

  const [alertas, setAlertas] = useState([]);
  const [listas, setListas] = useState([]);
  const [incompletos, setIncompletos] = useState([]);
  const [listaId, setListaId] = useState(searchParams.get('lista') || '');
  const [frequencia, setFrequencia] = useState(comprador ? 'semanal' : 'mensal');
  const [frequenciaConservacao, setFrequenciaConservacao] = useState('mensal');
  const [canal, setCanal] = useState('plataforma');
  const [edicao, setEdicao] = useState({});
  const [historico, setHistorico] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [alertasData, extra] = await Promise.all([
        apiFetch('/alertas'),
        comprador ? apiFetch('/listas') : apiFetch('/alertas/passaportes-incompletos')
      ]);
      setAlertas(alertasData);
      setEdicao(Object.fromEntries(alertasData.map((a) => [a.id, { frequencia: a.frequencia, canal: a.canal }])));
      if (comprador) setListas(extra);
      else setIncompletos(extra);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [comprador]);

  useEffect(() => {
    load();
  }, [load]);

  const listasSemAlerta = listas.filter((l) => !l.alertaId);
  const listaSelecionada = listasSemAlerta.some((l) => String(l.id) === listaId) ? listaId : String(listasSemAlerta[0]?.id ?? '');
  const podeCriar = comprador ? listasSemAlerta.length > 0 : !alertas.some((a) => a.tipo === 'passaporte incompleto');

  const run = async (action, message) => {
    setError('');
    setNotice('');
    try {
      await action();
      await load();
      setNotice(message);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreate = (e) => {
    e.preventDefault();
    run(
      () => apiFetch('/alertas', { method: 'POST', body: { tipo, listaId: comprador ? listaSelecionada : undefined, frequencia, canal } }),
      'Alerta criado.'
    );
  };

  const handleCreateConservacao = (e) => {
    e.preventDefault();
    run(() => apiFetch('/alertas', { method: 'POST', body: { tipo: 'conservacao', frequencia: frequenciaConservacao } }), 'Lembrete de conservação criado.');
  };

  const toggleHistorico = async (alerta) => {
    if (historico[alerta.id]) {
      setHistorico(({ [alerta.id]: _, ...rest }) => rest);
      return;
    }
    try {
      const data = await apiFetch(`/alertas/${alerta.id}/envios`);
      setHistorico((prev) => ({ ...prev, [alerta.id]: data }));
    } catch (err) {
      setError(err.message);
    }
  };

  const setCampo = (id, campo, valor) => setEdicao((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-sans uppercase tracking-widest text-xs">
        <ArrowLeft className="w-4 h-4" /> Voltar ao painel
      </Link>

      <h1 className="text-4xl font-serif mb-2">Alertas e lembretes</h1>
      <p className="text-gray-500 font-sans text-sm mb-8">
        Todo alerta é opcional e pode ser desligado a qualquer momento. A frequência padrão é conservadora e nenhum aviso se repete antes do próximo período.
      </p>

      {error && <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">{error}</div>}
      {notice && <div role="status" className="bg-emerald-900/40 border border-emerald-500 text-emerald-200 px-4 py-3 mb-6 font-sans text-sm">{notice}</div>}

      <form onSubmit={handleCreate} aria-label="Novo alerta" className="bg-[#111] border border-gray-800 p-6 space-y-6 mb-10">
        <h2 className="text-xl font-serif">{comprador ? 'Novo alerta de peça compatível' : 'Lembrete de passaportes incompletos'}</h2>
        <p className="text-gray-400 font-sans text-sm">
          {comprador
            ? 'Avisa quando a curadoria publicar uma peça que combine com a lista escolhida.'
            : 'Lembra das peças do estoque sem passaporte, laudo pericial, nota fiscal ou fotografia.'}
        </p>

        {comprador && listas.length === 0 ? (
          <p className="text-gray-400 font-sans text-sm">
            Crie uma <Link to="/dashboard" className="text-[#A69076] hover:text-white">lista de desejos</Link> para receber alertas de peças compatíveis.
          </p>
        ) : !podeCriar ? (
          <p className="text-gray-400 font-sans text-sm">
            {comprador ? 'Todas as suas listas já têm alerta.' : 'Seu lembrete já está configurado abaixo.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {comprador && (
                <div>
                  <label htmlFor="alerta-lista" className={labelClass}>Lista de desejos</label>
                  <select id="alerta-lista" value={listaSelecionada} onChange={(e) => setListaId(e.target.value)} className={inputClass}>
                    {listasSemAlerta.map((l) => <option key={l.id} value={String(l.id)}>{l.nome}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="alerta-frequencia" className={labelClass}>Frequência</label>
                <select id="alerta-frequencia" value={frequencia} onChange={(e) => setFrequencia(e.target.value)} className={inputClass}>
                  {Object.entries(FREQUENCIAS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="alerta-canal" className={labelClass}>Canal</label>
                <select id="alerta-canal" value={canal} onChange={(e) => setCanal(e.target.value)} className={inputClass}>
                  <CanalOptions />
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="bg-white text-black px-8 py-3 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors">
                Criar alerta
              </button>
            </div>
          </>
        )}
      </form>

      {/* RFC21: lembrete de atualizar o estado de conservação das peças da coleção privada (RFC23) */}
      {comprador && (
        <form onSubmit={handleCreateConservacao} aria-label="Lembrete de conservação" className="bg-[#111] border border-gray-800 p-6 space-y-4 mb-10">
          <h2 className="text-xl font-serif">Lembrete de conservação</h2>
          <p className="text-gray-400 font-sans text-sm">Lembra das peças da sua coleção cujo estado de conservação não é atualizado há mais de 90 dias.</p>
          {alertas.some((a) => a.tipo === 'conservacao') ? (
            <p className="text-gray-400 font-sans text-sm">Seu lembrete de conservação já está configurado abaixo.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label htmlFor="alerta-conservacao-frequencia" className={labelClass}>Frequência</label>
                <select id="alerta-conservacao-frequencia" value={frequenciaConservacao} onChange={(e) => setFrequenciaConservacao(e.target.value)} className={inputClass}>
                  {Object.entries(FREQUENCIAS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                </select>
              </div>
              <button type="submit" className="bg-white text-black px-8 py-3 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors">
                Criar lembrete de conservação
              </button>
            </div>
          )}
        </form>
      )}

      <section aria-labelledby="meus-alertas" className="mb-10">
        <h2 id="meus-alertas" className="text-2xl font-serif mb-4">Meus alertas</h2>
        {alertas.length === 0 ? (
          <p className="text-gray-500 font-sans text-sm">Nenhum alerta configurado.</p>
        ) : (
          <ul className="space-y-4">
            {alertas.map((a) => (
              <li key={a.id} data-testid={`alerta-${a.id}`} className="bg-[#111] border border-gray-800 p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <p className="text-white font-serif text-lg">{TIPOS_ALERTA[a.tipo]}</p>
                    {a.listaNome && <p className="text-gray-400 font-sans text-sm">Lista: {a.listaNome}</p>}
                    <p className="text-gray-500 font-sans text-xs mt-1">
                      {a.ultimoEnvio ? `Último envio em ${formatDateTime(a.ultimoEnvio)}` : 'Nenhum envio ainda'} · {proximoEnvio(a)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => run(() => apiFetch(`/alertas/${a.id}/ativo`, { method: 'PATCH', body: { ativo: !a.ativo } }), a.ativo ? 'Alerta desligado.' : 'Alerta ligado.')}
                    aria-pressed={a.ativo}
                    aria-label={`Ligar ou desligar alerta ${a.id}`}
                    className={`flex items-center gap-2 border px-4 py-2 font-sans text-xs uppercase tracking-widest transition-colors ${a.ativo ? 'border-emerald-500/60 text-emerald-400' : 'border-gray-600 text-gray-400'}`}
                  >
                    <Power className="w-4 h-4" /> {a.ativo ? 'Ligado' : 'Desligado'}
                  </button>
                </div>

                <div className="flex flex-col md:flex-row md:items-end gap-4">
                  <div className="md:w-48">
                    <label htmlFor={`alerta-${a.id}-frequencia`} className={labelClass}>Frequência</label>
                    <select id={`alerta-${a.id}-frequencia`} value={edicao[a.id]?.frequencia} onChange={(e) => setCampo(a.id, 'frequencia', e.target.value)} className={inputClass}>
                      {Object.entries(FREQUENCIAS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                    </select>
                  </div>
                  <div className="md:w-64">
                    <label htmlFor={`alerta-${a.id}-canal`} className={labelClass}>Canal</label>
                    <select id={`alerta-${a.id}-canal`} value={edicao[a.id]?.canal} onChange={(e) => setCampo(a.id, 'canal', e.target.value)} className={inputClass}>
                      <CanalOptions />
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      aria-label={`Salvar alerta ${a.id}`}
                      onClick={() => run(() => apiFetch(`/alertas/${a.id}`, { method: 'PUT', body: edicao[a.id] }), 'Alerta atualizado.')}
                      className={actionClass}
                    >
                      Salvar
                    </button>
                    <button type="button" aria-label={`Histórico do alerta ${a.id}`} aria-expanded={Boolean(historico[a.id])} onClick={() => toggleHistorico(a)} className={actionClass}>
                      <History className="w-4 h-4" /> Histórico ({a.envios})
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir alerta ${a.id}`}
                      onClick={() => window.confirm('Excluir este alerta definitivamente?') && run(() => apiFetch(`/alertas/${a.id}`, { method: 'DELETE' }), 'Alerta excluído.')}
                      className={`${actionClass} hover:border-red-400 hover:text-red-400`}
                    >
                      <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                  </div>
                </div>

                {historico[a.id] && (
                  historico[a.id].length === 0 ? (
                    <p className="font-sans text-sm text-gray-500">Nenhum envio registrado.</p>
                  ) : (
                    <ul aria-label={`Envios do alerta ${a.id}`} className="font-sans text-sm text-gray-400 space-y-2 border-l border-gray-800 pl-4">
                      {historico[a.id].map((e) => (
                        <li key={e.id}>
                          <span className="text-gray-200">{e.titulo}</span> · {formatDateTime(e.criadoEm)}
                          <p className="text-gray-500 text-xs">{e.mensagem}</p>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!comprador && (
        <section aria-labelledby="passaportes-estoque">
          <h2 id="passaportes-estoque" className="text-2xl font-serif mb-2">Passaportes do estoque</h2>
          <p className="text-gray-500 font-sans text-sm mb-4">Completo: passaporte emitido, com laudo pericial e nota fiscal, e peça com fotografia.</p>
          {incompletos.length === 0 ? (
            <p className="text-gray-400 font-sans text-sm">Todos os passaportes do estoque estão completos.</p>
          ) : (
            <ul className="space-y-3">
              {incompletos.map((p) => (
                <li key={p.pecaId} data-testid={`incompleto-${p.pecaId}`} className="bg-[#111] border border-gray-800 p-4">
                  <Link to={`/peca/${p.pecaId}`} className="text-white font-serif hover:text-[#A69076]">{p.nome}</Link>
                  <p className="text-yellow-400/90 font-sans text-sm">Falta: {p.pendencias.join(', ')}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};

export default Alerts;
