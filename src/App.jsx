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
          <Route path="/peca/:id" element={<ProtectedRoute roles={['Comprador', 'Administrador', 'Vendedor']}><ItemDetails /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard/nova-peca" element={<ProtectedRoute roles={['Vendedor']}><CreateItem /></ProtectedRoute>} />
          <Route path="/dashboard/peca/:id/editar" element={<ProtectedRoute roles={['Vendedor']}><EditItem /></ProtectedRoute>} />
          <Route path="/dashboard/usuarios" element={<ProtectedRoute roles={['Administrador']}><Users /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
