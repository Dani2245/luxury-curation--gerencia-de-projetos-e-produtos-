import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Ban, Copy, Download, Eye, Pencil, QrCode } from 'lucide-react';
import { apiFetch, formatDate, formatDateTime } from '../services/api';

// Campos que o dono escolhe tornar públicos; identidade e valor ficam privados por padrão (RNF04)
const CAMPOS_PUBLICOS = [
  { id: 'descricao', label: 'Descrição da peça' },
  { id: 'fotografias', label: 'Fotografias' },
  { id: 'documentos', label: 'Lista de documentos com hash (sem os arquivos)' },
  { id: 'historico_proprietarios', label: 'Histórico de proprietários' },
  { id: 'historico_eventos', label: 'Histórico de autenticidade' },
  { id: 'identidade_proprietarios', label: 'Identidade dos proprietários e notas fiscais', privado: true },
  { id: 'valor', label: 'Valor da peça', privado: true }
];

const PADRAO = CAMPOS_PUBLICOS.filter((c) => !c.privado).map((c) => c.id);

const SITUACAO = {
  ativo: { label: 'Ativo', className: 'text-emerald-400 border-emerald-500/50' },
  expirado: { label: 'Expirado', className: 'text-yellow-400 border-yellow-500/50' },
  revogado: { label: 'Revogado', className: 'text-red-400 border-red-500/50' },
  encerrado: { label: 'Encerrado: a peça mudou de dono', className: 'text-gray-400 border-gray-600' }
};

const inputClass = 'w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans disabled:opacity-50';
const labelClass = 'block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2';
const actionClass = 'flex items-center gap-2 border border-gray-700 px-3 py-2 font-sans text-xs uppercase tracking-widest text-gray-300 hover:border-white transition-colors';

// data local no formato AAAA-MM-DD, usada como mínimo da validade
const hoje = () => new Date().toLocaleDateString('sv-SE');

const linkUrl = (token, origem) => `${window.location.origin}/p/${token}${origem ? `?origem=${origem}` : ''}`;

const plural = (n, singular, pluralForm) => `${n} ${n === 1 ? singular : pluralForm}`;

// RFC16 - Links de compartilhamento do passaporte (RFS53 a RFS56), visível ao proprietário atual da peça
const ShareLinksPanel = ({ passaporteId }) => {
  const [links, setLinks] = useState([]);
  const [campos, setCampos] = useState(PADRAO);
  const [validade, setValidade] = useState('');
  const [destinatario, setDestinatario] = useState('');
  const [editing, setEditing] = useState(null);
  const [qrAberto, setQrAberto] = useState(null);
  const [acessos, setAcessos] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLinks(await apiFetch('/links', { params: { passaporteId } }));
    } catch (err) {
      setError(err.message);
    }
  }, [passaporteId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setCampos(PADRAO);
    setValidade('');
    setDestinatario('');
    setEditing(null);
  };

  const toggleCampo = (id) =>
    setCampos((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/links/${editing.id}`, { method: 'PUT', body: { camposPublicos: campos, validade } });
      } else {
        await apiFetch('/links', { method: 'POST', body: { passaporteId, camposPublicos: campos, validade, destinatario } });
      }
      resetForm();
      // a mensagem só aparece com a lista já atualizada
      await load();
      setNotice(editing ? 'Link atualizado.' : 'Link gerado. Copie o endereço ou mostre o QR code.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (link) => {
    setError('');
    setNotice('');
    setEditing(link);
    setCampos(link.camposPublicos);
    setValidade(link.validade || '');
    setDestinatario(link.destinatario || '');
  };

  const handleRevoke = async (link) => {
    if (!window.confirm('Revogar este link? Quem tiver o endereço ou o QR code perde o acesso imediatamente.')) return;
    setError('');
    setNotice('');
    try {
      await apiFetch(`/links/${link.id}`, { method: 'DELETE' });
      if (editing?.id === link.id) resetForm();
      await load();
      setNotice('Link revogado.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopy = async (link) => {
    try {
      await navigator.clipboard.writeText(linkUrl(link.token));
      setNotice('Link copiado.');
    } catch {
      setError('Não foi possível copiar. Selecione o endereço e copie manualmente.');
    }
  };

  const toggleAcessos = async (link) => {
    if (acessos[link.id]) {
      setAcessos(({ [link.id]: _, ...rest }) => rest);
      return;
    }
    try {
      const data = await apiFetch(`/links/${link.id}/acessos`);
      setAcessos((prev) => ({ ...prev, [link.id]: data }));
    } catch (err) {
      setError(err.message);
    }
  };

  const downloadQr = (link) => {
    const canvas = document.getElementById(`qr-${link.id}`);
    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = `passaporte-${passaporteId}-qr.png`;
    anchor.click();
  };

  return (
    <section aria-labelledby="compartilhar" className="mb-10">
      <h2 id="compartilhar" className="text-2xl font-serif mb-2">Compartilhar passaporte</h2>
      <p className="text-gray-500 font-sans text-sm mb-6">
        Gere um link ou QR code para enviar a terceiros. Quem recebe consulta sem cadastro e vê só os campos que você escolher.
        Sempre visíveis: nome, categoria, status, perito e assinatura digital.
      </p>

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

      <form onSubmit={handleSubmit} aria-label={editing ? 'Editar link' : 'Gerar link'} className="bg-[#111] border border-gray-800 p-6 space-y-6 mb-6">
        <fieldset>
          <legend className={labelClass}>Campos públicos</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CAMPOS_PUBLICOS.map((campo) => (
              <label key={campo.id} htmlFor={`campo-${campo.id}`} className="flex items-center gap-3 font-sans text-sm text-gray-300 cursor-pointer">
                <input
                  id={`campo-${campo.id}`}
                  type="checkbox"
                  checked={campos.includes(campo.id)}
                  onChange={() => toggleCampo(campo.id)}
                  className="accent-[#A69076] w-4 h-4"
                />
                <span>
                  {campo.label}
                  {campo.privado && <span className="text-gray-500 text-xs"> (privado por padrão)</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="link-validade" className={labelClass}>Validade (opcional)</label>
            <input id="link-validade" type="date" min={hoje()} value={validade} onChange={(e) => setValidade(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="link-destinatario" className={labelClass}>Destinatário (opcional)</label>
            <input
              id="link-destinatario"
              type="text"
              maxLength={150}
              value={destinatario}
              disabled={Boolean(editing)}
              onChange={(e) => setDestinatario(e.target.value)}
              placeholder="Para quem você vai enviar"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          {editing && (
            <button type="button" onClick={resetForm} className="border border-gray-700 text-gray-300 px-6 py-3 font-sans uppercase tracking-widest text-xs hover:border-white transition-colors">
              Cancelar edição
            </button>
          )}
          <button type="submit" disabled={saving} className="bg-white text-black px-8 py-3 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Gerar link'}
          </button>
        </div>
      </form>

      {links.length === 0 ? (
        <p className="text-gray-500 font-sans text-sm">Nenhum link gerado para este passaporte.</p>
      ) : (
        <ul className="space-y-4">
          {links.map((link) => {
            const situacao = SITUACAO[link.situacao] || SITUACAO.ativo;
            const ativo = link.situacao === 'ativo';
            const editavel = link.situacao === 'ativo' || link.situacao === 'expirado';
            return (
              <li key={link.id} data-testid={`link-${link.id}`} className="bg-[#111] border border-gray-800 p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-3 font-sans text-xs text-gray-500">
                  <span className={`border px-3 py-1 uppercase tracking-widest ${situacao.className}`}>{situacao.label}</span>
                  {link.destinatario && <span>Para: <span className="text-gray-300">{link.destinatario}</span></span>}
                  <span>Criado em {formatDateTime(link.criadoEm)}</span>
                  <span>{link.validade ? `Válido até ${formatDate(`${link.validade}T12:00:00`)}` : 'Sem validade'}</span>
                </div>

                <input
                  readOnly
                  value={linkUrl(link.token)}
                  aria-label={`Endereço do link ${link.id}`}
                  onFocus={(e) => e.target.select()}
                  className="w-full bg-[#0a0a0a] border border-gray-800 px-3 py-2 text-gray-300 font-mono text-xs"
                />

                <p className="font-sans text-sm text-gray-300" data-testid={`acessos-${link.id}`}>
                  {plural(link.acessos, 'acesso', 'acessos')} ({link.acessosQr} pelo QR code)
                  {link.ultimoAcesso && <span className="text-gray-500"> · último em {formatDateTime(link.ultimoAcesso)}</span>}
                </p>
                <p className="font-sans text-xs text-gray-500">
                  Públicos: {link.camposPublicos.length
                    ? CAMPOS_PUBLICOS.filter((c) => link.camposPublicos.includes(c.id)).map((c) => c.label).join(' · ')
                    : 'somente os dados essenciais'}
                </p>

                <div className="flex flex-wrap gap-3">
                  {ativo && (
                    <>
                      <button type="button" onClick={() => handleCopy(link)} aria-label={`Copiar link ${link.id}`} className={actionClass}>
                        <Copy className="w-4 h-4" /> Copiar
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrAberto(qrAberto === link.id ? null : link.id)}
                        aria-label={`QR code do link ${link.id}`}
                        aria-expanded={qrAberto === link.id}
                        className={actionClass}
                      >
                        <QrCode className="w-4 h-4" /> QR code
                      </button>
                    </>
                  )}
                  {editavel && (
                    <button type="button" onClick={() => startEdit(link)} aria-label={`Editar link ${link.id}`} className={actionClass}>
                      <Pencil className="w-4 h-4" /> Editar
                    </button>
                  )}
                  {link.status === 'ativo' && link.situacao !== 'encerrado' && (
                    <button type="button" onClick={() => handleRevoke(link)} aria-label={`Revogar link ${link.id}`} className={`${actionClass} hover:border-red-400 hover:text-red-400`}>
                      <Ban className="w-4 h-4" /> Revogar
                    </button>
                  )}
                  <button type="button" onClick={() => toggleAcessos(link)} aria-label={`Acessos do link ${link.id}`} aria-expanded={Boolean(acessos[link.id])} className={actionClass}>
                    <Eye className="w-4 h-4" /> Acessos
                  </button>
                </div>

                {ativo && qrAberto === link.id && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="bg-white p-2">
                      <QRCodeCanvas id={`qr-${link.id}`} value={linkUrl(link.token, 'qr')} size={176} marginSize={1} title={`QR code do passaporte de ${link.pecaNome}`} />
                    </div>
                    <div className="font-sans text-sm text-gray-400 space-y-3">
                      <p>Imprima no certificado ou mostre na negociação. Acessos pelo QR code são contados separadamente.</p>
                      <button type="button" onClick={() => downloadQr(link)} className={actionClass}>
                        <Download className="w-4 h-4" /> Baixar QR code
                      </button>
                    </div>
                  </div>
                )}

                {acessos[link.id] && (
                  acessos[link.id].length === 0 ? (
                    <p className="font-sans text-sm text-gray-500">Nenhum acesso registrado.</p>
                  ) : (
                    <ul aria-label={`Histórico de acessos do link ${link.id}`} className="font-sans text-xs text-gray-400 space-y-1 border-l border-gray-800 pl-4">
                      {acessos[link.id].map((a) => (
                        <li key={a.id}>{formatDateTime(a.acessadoEm)} · {a.origem === 'qr' ? 'QR code' : 'Link'}</li>
                      ))}
                    </ul>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ShareLinksPanel;
