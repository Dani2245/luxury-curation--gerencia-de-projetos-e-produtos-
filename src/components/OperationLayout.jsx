import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { inputClass, labelClass } from '../services/operations';

export const Field = ({ id, label, children, ...props }) => (
  <div><label htmlFor={id} className={labelClass}>{label}</label>{children || <input id={id} className={inputClass} {...props} />}</div>
);
export const Feedback = ({ error, notice }) => <>
  {error && <p role="alert" className="bg-red-950/50 border border-red-700 p-3 my-4 text-red-200 font-sans text-sm">{error}</p>}
  {notice && <p role="status" className="bg-emerald-950/40 border border-emerald-700 p-3 my-4 text-emerald-200 font-sans text-sm">{notice}</p>}
</>;

export default function OperationLayout({ title, description, children }) {
  return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16 min-h-screen">
    <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 font-sans text-xs uppercase tracking-widest"><ArrowLeft className="w-4 h-4" /> Voltar ao painel</Link>
    <h1 className="font-serif text-4xl text-white mb-3">{title}</h1>
    <p className="text-gray-400 font-sans text-sm mb-8 max-w-3xl">{description}</p>
    {children}
  </div>;
}
