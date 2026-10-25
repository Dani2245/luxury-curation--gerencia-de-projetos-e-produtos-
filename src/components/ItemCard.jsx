import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { formatCurrency } from '../services/api';

const ItemCard = ({ item }) => {
  const foto = item.fotografias[0];

  return (
    <Link to={`/peca/${item.id}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-[#111] mb-6">
        {foto ? (
          <img
            src={foto}
            alt={item.nome}
            className="object-cover w-full h-full transform group-hover:scale-105 transition-transform duration-700 ease-out opacity-80 group-hover:opacity-100"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-gray-600 font-sans text-xs uppercase tracking-widest">
            Sem fotografia
          </div>
        )}

        {/* Passaporte Digital Badge */}
        {item.statusPassaporte === 'valido' && (
          <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1.5 flex items-center gap-2 border border-white/10">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs tracking-widest uppercase font-sans font-medium text-white/90">
              Passaporte Verificado
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-sans tracking-widest uppercase text-gray-500">
          {item.categoria}
        </p>
        <h3 className="text-xl font-serif text-gray-200 group-hover:text-white transition-colors">
          {item.nome}
        </h3>
        <p className="font-sans text-gray-400">{formatCurrency(item.valor)}</p>
        <p className="font-sans text-xs text-gray-500">
          Vendedor: {item.vendedor.nome} · Passaporte: {item.statusPassaporte}
        </p>
      </div>
    </Link>
  );
};

export default ItemCard;
