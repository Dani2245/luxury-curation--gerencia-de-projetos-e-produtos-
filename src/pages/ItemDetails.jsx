import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, FileText } from 'lucide-react';
import ProposalBox from '../components/ProposalBox';
import SaveToWishlist from '../components/SaveToWishlist';
import { apiFetch, formatCurrency, getUser } from '../services/api';

const ItemDetails = () => {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const user = getUser();

  const fetchItem = useCallback(async () => {
    try {
      setItem(await apiFetch(`/pecas/${id}`));
    } catch (error) {
      console.error('Error fetching item:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!item) return <div className="text-center py-24 pt-32">Peça não encontrada</div>;

  const backTo = user?.perfil === 'Vendedor' ? '/dashboard' : '/catalogo';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24">
      <Link to={backTo} className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-sans uppercase tracking-widest text-xs">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24">
        {/* Imagem */}
        <div className="relative aspect-square lg:aspect-[4/5] bg-[#111]">
          {item.fotografias.length > 0 ? (
            <img
              src={item.fotografias[0]}
              alt={item.nome}
              className="object-cover w-full h-full opacity-90"
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full text-gray-600 font-sans text-xs uppercase tracking-widest">
              Sem fotografia
            </div>
          )}
          {item.fotografias.length > 1 && (
            <ul className="absolute bottom-0 left-0 right-0 flex gap-2 p-2 bg-black/60 overflow-x-auto">
              {item.fotografias.map((url) => (
                <li key={url} className="w-16 h-16 flex-shrink-0">
                  <img src={url} alt="" className="object-cover w-full h-full" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detalhes */}
        <div className="flex flex-col justify-center">
          <p className="text-sm font-sans tracking-widest uppercase text-gray-500 mb-4">
            {item.categoria}
          </p>
          <h1 className="text-4xl md:text-5xl font-serif mb-6">{item.nome}</h1>
          <p className="text-2xl font-sans text-gray-200 mb-8">
            {formatCurrency(item.valor)}
          </p>

          <div className="prose prose-invert font-sans text-gray-400 mb-12">
            <p>{item.descricao || 'Sem descrição informada.'}</p>
          </div>

          {/* Passaporte Digital Section */}
          <div className="bg-[#111] border border-gray-800 p-6 md:p-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              <h3 className="text-xl font-serif text-white">Passaporte Digital</h3>
            </div>
            
            <div className="space-y-4 font-sans text-sm">
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-500">Vendedor</span>
                <span className="text-gray-200">{item.vendedor.nome}</span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="text-gray-500">Status do Passaporte</span>
                <span data-testid="status-passaporte" className="text-emerald-400 uppercase tracking-widest text-xs font-medium">{item.statusPassaporte}</span>
              </div>
            </div>

            <Link
              to={`/peca/${item.id}/passaporte`}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-white text-black py-3 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors"
            >
              <FileText className="w-4 h-4" /> Visualizar Passaporte Completo
            </Link>
            {user?.perfil === 'Perito' && item.statusPassaporte === 'sem passaporte' && (
              <Link
                to={`/dashboard/passaportes/${item.id}/emitir`}
                className="mt-3 w-full flex items-center justify-center border border-[#A69076] text-[#A69076] py-3 font-sans uppercase tracking-widest text-xs hover:bg-[#A69076] hover:text-black transition-colors"
              >
                Emitir passaporte
              </Link>
            )}
          </div>

          {(item.emNegociacao || item.vendida) && user?.perfil !== 'Comprador' && user?.perfil !== 'Administrador' && (
            <p data-testid="situacao-peca" className="text-yellow-400 font-sans text-sm border border-yellow-500/40 px-4 py-3">
              {item.vendida ? 'Peça vendida.' : 'Peça em negociação.'}
            </p>
          )}

          {(user?.perfil === 'Comprador' || user?.perfil === 'Administrador') && item.publicacao === 'publicada' && (
            <ProposalBox key={`${item.id}-${item.emNegociacao}-${item.vendida}`} item={item} onRegistered={fetchItem} />
          )}

          {/* RFC22: o comprador salva a peça consultada na lista de desejos */}
          {user?.perfil === 'Comprador' && item.publicacao === 'publicada' && !item.vendida && (
            <div className="mt-8">
              <SaveToWishlist pecaId={item.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemDetails;
