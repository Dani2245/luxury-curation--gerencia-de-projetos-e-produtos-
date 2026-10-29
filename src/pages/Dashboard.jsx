import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, LogOut, Users, Store, ArrowLeftRight, Bell } from 'lucide-react';
import SellerItemsPanel from '../components/SellerItemsPanel';
import AdminListingsPanel from '../components/AdminListingsPanel';
import PassportQueuePanel from '../components/PassportQueuePanel';
import UsageEventsPanel from '../components/UsageEventsPanel';
import NotificationsPanel from '../components/NotificationsPanel';
import WishlistsPanel from '../components/WishlistsPanel';
import WishlistDemandPanel from '../components/WishlistDemandPanel';
import AlertStatsPanel from '../components/AlertStatsPanel';
import { clearSession, getUser } from '../services/api';

const TITULOS = {
  Administrador: 'Painel do Administrador',
  Vendedor: 'Painel do Vendedor',
  Comprador: 'Painel do Comprador',
  Perito: 'Painel do Perito'
};

const linkClass = 'bg-white text-black px-6 py-2.5 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors flex items-center gap-2';

const Dashboard = () => {
  const user = getUser();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearSession();
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 border-b border-gray-800 pb-8">
        <div>
          <h1 className="text-4xl font-serif mb-2">{TITULOS[user.perfil]}</h1>
          <p className="text-gray-400 font-sans text-sm">
            Bem-vindo de volta, <span className="text-white">{user.nome}</span>.
          </p>
        </div>

        <div className="mt-6 md:mt-0 flex flex-wrap gap-4">
          {user.perfil === 'Vendedor' && (
            <Link to="/dashboard/nova-peca" className={linkClass}>
              <Plus className="w-4 h-4" /> Nova Peça
            </Link>
          )}
          {user.perfil === 'Administrador' && (
            <><Link to="/dashboard/custodias" className={linkClass}>Custódia física</Link>
            <Link to="/dashboard/relatorios" className={linkClass}>Relatórios e financeiro</Link>
            <Link to="/dashboard/growth" className={linkClass}>Growth</Link>
            <Link to="/dashboard/lista-espera" className={linkClass}>Lista de espera</Link>
            <Link to="/dashboard/usuarios" className={linkClass}>
              <Users className="w-4 h-4" /> Usuários
            </Link></>
          )}
          {user.perfil !== 'Perito' && (
            <Link to="/dashboard/transacoes" className={linkClass}>
              <ArrowLeftRight className="w-4 h-4" /> Transações
            </Link>
          )}
          {(user.perfil === 'Administrador' || user.perfil === 'Comprador') && (
            <Link to="/catalogo" className={linkClass}>
              <Store className="w-4 h-4" /> Catálogo
            </Link>
          )}
          {(user.perfil === 'Comprador' || user.perfil === 'Vendedor') && (
            <Link to="/dashboard/alertas" className={linkClass}>
              <Bell className="w-4 h-4" /> Alertas
            </Link>
          )}
          <Link to="/dashboard/indicacoes" className={linkClass}>Indicações</Link>
          <button
            type="button"
            onClick={handleLogout}
            className="border border-gray-700 text-gray-300 px-4 py-2.5 hover:border-white transition-colors flex items-center gap-2"
            title="Sair"
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {(user.perfil === 'Comprador' || user.perfil === 'Vendedor') && <NotificationsPanel />}
      {user.perfil === 'Vendedor' && <SellerItemsPanel />}
      {user.perfil === 'Administrador' && (
        <>
          <AdminListingsPanel />
          <UsageEventsPanel />
          <WishlistDemandPanel />
          <AlertStatsPanel />
        </>
      )}
      {user.perfil === 'Comprador' && (
        <>
          <p className="text-gray-400 font-sans">Explore o catálogo para buscar peças com passaporte digital de autenticidade.</p>
          <WishlistsPanel />
        </>
      )}
      {user.perfil === 'Perito' && <PassportQueuePanel />}
    </div>
  );
};

export default Dashboard;
