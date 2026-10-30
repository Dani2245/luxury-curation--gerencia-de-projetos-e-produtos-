import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import ItemDetails from './pages/ItemDetails';
import Auth from './pages/Auth';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import CreateItem from './pages/CreateItem';
import EditItem from './pages/EditItem';
import Users from './pages/Users';
import Passport from './pages/Passport';
import IssuePassport from './pages/IssuePassport';
import Transactions from './pages/Transactions';
import PublicPassport from './pages/PublicPassport';
import Wishlist from './pages/Wishlist';
import Alerts from './pages/Alerts';
import ProtectedRoute from './components/ProtectedRoute';
import Custody from './components/Custody';
import Reports from './components/Reports';
import Waitlist from './pages/Waitlist';
import WaitlistAdmin from './pages/WaitlistAdmin';
import Referrals from './pages/Referrals';
import Growth from './pages/Growth';
import Collection from './pages/Collection';
import Reviews from './pages/Reviews';

const App = () => {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/p/:token" element={<PublicPassport />} />
          <Route path="/catalogo" element={<ProtectedRoute roles={['Comprador', 'Administrador']}><Catalog /></ProtectedRoute>} />
          <Route path="/peca/:id" element={<ProtectedRoute roles={['Comprador', 'Administrador', 'Vendedor', 'Perito']}><ItemDetails /></ProtectedRoute>} />
          <Route path="/peca/:id/passaporte" element={<ProtectedRoute roles={['Comprador', 'Administrador', 'Vendedor', 'Perito']}><Passport /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard/nova-peca" element={<ProtectedRoute roles={['Vendedor']}><CreateItem /></ProtectedRoute>} />
          <Route path="/dashboard/peca/:id/editar" element={<ProtectedRoute roles={['Vendedor']}><EditItem /></ProtectedRoute>} />
          <Route path="/dashboard/passaportes/:pecaId/emitir" element={<ProtectedRoute roles={['Perito']}><IssuePassport /></ProtectedRoute>} />
          <Route path="/dashboard/transacoes" element={<ProtectedRoute roles={['Comprador', 'Vendedor', 'Administrador']}><Transactions /></ProtectedRoute>} />
          <Route path="/dashboard/listas/:id" element={<ProtectedRoute roles={['Comprador']}><Wishlist /></ProtectedRoute>} />
          <Route path="/dashboard/alertas" element={<ProtectedRoute roles={['Comprador', 'Vendedor']}><Alerts /></ProtectedRoute>} />
          <Route path="/dashboard/usuarios" element={<ProtectedRoute roles={['Administrador']}><Users /></ProtectedRoute>} />
          <Route path="/dashboard/custodias" element={<ProtectedRoute roles={['Administrador']}><Custody /></ProtectedRoute>} />
          <Route path="/dashboard/relatorios" element={<ProtectedRoute roles={['Administrador']}><Reports /></ProtectedRoute>} />
          <Route path="/lista-de-espera" element={<Waitlist />} />
          <Route path="/dashboard/lista-espera" element={<ProtectedRoute roles={['Administrador']}><WaitlistAdmin /></ProtectedRoute>} />
          <Route path="/dashboard/indicacoes" element={<ProtectedRoute><Referrals /></ProtectedRoute>} />
          <Route path="/dashboard/growth" element={<ProtectedRoute roles={['Administrador']}><Growth /></ProtectedRoute>} />
          <Route path="/dashboard/colecao" element={<ProtectedRoute roles={['Comprador']}><Collection /></ProtectedRoute>} />
          <Route path="/dashboard/avaliacoes" element={<ProtectedRoute roles={['Comprador', 'Vendedor', 'Administrador']}><Reviews /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
