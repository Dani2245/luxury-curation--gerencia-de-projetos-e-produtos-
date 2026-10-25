import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import ItemForm from '../components/ItemForm';

const CreateItem = () => {
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSaved = () => {
    setSuccess(true);
    setTimeout(() => navigate('/dashboard'), 2000);
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center pt-20 px-4">
        <CheckCircle className="w-16 h-16 text-emerald-400 mb-6" />
        <h2 className="text-3xl font-serif text-white mb-2">Peça Registrada</h2>
        <p className="text-gray-400 font-sans text-center">Seu anúncio foi enviado para validação do administrador antes da publicação.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-sans uppercase tracking-widest text-xs">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
      </Link>

      <h1 className="text-4xl font-serif mb-8 border-b border-gray-800 pb-6">Registro de Nova Peça</h1>

      <ItemForm onSaved={handleSaved} />
    </div>
  );
};

export default CreateItem;
