import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { apiFetch, formatDateTime } from '../services/api';

// Notificações dos alertas e lembretes (RFC21, canal plataforma). Abrir registra o acesso vindo do alerta.
const NotificationsPanel = () => {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/notificacoes')
      .then(setDados)
      .catch((err) => setError(err.message));
  }, []);

  const abrir = async (notificacao) => {
    try {
      const { link } = await apiFetch(`/notificacoes/${notificacao.id}/abrir`, { method: 'POST' });
      navigate(link || '/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  if (!dados && !error) return null;

  return (
    <section aria-labelledby="notificacoes" className="mb-12">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 id="notificacoes" className="flex items-center gap-3 text-2xl font-serif">
          <Bell className="w-5 h-5 text-[#A69076]" /> Notificações
        </h2>
        {dados && (
          <span data-testid="notificacoes-nao-lidas" className="font-sans text-xs uppercase tracking-widest text-gray-400">
            {dados.naoLidas} {dados.naoLidas === 1 ? 'não lida' : 'não lidas'}
          </span>
        )}
      </div>

      {error && <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-4 font-sans text-sm">{error}</div>}

      {dados && dados.notificacoes.length === 0 ? (
        <p className="text-gray-500 font-sans text-sm">
          Nenhuma notificação. <Link to="/dashboard/alertas" className="text-[#A69076] hover:text-white">Configure alertas</Link> para ser avisado das novidades.
        </p>
      ) : (
        <ul className="space-y-3">
          {dados?.notificacoes.map((n) => (
            <li key={n.id} data-testid={`notificacao-${n.id}`} className={`border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${n.lida ? 'bg-[#0d0d0d] border-gray-800' : 'bg-[#111] border-[#A69076]/50'}`}>
              <div className="min-w-0">
                <p className="text-white font-sans">
                  {!n.lida && <span data-testid="nao-lida" className="bg-[#A69076] text-black px-2 py-0.5 mr-2 text-[10px] uppercase tracking-widest font-bold">Nova</span>}
                  {n.titulo}
                </p>
                <p className="text-gray-400 font-sans text-sm break-words">{n.mensagem}</p>
                <p className="text-gray-600 font-sans text-xs">{formatDateTime(n.criadoEm)}</p>
              </div>
              <button
                type="button"
                onClick={() => abrir(n)}
                aria-label={`Abrir notificação ${n.id}`}
                className="border border-gray-700 px-4 py-2 font-sans text-xs uppercase tracking-widest text-gray-300 hover:border-white transition-colors shrink-0"
              >
                Ver
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default NotificationsPanel;
