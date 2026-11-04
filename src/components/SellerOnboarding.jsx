import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import OperationLayout, { Feedback } from './OperationLayout';
import { apiFetch } from '../services/api';
import { buttonClass } from '../services/operations';
export default function SellerOnboarding() {
  const [data, setData] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    apiFetch('/clientes/onboarding')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <OperationLayout
      title="Primeiros passos do vendedor"
      description="Acompanhe a preparação de cada peça. As etapas são verificadas pelos dados salvos; reúna a documentação e combine a perícia antes de enviar à curadoria."
    >
      <Feedback error={error} />
      <ol className="grid sm:grid-cols-4 gap-4 mb-8">
        {[
          '1. Cadastrar a peça',
          '2. Reunir fotos, laudo e nota fiscal',
          '3. Emitir o passaporte com o perito',
          '4. Solicitar e acompanhar a curadoria',
        ].map((s) => (
          <li className="border border-gray-800 p-4" key={s}>
            {s}
          </li>
        ))}
      </ol>
      <div className="flex gap-4 flex-wrap mb-6">
        <Link className={buttonClass} to="/dashboard/dossies">Acompanhar dossiês e etapas</Link>
        <Link className={buttonClass} to="/dashboard/nova-peca">
          Cadastrar peça
        </Link>
        <Link className={buttonClass} to="/dashboard/laudos">
          Consultar laudos
        </Link>
        <Link className={buttonClass} to="/dashboard/alertas">
          Configurar lembretes
        </Link>
      </div>
      {!data && !error ? (
        <p role="status">Carregando etapas...</p>
      ) : data?.pecas.length === 0 ? (
        <p>Cadastre sua primeira peça para começar.</p>
      ) : (
        <div className="space-y-5">
          {data?.pecas.map((p) => {
            const docs = p.fotografias && p.laudo && p.notaFiscal;
            const steps = [true, docs, p.passaporte, p.publicacao === 'publicada'];
            const completed = steps.filter(Boolean).length;
            return (
              <article key={p.id} data-testid={`onboarding-${p.id}`} className="border border-gray-800 p-5">
                <h2 className="text-2xl font-serif">{p.nome}</h2>
                <p className="my-2">
                  {completed} de 4 etapas concluídas ({completed * 25}%)
                </p>
                <progress className="w-full mb-4" max="4" value={completed} aria-label={`Progresso de ${p.nome}`} />
                <ul className="space-y-2">
                  <li>Cadastro: concluído</li>
                  <li>
                    Documentação:{' '}
                    {docs
                      ? 'completa'
                      : `pendente${!p.fotografias ? ' · fotografias' : ''}${!p.laudo ? ' · laudo' : ''}${!p.notaFiscal ? ' · nota fiscal' : ''}`}
                  </li>
                  <li>Passaporte: {p.passaporte ? 'emitido' : 'aguardando emissão pelo perito'}</li>
                  <li>
                    Curadoria:{' '}
                    {p.publicacao === 'publicada'
                      ? 'aprovada'
                      : p.publicacao === 'rejeitada'
                        ? 'rejeitada; revise os dados'
                        : p.privada
                          ? 'peça privada; envie para avaliação quando desejar anunciar'
                          : 'aguardando avaliação'}
                  </li>
                </ul>
                <div className="flex flex-wrap gap-3 mt-4">
                  <Link className={buttonClass} to={`/peca/${p.id}`}>
                    Ver peça
                  </Link>
                  {!p.vendida && (
                    <Link className={buttonClass} to={`/dashboard/peca/${p.id}/editar`}>
                      Revisar cadastro
                    </Link>
                  )}
                  {p.passaporte && (
                    <Link className={buttonClass} to={`/peca/${p.id}/passaporte`}>
                      Ver passaporte
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </OperationLayout>
  );
}
