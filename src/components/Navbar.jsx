import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUser } from '../services/api';

const Navbar = () => {
  const [user, setUser] = useState(getUser());

  useEffect(() => {
    const sync = () => setUser(getUser());
    window.addEventListener('session-changed', sync);
    return () => window.removeEventListener('session-changed', sync);
  }, []);

  return (
    <nav className="bg-[#0a0a0a]/95 backdrop-blur-md border-b-[0.5px] border-[#A69076]/40 fixed w-full z-50 top-0">
      <div className="container mx-auto flex justify-between items-center px-4 md:px-8 py-3 md:py-4">
        {/* Left - Logo */}
        <Link to="/" className="flex items-center space-x-3 md:space-x-4">
          <div className="flex flex-col justify-center items-center">
            <h1 className="text-white text-sm md:text-lg tracking-[0.3em] uppercase font-serif leading-tight tracking-wider antialiased">LASTRO</h1>
            <span className="text-gray-500 text-[8px] md:text-[9px] tracking-[0.3em] uppercase mt-0.5">ARTE / DESIGN / LUXO</span>
          </div>
        </Link>

        {/* Center - Links */}
        <ul className="hidden lg:flex space-x-6 xl:space-x-8">
          {['ARTE', 'COLECIONÁVEIS', 'MOBILIÁRIO', 'RELÓGIOS', 'AUTOMOTIVO', 'DIVERSOS'].map((item) => (
            <li key={item}>
              <Link to="/catalogo" className="text-white hover:text-[#A69076] uppercase text-xs tracking-[0.2em] transition-colors duration-300">
                {item}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right - Actions */}
        <div className="flex items-center space-x-4 md:space-x-5">
          <button className="text-white hover:text-[#A69076] hidden md:block transition-colors duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button className="text-white hover:text-[#A69076] hidden md:block transition-colors duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
          <Link to={user ? '/dashboard' : '/login'} className="border border-[#A69076] text-[#A69076] px-4 py-1.5 md:px-6 md:py-2 text-xs md:text-sm hover:bg-[#A69076] hover:text-black transition-colors duration-300">
            {user ? 'MEU PAINEL' : 'ACESSO PRIVADO'}
          </Link>
          
          {/* Mobile Menu Button */}
          <button className="text-white hover:text-[#A69076] lg:hidden transition-colors duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
