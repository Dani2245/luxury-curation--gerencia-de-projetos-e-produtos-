import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, saveSession } from '../services/api';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await apiFetch('/login', { method: 'POST', body: { email, password } });
      saveSession(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center pt-20 px-4">
      <div className="max-w-md w-full bg-[#111] border border-gray-800 p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-serif text-white tracking-wide">Acesso Privado</h2>
          <p className="text-gray-400 font-sans text-sm mt-2">Área exclusiva para usuários cadastrados.</p>
        </div>

        {error && (
          <div role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 mb-6 font-sans text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2">
              E-mail
            </label>
            <input 
              id="email"
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2">
              Senha
            </label>
            <input 
              id="password"
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-gray-700 px-4 py-3 text-white focus:outline-none focus:border-[#A69076] transition-colors font-sans"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit"
            className="w-full bg-white text-black font-sans uppercase tracking-widest text-xs font-medium py-4 hover:bg-gray-200 transition-colors mt-4"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
};

export default Auth;
