import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, ShieldAlert, ShieldCheck } from 'lucide-react';
import DocumentUpload from '../components/DocumentUpload';
import { ApiError, apiFetch, formatDate, formatDateTime, getUser } from '../services/api';

const TIPOS = {
  certificado: 'Certificados de autenticidade',
  laudo: 'Laudos periciais',
  'nota fiscal': 'Notas fiscais',
  fotografia: 'Fotografias',
  restauracao: 'Registros de restauração'
};

const STATUS_STYLE = {
  valido: 'text-emerald-400 border-emerald-500/50',
  'em revisão': 'text-yellow-400 border-yellow-500/50',
  revogado: 'text-red-400 border-red-500/50'
};

const inputClass = 'w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans';
const labelClass = 'block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2';

// RFS06 - Consultar Passaporte Digital; RFS07 - atualização por Perito e Administrador
const Passport = () => {
  const { id } = useParams();
  const user = getUser();
  const [passaporte, setPassaporte] = useState(null);
  const [semPassaporte, setSemPassaporte] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('');
  const [descricao, setDescricao] = useState('');
  const [files, setFiles] = useState({ certificados: [], laudos: [], restauracoes: [], notasFiscais: [], fotografias: [] });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/passaportes/peca/${id}`);
      setPassaporte(data);
      setStatus(data.status);
      setSemPassaporte(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404 && err.message.includes('passaporte')) setSemPassaporte(true);
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilesOf = (campo) => (list) => setFiles((prev) => ({ ...prev, [campo]: list }));

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);

    const formData = new FormData();
    formData.append('status', status === passaporte.status ? '' : status);
    formData.append('descricao', descricao);
    Object.entries(files).forEach(([campo, list]) => list.forEach((file) => formData.append(campo, file)));

    try {
      await apiFetch(`/passaportes/${passaporte.id}`, { method: 'PUT', formData });
      setNotice('Passaporte atualizado e assinado novamente.');
      setDescricao('');
      setFiles({ certificados: [], laudos: [], restauracoes: [], notasFiscais: [], fotografias: [] });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePrivacy = async () => {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/passaportes/${passaporte.id}/privacidade`, {
        method: 'PATCH',
        body: { publico: !passaporte.proprietariosPublicos }
      });
      setNotice('Preferência de privacidade atualizada.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  const canUpdate = user?.perfil === 'Perito' || user?.perfil === 'Administrador';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <Link to={`/peca/${id}`} className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-sans uppercase tracking-widest text-xs">
        <ArrowLeft className="w-4 h-4" /> Voltar à peça
      </Link>

      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="bg-emerald-900/40 border border-emerald-500 text-emerald-200 px-4 py-3 mb-6 font-sans text-sm">
          {notice}
        </div>
      )}

      {semPassaporte && (
        <div className="text-center py-20 border border-dashed border-gray-800">
          <p className="text-gray-400 font-sans">Esta peça ainda não possui passaporte digital.</p>
          {user?.perfil === 'Perito' && (
            <Link to={`/dashboard/passaportes/${id}/emitir`} className="inline-block mt-6 bg-white text-black px-8 py-3 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors">
              Emitir passaporte
            </Link>
          )}
        </div>
      )}

      {passaporte && (
        <>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 border-b border-gray-800 pb-8">
            <div>
              <p className="text-gray-500 font-sans text-xs tracking-widest uppercase mb-2">Passaporte Digital nº {passaporte.id}</p>
              <h1 className="text-4xl font-serif">{passaporte.peca.nome}</h1>
            </div>
            <span className={`self-start md:self-auto border px-4 py-2 font-sans text-xs tracking-widest uppercase ${STATUS_STYLE[passaporte.status]}`}>
              Status: {passaporte.status}
            </span>
          </div>

          <section aria-labelledby="assinatura" className="bg-[#111] border border-gray-800 p-6 md:p-8 mb-8">
            <h2 id="assinatura" className="flex items-center gap-3 text-xl font-serif text-white mb-4">
              {passaporte.assinatura.valida
                ? <ShieldCheck className="w-6 h-6 text-emerald-400" />
                : <ShieldAlert className="w-6 h-6 text-red-400" />}
              Assinatura digital
            </h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans text-sm">
              <div>
                <dt className="text-gray-500">Situação</dt>
                <dd data-testid="assinatura-situacao" className={passaporte.assinatura.valida ? 'text-emerald-400' : 'text-red-400'}>
                  {passaporte.assinatura.valida ? 'Assinatura válida' : 'Assinatura inválida: conteúdo alterado'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Perito responsável</dt>
                <dd className="text-gray-200">{passaporte.perito || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Assinado por</dt>
                <dd className="text-gray-200">{passaporte.assinatura.assinadoPor || '—'} em {formatDateTime(passaporte.assinatura.assinadoEm)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Versão e código</dt>
                <dd className="text-gray-200 font-mono text-xs break-all">v{passaporte.versao} · {passaporte.assinatura.codigo}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="documentos" className="mb-8">
            <h2 id="documentos" className="text-2xl font-serif mb-4">Documentos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(TIPOS).map(([tipo, titulo]) => {
                const docs = passaporte.documentos.filter((d) => d.tipo === tipo);
                if (docs.length === 0) return null;
                return (
                  <div key={tipo} className="bg-[#111] border border-gray-800 p-5">
                    <h3 className="text-gray-400 uppercase tracking-widest text-xs font-sans mb-3">{titulo}</h3>
                    <ul className="space-y-2 font-sans text-sm">
                      {docs.map((doc) => (
                        <li key={doc.id} className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-[#A69076] mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            {doc.url ? (
                              <a href={doc.url} target="_blank" rel="noreferrer" className="text-gray-200 hover:text-[#A69076] break-words">{doc.titulo}</a>
                            ) : (
                              <span className="text-gray-300 break-words" title="Arquivo de exemplo indisponível">{doc.titulo}</span>
                            )}
                            {doc.descricao && <p className="text-gray-500 text-xs">{doc.descricao}</p>}
                            <p className="text-gray-600 text-xs font-mono truncate" title={doc.hash}>SHA-256 {doc.hash.slice(0, 16)}…</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="proprietarios" className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <h2 id="proprietarios" className="text-2xl font-serif">Histórico de proprietários</h2>
              {passaporte.ehProprietario && (
                <button
                  type="button"
                  onClick={handlePrivacy}
                  aria-pressed={passaporte.proprietariosPublicos}
                  className="border border-gray-700 px-4 py-2 font-sans text-xs uppercase tracking-widest text-gray-300 hover:border-white transition-colors"
                >
                  Identidade dos proprietários: {passaporte.proprietariosPublicos ? 'pública' : 'privada'}
                </button>
              )}
            </div>
            <ol className="border-l border-gray-800 ml-2 space-y-4">
              {passaporte.proprietarios.map((o) => (
                <li key={o.ordem} className="pl-6 relative">
                  <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${o.atual ? 'bg-emerald-400' : 'bg-gray-600'}`}></span>
                  <p className="text-gray-200 font-sans">{o.nome}{o.atual && <span className="ml-2 text-xs uppercase tracking-widest text-emerald-400">atual</span>}</p>
                  <p className="text-gray-500 font-sans text-xs">
                    {o.desde ? `Desde ${formatDate(o.desde)}` : 'Período não informado'}{o.ate ? ` até ${formatDate(o.ate)}` : ''}
                  </p>
                </li>
              ))}
            </ol>
            {!passaporte.proprietariosPublicos && !passaporte.ehProprietario && user?.perfil === 'Comprador' && (
              <p className="text-gray-500 font-sans text-xs mt-3">A identidade dos proprietários é privada, conforme definido pelo dono da peça.</p>
            )}
          </section>

          <section aria-labelledby="eventos" className="mb-10">
            <h2 id="eventos" className="text-2xl font-serif mb-4">Histórico de autenticidade</h2>
            <ul className="space-y-3 font-sans text-sm">
              {[...passaporte.eventos].reverse().map((e) => (
                <li key={e.id} className="bg-[#111] border border-gray-800 px-4 py-3">
                  <p className="text-gray-200">{e.descricao}</p>
                  <p className="text-gray-500 text-xs">{e.autor || 'Sistema'} · {formatDateTime(e.criadoEm)}</p>
                </li>
              ))}
            </ul>
          </section>

          {canUpdate && (
            <form onSubmit={handleUpdate} className="bg-[#111] border border-gray-800 p-6 md:p-8 space-y-6" aria-label="Atualizar passaporte">
              <h2 className="text-2xl font-serif">Atualizar passaporte</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="novo-status" className={labelClass}>Status</label>
                  <select id="novo-status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} appearance-none`}>
                    <option value="valido">Válido</option>
                    <option value="em revisão">Em revisão</option>
                    <option value="revogado">Revogado</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="atualizacao-descricao" className={labelClass}>Descrição da atualização</label>
                  <input id="atualizacao-descricao" type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputClass} />
                </div>
              </div>
              <DocumentUpload id="up-laudos" label="Novos laudos" files={files.laudos} onChange={setFilesOf('laudos')} />
              <DocumentUpload id="up-certificados" label="Novos certificados" files={files.certificados} onChange={setFilesOf('certificados')} />
              <DocumentUpload id="up-restauracoes" label="Registros de restauração" files={files.restauracoes} onChange={setFilesOf('restauracoes')} />
              <div className="flex justify-end">
                <button type="submit" disabled={saving} className="bg-white text-black px-10 py-3 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Atualizar e Assinar'}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
};

export default Passport;
