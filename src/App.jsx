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
import ProtectedRoute from './components/ProtectedRoute';

const App = () => {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/catalogo" element={<ProtectedRoute roles={['Comprador', 'Administrador']}><Catalog /></ProtectedRoute>} />
          <Route path="/peca/:id" element={<ProtectedRoute roles={['Comprador', 'Administrador', 'Vendedor', 'Perito']}><ItemDetails /></ProtectedRoute>} />
          <Route path="/peca/:id/passaporte" element={<ProtectedRoute roles={['Comprador', 'Administrador', 'Vendedor', 'Perito']}><Passport /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard/nova-peca" element={<ProtectedRoute roles={['Vendedor']}><CreateItem /></ProtectedRoute>} />
          <Route path="/dashboard/peca/:id/editar" element={<ProtectedRoute roles={['Vendedor']}><EditItem /></ProtectedRoute>} />
          <Route path="/dashboard/passaportes/:pecaId/emitir" element={<ProtectedRoute roles={['Perito']}><IssuePassport /></ProtectedRoute>} />
          <Route path="/dashboard/transacoes" element={<ProtectedRoute roles={['Comprador', 'Vendedor', 'Administrador']}><Transactions /></ProtectedRoute>} />
          <Route path="/dashboard/usuarios" element={<ProtectedRoute roles={['Administrador']}><Users /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
