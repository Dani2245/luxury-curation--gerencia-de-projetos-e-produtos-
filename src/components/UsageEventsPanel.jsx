import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../services/api';

const ROTULOS = {
  sessao_inicio: 'Sessões iniciadas (login)',
  passaporte_consulta: 'Consultas ao passaporte por usuários cadastrados',
  passaporte_consulta_link: 'Consultas ao passaporte por link ou QR code',
  passaporte_emissao: 'Passaportes emitidos',
  passaporte_atualizacao: 'Passaportes atualizados',
  passaporte_transferencia: 'Transferências de propriedade',
  passaporte_privacidade: 'Alterações de privacidade do passaporte',
  link_gerado: 'Links de compartilhamento gerados',
  link_editado: 'Links de compartilhamento alterados',
  link_revogado: 'Links de compartilhamento revogados',
  peca_cadastrada: 'Peças cadastradas',
  anuncio_publicado: 'Anúncios publicados pela curadoria',
  anuncio_rejeitado: 'Anúncios recusados pela curadoria',
  transacao_proposta: 'Propostas de compra',
  transacao_confirmada: 'Vendas confirmadas',
  transacao_cancelada: 'Transações canceladas',
  lista_desejos_criada: 'Listas de desejos criadas',
  lista_desejos_editada: 'Listas de desejos alteradas',
  lista_desejos_removida: 'Listas de desejos excluídas',
  peca_salva: 'Peças salvas em listas de desejos',
  alerta_criado: 'Alertas configurados',
  alerta_editado: 'Alertas alterados',
  alerta_desativado: 'Alertas desligados',
  alerta_reativado: 'Alertas religados',
  alerta_removido: 'Alertas excluídos',
  alerta_enviado: 'Alertas enviados na plataforma',
  alerta_aberto: 'Alertas abertos pelo usuário'
};

const inputClass = 'w-full bg-[#0a0a0a] border border-gray-700 px-4 py-2.5 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans';
const labelClass = 'block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2';

const diasAtras = (dias) => {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  return data.toLocaleDateString('sv-SE');
};

// RNF06 - Registro de eventos de uso: o administrador vê apenas dados agregados
const UsageEventsPanel = () => {
  const [dataInicial, setDataInicial] = useState(diasAtras(29));
  const [dataFinal, setDataFinal] = useState(diasAtras(0));
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (inicio, fim) => {
    setError('');
    setLoading(true);
    try {
      setEventos(await apiFetch('/eventos/resumo', { params: { dataInicial: inicio, dataFinal: fim } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(diasAtras(29), diasAtras(0));
  }, [load]);

  const handleSubmit = (e) => {
    e.preventDefault();
    load(dataInicial, dataFinal);
  };

  return (
    <section aria-labelledby="eventos-uso" className="mt-16">
      <h2 id="eventos-uso" className="text-2xl font-serif mb-2">Eventos de uso</h2>
      <p className="text-gray-500 font-sans text-sm mb-6">
        Somente dados agregados. Gatilho externo: acessos vindos de link, QR code, alerta ou e-mail.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row md:items-end gap-4 mb-6" aria-label="Filtrar eventos de uso">
        <div className="md:w-56">
          <label htmlFor="ev-inicio" className={labelClass}>Data inicial</label>
          <input id="ev-inicio" type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} className={inputClass} />
        </div>
        <div className="md:w-56">
          <label htmlFor="ev-fim" className={labelClass}>Data final</label>
          <input id="ev-fim" type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} className={inputClass} />
        </div>
        <button type="submit" className="bg-white text-black px-8 py-3 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors">
          Atualizar
        </button>
      </form>

      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 font-sans">Carregando eventos...</p>
      ) : eventos.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-800">
          <p className="text-gray-500 font-sans">Nenhum evento registrado no período.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-800">
          <table className="w-full font-sans text-sm">
            <thead className="bg-[#111] text-gray-400 text-xs uppercase tracking-widest">
              <tr>
                <th scope="col" className="text-left px-4 py-3">Evento</th>
                <th scope="col" className="text-right px-4 py-3">Total</th>
                <th scope="col" className="text-right px-4 py-3">Gatilho externo</th>
                <th scope="col" className="text-right px-4 py-3">Usuários distintos</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.evento} data-testid={`evento-${e.evento}`} className="border-t border-gray-800">
                  <td className="px-4 py-3 text-gray-200">{ROTULOS[e.evento] || e.evento}</td>
                  <td className="px-4 py-3 text-right text-white" data-col="total">{e.total}</td>
                  <td className="px-4 py-3 text-right text-gray-300" data-col="gatilho">{e.comGatilhoExterno}</td>
                  <td className="px-4 py-3 text-right text-gray-300" data-col="usuarios">{e.usuariosDistintos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default UsageEventsPanel;
