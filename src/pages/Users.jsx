import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiFetch, getUser } from '../services/api';

const PERFIS = ['Administrador', 'Vendedor', 'Comprador', 'Perito'];

const inputClass = 'w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans';
const labelClass = 'block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2';
const emptyForm = { nome: '', email: '', perfil: 'Comprador', senha: '' };

// Manter Usuários (RFC01 / RFS09-RFS12) - exclusivo do Administrador
const Users = () => {
  const currentUser = getUser();
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ nome: '', email: '', perfil: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async (params) => {
    setLoading(true);
    setError('');
    try {
      setUsers(await apiFetch('/usuarios', { params }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers({});
  }, [loadUsers]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadUsers(filters);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
  };

  const openEdit = (user) => {
    setEditingId(user.id);
    setForm({ nome: user.nome, email: user.email, perfil: user.perfil, senha: '' });
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await apiFetch(editingId ? `/usuarios/${editingId}` : '/usuarios', {
        method: editingId ? 'PUT' : 'POST',
        body: form
      });
      setNotice(editingId ? 'Usuário atualizado com sucesso.' : 'Usuário cadastrado com sucesso.');
      setForm(null);
      await loadUsers(filters);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Remover o usuário "${user.nome}"? Esta ação não pode ser desfeita.`)) return;
    setError('');
    setNotice('');
    try {
      await apiFetch(`/usuarios/${user.id}`, { method: 'DELETE' });
      setNotice('Usuário removido com sucesso.');
      await loadUsers(filters);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24 min-h-screen">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-sans uppercase tracking-widest text-xs">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b border-gray-800 pb-6">
        <h1 className="text-4xl font-serif">Usuários</h1>
        <button
          type="button"
          onClick={openCreate}
          className="mt-4 md:mt-0 bg-white text-black px-6 py-2.5 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 items-end">
        <div>
          <label htmlFor="filtro-nome" className={labelClass}>Nome</label>
          <input id="filtro-nome" type="text" value={filters.nome} onChange={(e) => setFilters({ ...filters, nome: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="filtro-email" className={labelClass}>E-mail</label>
          <input id="filtro-email" type="text" value={filters.email} onChange={(e) => setFilters({ ...filters, email: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="filtro-perfil" className={labelClass}>Perfil</label>
          <select id="filtro-perfil" value={filters.perfil} onChange={(e) => setFilters({ ...filters, perfil: e.target.value })} className={`${inputClass} appearance-none`}>
            <option value="">Todos</option>
            {PERFIS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button type="submit" className="border border-gray-700 text-gray-200 py-3 font-sans uppercase tracking-widest text-xs hover:border-white transition-colors">
          Buscar
        </button>
      </form>

      {notice && (
        <div role="status" className="bg-emerald-900/40 border border-emerald-500 text-emerald-200 px-4 py-3 mb-6 font-sans text-sm">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm">
          {error}
        </div>
      )}

      {form && (
        <form onSubmit={handleSubmit} className="bg-[#111] border border-gray-800 p-6 md:p-8 mb-8 space-y-6" aria-label={editingId ? 'Editar usuário' : 'Novo usuário'}>
          <h2 className="text-white font-serif text-xl">{editingId ? 'Editar Usuário' : 'Novo Usuário'}</h2>

          {formError && (
            <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 font-sans text-sm">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="usuario-nome" className={labelClass}>Nome *</label>
              <input id="usuario-nome" type="text" required minLength={3} maxLength={150} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="usuario-email" className={labelClass}>E-mail *</label>
              <input id="usuario-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="usuario-perfil" className={labelClass}>Perfil de acesso *</label>
              <select id="usuario-perfil" required value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value })} className={`${inputClass} appearance-none`}>
                {PERFIS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="usuario-senha" className={labelClass}>{editingId ? 'Nova senha (opcional)' : 'Senha *'}</label>
              <input
                id="usuario-senha"
                type="password"
                required={!editingId}
                minLength={8}
                autoComplete="new-password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                className={inputClass}
                placeholder={editingId ? 'Deixe em branco para manter' : 'Mínimo de 8 caracteres'}
              />
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <button type="button" onClick={() => setForm(null)} className="px-8 py-3 font-sans uppercase tracking-widest text-xs text-gray-400 hover:text-white transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="bg-white text-black px-10 py-3 font-sans uppercase tracking-widest text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400 font-sans">Carregando usuários...</p>
      ) : users.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-800">
          <p className="text-gray-500 font-sans">Nenhum usuário encontrado.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-800">
          <table className="w-full text-left font-sans text-sm">
            <caption className="sr-only">Usuários cadastrados</caption>
            <thead className="bg-[#111] text-gray-400 uppercase tracking-widest text-xs">
              <tr>
                <th scope="col" className="px-4 py-3">Nome</th>
                <th scope="col" className="px-4 py-3">E-mail</th>
                <th scope="col" className="px-4 py-3">Perfil</th>
                <th scope="col" className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 text-white">{user.nome}</td>
                  <td className="px-4 py-3 text-gray-400">{user.email}</td>
                  <td className="px-4 py-3 text-[#A69076]">{user.perfil}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => openEdit(user)} aria-label={`Editar ${user.nome}`} title="Editar" className="text-gray-400 hover:text-white">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(user)}
                        disabled={user.id === currentUser?.id}
                        aria-label={`Remover ${user.nome}`}
                        title={user.id === currentUser?.id ? 'Você não pode remover o seu próprio usuário' : 'Remover'}
                        className="text-gray-400 hover:text-red-400 disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Users;
