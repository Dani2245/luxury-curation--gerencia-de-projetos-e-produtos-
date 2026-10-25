import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ItemForm from '../components/ItemForm';
import { apiFetch } from '../services/api';

const EditItem = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/pecas/${id}`)
      .then((data) => {
        if (data.emNegociacao) throw new Error('A peça está em negociação e não pode ser editada');
        setItem(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-sans uppercase tracking-widest text-xs">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
      </Link>

      <h1 className="text-4xl font-serif mb-8 border-b border-gray-800 pb-6">Editar Peça</h1>

      {loading && <p className="text-gray-400 font-sans">Carregando...</p>}
      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 font-sans text-sm">
          {error}
        </div>
      )}
      {item && <ItemForm item={item} onSaved={() => navigate('/dashboard')} />}
    </div>
  );
};

export default EditItem;
