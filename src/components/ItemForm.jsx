import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, X } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useCategories } from '../services/categories';



const inputClass = 'w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans';
const labelClass = 'block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2';

// Formulário de peça (Tabela 1). Sem `item` cadastra; com `item` edita.
const ItemForm = ({ item, onSaved }) => {
  const { categories, error: categoryError } = useCategories();
  const [atributos, setAtributos] = useState(item?.atributos || {});
  const [privada, setPrivada] = useState(item?.privada ?? true);
  const [nome, setNome] = useState(item?.nome || '');
  const [categoria, setCategoria] = useState(item?.categoria || '');
  const [valor, setValor] = useState(item ? String(item.valor) : '');
  const [descricao, setDescricao] = useState(item?.descricao || '');
  const [mantidas, setMantidas] = useState(item?.fotografiasRefs || item?.fotografias || []);
  const [novas, setNovas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = (e) => {
    const selecionados = Array.from(e.target.files);
    setNovas((prev) => [...prev, ...selecionados]);
    e.target.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new FormData();
    formData.append('nome', nome);
    formData.append('categoria', categoria);
    formData.append('atributos', JSON.stringify(atributos));
    formData.append('privada', String(privada));
    formData.append('valorPretendido', valor);
    formData.append('descricao', descricao);
    if (item) formData.append('fotografiasMantidas', JSON.stringify(mantidas));
    novas.forEach((file) => formData.append('fotografias', file));

    try {
      const saved = await apiFetch(item ? `/pecas/${item.id}` : '/pecas', {
        method: item ? 'PUT' : 'POST',
        formData
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {(error || categoryError) && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 font-sans text-sm">
          {error || categoryError}
        </div>
      )}

      <div className="bg-[#111] border border-gray-800 p-6 md:p-8 space-y-6">
        <h3 className="text-white font-serif text-xl mb-4">Informações Básicas</h3>

        <div>
          <label htmlFor="nome" className={labelClass}>Nome da Peça *</label>
          <input
            id="nome"
            type="text"
            required
            maxLength={256}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={inputClass}
            placeholder="Ex: Omega Speedmaster Meteorite"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="categoria" className={labelClass}>Categoria *</label>
            <select
              id="categoria"
              required
              value={categoria}
              onChange={(e) => { setCategoria(e.target.value); setAtributos({}); }}
              className={`${inputClass} appearance-none`}
            >
              <option value="" disabled>Selecione uma categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.nome}>{c.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="valor" className={labelClass}>Valor Pretendido (R$) *</label>
            <input
              id="valor"
              type="number"
              required
              min="0.01"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className={inputClass}
              placeholder="0,00"
            />
          </div>
        </div>

        <div>
          {(categories.find((c) => c.nome === categoria)?.atributos || []).map((attr, index) => <div key={attr} className="mb-4"><label htmlFor={`atributo-${index}`} className={labelClass}>{attr}</label><input id={`atributo-${index}`} className={inputClass} maxLength={500} value={atributos[attr] || ''} onChange={(e) => setAtributos({ ...atributos, [attr]: e.target.value })} /></div>)}
          <label className="flex gap-3 items-center text-sm mb-4"><input id="peca-privada" type="checkbox" checked={privada} onChange={(e) => setPrivada(e.target.checked)} />Manter como acervo privado</label>
          <p className="text-gray-400 text-sm mb-6">No acervo privado, a peça fica acessível ao proprietário, à administração e aos peritos. Desmarque para solicitar publicação no catálogo. O compartilhamento do passaporte continua sob seu controle, campo a campo.</p>
          <label htmlFor="descricao" className={labelClass}>Descrição e Histórico</label>
          <textarea
            id="descricao"
            rows={5}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className={inputClass}
            placeholder="Histórico, procedência e características da peça"
          />
        </div>
      </div>

      <div className="bg-[#111] border border-gray-800 p-6 md:p-8">
        <h3 className="text-white font-serif text-xl mb-4">Fotografias</h3>
        <p className="text-gray-400 font-sans text-sm mb-6">Anexe uma ou mais imagens da peça (JPG, PNG ou WebP, até 5 MB cada).</p>

        {(mantidas.length > 0 || novas.length > 0) && (
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {mantidas.map((url) => (
              <li key={url} className="relative aspect-square bg-[#0a0a0a] border border-gray-800">
                <img src={item?.fotografias[item.fotografiasRefs?.indexOf(url)] || url} alt="Fotografia da peça" className="object-cover w-full h-full" />
                <button
                  type="button"
                  aria-label="Remover fotografia"
                  onClick={() => setMantidas(mantidas.filter((u) => u !== url))}
                  className="absolute top-2 right-2 bg-black/70 p-1 text-white hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
            {novas.map((file, index) => (
              <li key={`${file.name}-${index}`} className="relative aspect-square bg-[#0a0a0a] border border-[#A69076]/60">
                <img src={URL.createObjectURL(file)} alt={file.name} className="object-cover w-full h-full" />
                <button
                  type="button"
                  aria-label={`Remover ${file.name}`}
                  onClick={() => setNovas(novas.filter((_, i) => i !== index))}
                  className="absolute top-2 right-2 bg-black/70 p-1 text-white hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label htmlFor="fotografias" className="inline-flex items-center gap-2 bg-gray-800 px-6 py-3 cursor-pointer hover:bg-gray-700 transition-colors font-sans text-sm text-gray-300">
          <Upload className="w-5 h-5 text-gray-400" /> Adicionar fotografias
        </label>
        <input
          id="fotografias"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFiles}
          className="sr-only"
        />
      </div>

      <div className="flex justify-end gap-4">
        <Link to="/dashboard" className="px-8 py-4 font-sans uppercase tracking-widest text-xs font-medium text-gray-400 hover:text-white transition-colors">
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="bg-white text-black px-10 py-4 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {loading ? 'Salvando...' : item ? 'Salvar Alterações' : 'Cadastrar Peça'}
        </button>
      </div>
    </form>
  );
};

export default ItemForm;
