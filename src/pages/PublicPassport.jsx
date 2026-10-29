import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FileText, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiFetch, formatCurrency, formatDate, formatDateTime } from '../services/api';

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

// RFS54 - consulta do passaporte pelo link ou QR code, sem cadastro, só com os campos públicos
const PublicPassport = () => {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const origem = searchParams.get('origem') === 'qr' ? 'qr' : 'link';
  const [passaporte, setPassaporte] = useState(null);
  const [indisponivel, setIndisponivel] = useState('');
  const [loading, setLoading] = useState(true);
  // cada consulta registra um acesso; evita a segunda chamada do StrictMode em desenvolvimento
  const consultado = useRef(false);

  useEffect(() => {
    if (consultado.current) return;
    consultado.current = true;
    apiFetch(`/publico/passaportes/${token}`, { params: { origem } })
      .then(setPassaporte)
      .catch((err) => setIndisponivel(err.message))
      .finally(() => setLoading(false));
  }, [token, origem]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (indisponivel) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 pt-32 min-h-screen text-center">
        <div role="alert" className="border border-dashed border-gray-700 p-10">
          <ShieldAlert className="w-10 h-10 text-gray-500 mx-auto mb-4" />
          <h1 className="text-2xl font-serif mb-3">Link indisponível</h1>
          <p className="text-gray-400 font-sans">{indisponivel}</p>
        </div>
        <Link to="/landing" className="inline-block mt-8 text-[#A69076] font-sans uppercase tracking-widest text-xs hover:text-white transition-colors">
          Conheça a Lastro
        </Link>
      </div>
    );
  }

  const { peca, passaporte: pp, documentos, proprietarios, eventos } = passaporte;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <p className="text-[#A69076] font-sans text-xs tracking-widest uppercase mb-6">Consulta pública · compartilhada pelo proprietário</p>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 border-b border-gray-800 pb-8">
        <div>
          <p className="text-gray-500 font-sans text-xs tracking-widest uppercase mb-2">Passaporte Digital nº {pp.numero}</p>
          <h1 className="text-4xl font-serif">{peca.nome}</h1>
          <p className="text-gray-400 font-sans text-sm mt-2 first-letter:uppercase">
            {peca.categoria}{peca.valor !== undefined && <> · Valor: {formatCurrency(Number(peca.valor))}</>}
          </p>
        </div>
        <span className={`self-start md:self-auto border px-4 py-2 font-sans text-xs tracking-widest uppercase ${STATUS_STYLE[pp.status]}`}>
          Status: {pp.status}
        </span>
      </div>

      <section aria-labelledby="assinatura" className="bg-[#111] border border-gray-800 p-6 md:p-8 mb-8">
        <h2 id="assinatura" className="flex items-center gap-3 text-xl font-serif text-white mb-4">
          {pp.assinaturaValida
            ? <ShieldCheck className="w-6 h-6 text-emerald-400" />
            : <ShieldAlert className="w-6 h-6 text-red-400" />}
          Assinatura digital
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans text-sm">
          <div>
            <dt className="text-gray-500">Situação</dt>
            <dd className={pp.assinaturaValida ? 'text-emerald-400' : 'text-red-400'}>
              {pp.assinaturaValida ? 'Assinatura válida' : 'Assinatura inválida: conteúdo alterado'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Perito responsável</dt>
            <dd className="text-gray-200">{pp.perito || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Assinado por</dt>
            <dd className="text-gray-200">{pp.assinadoPor || '—'} em {formatDateTime(pp.assinadoEm)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Versão e código</dt>
            <dd className="text-gray-200 font-mono text-xs break-all">v{pp.versao} · {pp.codigo}</dd>
          </div>
        </dl>
      </section>

      {peca.descricao && (
        <section aria-labelledby="descricao" className="mb-8">
          <h2 id="descricao" className="text-2xl font-serif mb-4">Descrição</h2>
          <p className="text-gray-300 font-sans leading-relaxed whitespace-pre-line">{peca.descricao}</p>
        </section>
      )}

      {peca.fotografias?.length > 0 && (
        <section aria-labelledby="fotografias" className="mb-8">
          <h2 id="fotografias" className="text-2xl font-serif mb-4">Fotografias</h2>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {peca.fotografias.map((url) => (
              <li key={url} className="aspect-square bg-[#111] border border-gray-800 overflow-hidden">
                <img src={url} alt={peca.nome} className="w-full h-full object-cover" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {documentos && (
        <section aria-labelledby="documentos" className="mb-8">
          <h2 id="documentos" className="text-2xl font-serif mb-2">Documentos</h2>
          <p className="text-gray-500 font-sans text-xs mb-4">O hash SHA-256 comprova a integridade de cada arquivo. Os arquivos ficam restritos ao dono, ao perito e à plataforma.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(TIPOS).map(([tipo, titulo]) => {
              const docs = documentos.filter((d) => d.tipo === tipo);
              if (docs.length === 0) return null;
              return (
                <div key={tipo} className="bg-[#111] border border-gray-800 p-5">
                  <h3 className="text-gray-400 uppercase tracking-widest text-xs font-sans mb-3">{titulo}</h3>
                  <ul className="space-y-2 font-sans text-sm">
                    {docs.map((doc) => (
                      <li key={doc.hash + doc.titulo} className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-[#A69076] mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <span className="text-gray-300 break-words">{doc.titulo}</span>
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
      )}

      {proprietarios && (
        <section aria-labelledby="proprietarios" className="mb-8">
          <h2 id="proprietarios" className="text-2xl font-serif mb-4">Histórico de proprietários</h2>
          <ol className="border-l border-gray-800 ml-2 space-y-4">
            {proprietarios.map((o) => (
              <li key={o.ordem} className="pl-6 relative">
                <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${o.atual ? 'bg-emerald-400' : 'bg-gray-600'}`}></span>
                <p className="text-gray-200 font-sans">{o.nome}{o.atual && <span className="ml-2 text-xs uppercase tracking-widest text-emerald-400">atual</span>}</p>
                <p className="text-gray-500 font-sans text-xs">
                  {o.desde ? `Desde ${formatDate(`${o.desde}T12:00:00`)}` : 'Período não informado'}{o.ate ? ` até ${formatDate(`${o.ate}T12:00:00`)}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {eventos && (
        <section aria-labelledby="eventos" className="mb-10">
          <h2 id="eventos" className="text-2xl font-serif mb-4">Histórico de autenticidade</h2>
          <ul className="space-y-3 font-sans text-sm">
            {[...eventos].reverse().map((e) => (
              <li key={`${e.criadoEm}-${e.tipo}`} className="bg-[#111] border border-gray-800 px-4 py-3">
                <p className="text-gray-200">{e.descricao}</p>
                <p className="text-gray-500 text-xs">{e.autor} · {formatDateTime(e.criadoEm)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-gray-500 font-sans text-sm">O proprietário escolheu quais informações ficam públicas neste link.</p>
        <div className="flex gap-4">
          <Link to="/landing" className="bg-[#A69076] text-white px-6 py-3 text-xs tracking-[0.2em] uppercase font-bold hover:bg-[#8B7355] transition-colors">
            Conheça a Lastro
          </Link>
          {/* RFC17/RFS54: a inscrição feita a partir do link fica vinculada a ele */}
          <Link to={`/lista-de-espera?link=${token}&origem=link`} className="border border-[#A69076] text-[#D3BE96] px-6 py-3 text-xs tracking-[0.2em] uppercase hover:bg-[#A69076] hover:text-black transition-colors">
            Lista de espera
          </Link>
          <Link to={`/login?origem=${origem}`} className="border border-white/30 text-white px-6 py-3 text-xs tracking-[0.2em] uppercase hover:border-[#A69076] hover:text-[#A69076] transition-colors">
            Acesso privado
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PublicPassport;
