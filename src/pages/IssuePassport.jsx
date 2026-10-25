import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import DocumentUpload from '../components/DocumentUpload';
import { apiFetch, formatCurrency } from '../services/api';

const inputClass = 'w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans';
const labelClass = 'block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2';

// RFS05 / RFC07 - Perito emite o passaporte digital, assinado digitalmente
const IssuePassport = () => {
  const { pecaId } = useParams();
  const navigate = useNavigate();
  const [peca, setPeca] = useState(null);
  const [status, setStatus] = useState('valido');
  const [proprietarios, setProprietarios] = useState('');
  const [descricao, setDescricao] = useState('');
  const [files, setFiles] = useState({ certificados: [], laudos: [], notasFiscais: [], fotografias: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch(`/pecas/${pecaId}`).then(setPeca).catch((err) => setError(err.message));
  }, [pecaId]);

  const setFilesOf = (campo) => (list) => setFiles((prev) => ({ ...prev, [campo]: list }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new FormData();
    formData.append('pecaId', pecaId);
    formData.append('status', status);
    formData.append('proprietarios', proprietarios);
    formData.append('descricao', descricao);
    Object.entries(files).forEach(([campo, list]) => list.forEach((file) => formData.append(campo, file)));

    try {
      await apiFetch('/passaportes', { method: 'POST', formData });
      navigate(`/peca/${pecaId}/passaporte`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-sans uppercase tracking-widest text-xs">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
      </Link>

      <h1 className="text-4xl font-serif mb-2">Emitir Passaporte Digital</h1>
      {peca && (
        <p className="text-gray-400 font-sans mb-8 border-b border-gray-800 pb-6">
          <span className="text-white">{peca.nome}</span> · {peca.categoria} · {formatCurrency(peca.valor)} · Vendedor: {peca.vendedor.nome}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 font-sans text-sm">
            {error}
          </div>
        )}

        <div className="bg-[#111] border border-gray-800 p-6 md:p-8 space-y-6">
          <div>
            <label htmlFor="status" className={labelClass}>Status do passaporte *</label>
            <select id="status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} appearance-none`}>
              <option value="valido">Válido</option>
              <option value="em revisão">Em revisão</option>
              <option value="revogado">Revogado</option>
            </select>
          </div>

          <div>
            <label htmlFor="proprietarios" className={labelClass}>Histórico de proprietários anteriores</label>
            <textarea
              id="proprietarios"
              rows={3}
              value={proprietarios}
              onChange={(e) => setProprietarios(e.target.value)}
              className={inputClass}
              placeholder="Um proprietário por linha, do mais antigo ao mais recente"
            />
          </div>

          <div>
            <label htmlFor="descricao" className={labelClass}>Observações do perito</label>
            <textarea id="descricao" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="bg-[#111] border border-gray-800 p-6 md:p-8 space-y-8">
          <h2 className="text-white font-serif text-xl">Documentos</h2>
          <DocumentUpload id="certificados" label="Certificados de autenticidade" required files={files.certificados} onChange={setFilesOf('certificados')} />
          <DocumentUpload id="laudos" label="Laudos periciais" files={files.laudos} onChange={setFilesOf('laudos')} />
          <DocumentUpload id="notasFiscais" label="Notas fiscais" files={files.notasFiscais} onChange={setFilesOf('notasFiscais')} />
          <DocumentUpload id="fotografias" label="Fotografias" files={files.fotografias} onChange={setFilesOf('fotografias')} />
        </div>

        <p className="flex items-center gap-2 text-gray-500 font-sans text-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Ao emitir, o passaporte é assinado digitalmente em seu nome.
        </p>

        <div className="flex justify-end gap-4">
          <Link to="/dashboard" className="px-8 py-4 font-sans uppercase tracking-widest text-xs font-medium text-gray-400 hover:text-white transition-colors">
            Cancelar
          </Link>
          <button type="submit" disabled={loading} className="bg-white text-black px-10 py-4 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">
            {loading ? 'Emitindo...' : 'Emitir e Assinar'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default IssuePassport;
