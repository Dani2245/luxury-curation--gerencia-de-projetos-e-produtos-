import React from 'react';
const reasons = {
  autenticidade: 'Autenticidade',
  conservacao: 'Estado de conservação',
  documentacao: 'Documentação',
  entrega: 'Entrega',
  outro: 'Outro / legado não classificado',
};
export default function CustomerOperationsMetrics({ data }) {
  if (!data) return null;
  const rows = [
    ['Planos criados', data.planos.total],
    ['Planos ativos', data.planos.ativos],
    ['Planos concluídos', data.planos.concluidos],
    ['Planos cancelados', data.planos.cancelados],
    ['Ações criadas', data.acoes.total],
    ['Ações pendentes', data.acoes.pendentes],
    ['Ações em andamento', data.acoes.emAndamento],
    ['Ações concluídas', data.acoes.concluidas],
    ['Ações canceladas', data.acoes.canceladas],
    ['Ações atrasadas', data.acoes.atrasadas],
    ['Conferências realizadas', data.conferencias.total],
    ['Conferências aprovadas', data.conferencias.aprovadas],
    ['Aprovadas sem disputa', data.conferencias.semDisputa],
    ['Conferências contestadas', data.conferencias.contestadas],
    [
      'Taxa de aprovação',
      data.conferencias.taxaAprovacao === null ? 'Sem base' : `${data.conferencias.taxaAprovacao}%`,
    ],
    ['Peças publicadas', data.publicacao.quantidade],
    ['Dias do cadastro à publicação', data.publicacao.mediaDias ?? 'Sem base'],
    ['Datas legadas de publicação', data.publicacao.registrosLegados],
    ['Dossiês abertos no período', data.dossies.total],
    ['Dossiês em acompanhamento', data.dossies.ativos],
    ['Dossiês parados há mais de 10 dias', data.dossies.parados],
    ['Desistências', data.dossies.desistidos],
    ['Dossiês publicados', data.dossies.publicados],
  ];
  return (
    <section className="border border-gray-800 p-5 my-6" aria-label="Indicadores operacionais da saúde da base">
      <h2 className="text-2xl font-serif mb-4">Acompanhamento e resultados</h2>
      <p className="text-sm text-gray-400 mb-5">
        Os filtros acima valem para todos os indicadores. Planos, ações e dossiês usam a data de criação; conferências,
        a data da conferência; publicações, a data da publicação registrada. As situações refletem o estado atual dos
        registros selecionados.
      </p>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(([label, value]) => (
          <div key={label} className="border border-gray-800 p-4">
            <dt className="text-sm text-gray-400">{label}</dt>
            <dd className="text-2xl mt-2">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="text-xl font-serif mt-6 mb-3">Disputas por motivo</h3>
      {!data.disputas.length ? (
        <p>Nenhuma disputa no período.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">Categoria</th>
              <th className="p-3">Quantidade</th>
            </tr>
          </thead>
          <tbody>
            {data.disputas.map((d) => (
              <tr key={d.motivo} className="border-t border-gray-800">
                <td className="p-3">{reasons[d.motivo]}</td>
                <td className="p-3">{d.quantidade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-sm text-gray-400 mt-4">
        Conferências aprovadas incluem liberações administrativas; “sem disputa” separa as que nunca foram contestadas.
        Cada transação conta uma vez, mesmo quando comprador e vendedor pertencem à seleção. Publicações usam a primeira
        evidência disponível; datas legadas indicam registros anteriores sem evento de primeira publicação. Motivos
        livres e eventos individuais não são exibidos.
      </p>
    </section>
  );
}
