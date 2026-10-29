import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../services/api';
import { CATEGORIAS_INTERESSE, slug } from '../services/growth';
import { inputClass, labelClass, primaryClass } from '../services/operations';

// RFC17 - inscrição do visitante na lista de espera, sem cadastro (RFS57).
// A versão da página (?v=) e a origem (?origem= ou ?utm_source=) são registradas automaticamente;
// o convite de uma indicação (?convite=) e o link de um passaporte (?link=) ficam vinculados à inscrição.
const Waitlist = () => {
  const [params] = useSearchParams();
  const versao = (params.get('v') || 'a').toLowerCase();
  // experimento X5 do Plano de Growth: a versão "b" da página inclui bolsas no recorte
  const categorias = versao === 'b' ? CATEGORIAS_INTERESSE : CATEGORIAS_INTERESSE.filter((c) => c !== 'bolsa');
  const [form, setForm] = useState({ nome: '', email: '', perfil: 'comprador', categorias: [], consentimento: false });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (categoria) => setForm({
    ...form,
    categorias: form.categorias.includes(categoria) ? form.categorias.filter((c) => c !== categoria) : [...form.categorias, categoria]
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiFetch('/lista-espera', {
        method: 'POST',
        body: {
          ...form,
          versao,
          origem: params.get('origem') || params.get('utm_source') || '',
          link: params.get('link') || '',
          convite: params.get('convite') || ''
        }
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 pt-28 pb-16 min-h-screen">
      <h1 className="font-serif text-4xl text-white mb-3">Lista de espera</h1>
      <p className="text-gray-400 font-sans text-sm mb-8">
        A Lastro abre aos poucos, com curadoria e peritos credenciados. Deixe seu contato e avisaremos quando houver vaga para você.
      </p>
      {done ? (
        <div role="status" className="border border-emerald-700 bg-emerald-950/40 p-5 text-emerald-200 font-sans text-sm">
          Inscrição confirmada. Avisaremos você por e-mail quando houver vaga.
          <Link to="/" className="block mt-4 text-[#D3BE96] hover:text-white uppercase tracking-widest text-xs">Voltar ao início</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="le-nome" className={labelClass}>Nome *</label>
            <input id="le-nome" required maxLength={150} className={inputClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <label htmlFor="le-email" className={labelClass}>E-mail *</label>
            <input id="le-email" type="email" required maxLength={255} className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label htmlFor="le-perfil" className={labelClass}>Quero *</label>
            <select id="le-perfil" className={inputClass} value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value })}>
              <option value="comprador">Comprar peças</option>
              <option value="vendedor">Vender peças</option>
            </select>
          </div>
          <fieldset>
            <legend className={labelClass}>Categorias de interesse</legend>
            <div className="flex flex-wrap gap-4 font-sans text-sm text-gray-300">
              {categorias.map((c) => (
                <label key={c} htmlFor={`le-cat-${slug(c)}`} className="flex items-center gap-2">
                  <input id={`le-cat-${slug(c)}`} type="checkbox" checked={form.categorias.includes(c)} onChange={() => toggle(c)} /> {c}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="le-consentimento" className="flex items-start gap-2 font-sans text-sm text-gray-300">
            <input id="le-consentimento" type="checkbox" required checked={form.consentimento} onChange={(e) => setForm({ ...form, consentimento: e.target.checked })} className="mt-1" />
            Concordo que a Lastro guarde meu nome e e-mail para me avisar sobre a abertura. Posso pedir a exclusão a qualquer momento.
          </label>
          {error && <p role="alert" className="bg-red-950/50 border border-red-700 p-3 text-red-200 font-sans text-sm">{error}</p>}
          <button disabled={busy} className={primaryClass}>Entrar na lista de espera</button>
        </form>
      )}
    </div>
  );
};

export default Waitlist;
