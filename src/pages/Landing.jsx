import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import HeroSection from '../components/HeroSection';
import VideoSection from '../components/VideoSection';
import DigitalPassportDemo from '../components/DigitalPassportDemo';
import TheLastroStandard from '../components/TheLastroStandard';
import CaseStudyEndorsement from '../components/CaseStudyEndorsement';
import CuratedSelection from '../components/CuratedSelection';

const Landing = () => {
  // RFC17: a versão da página (?v=) e a origem (?utm_source=) seguem para a inscrição na lista de espera
  const { search } = useLocation();
  return (
    <div className="bg-[#0a0a0a] min-h-screen text-gray-200 font-sans w-full">
      {/* Hero Section */}
      <HeroSection />

      {/* The Digital Passport Immersion */}
      <VideoSection />
      
      {/* Interactive Passport Demo */}
      <DigitalPassportDemo />
      
      {/* Market Comparison */}
      <TheLastroStandard />

      {/* Social Proof & Case Study */}
      <CaseStudyEndorsement />

      {/* Curated Selection Section (Existing Component) */}
      <div className="py-8">
        <CuratedSelection />
      </div>

      {/* CTA Section */}
      <section className="py-24 px-8 relative overflow-hidden bg-[#050505]">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#A69076] via-black to-black"></div>
        <div className="container mx-auto text-center relative z-10">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-serif text-white mb-6">Pronto para iniciar sua coleção?</h2>
            <p className="text-gray-400 mb-10 max-w-2xl mx-auto text-lg">
              Junte-se a um grupo seleto de colecionadores e tenha acesso ao nosso portfólio restrito de peças extraordinárias.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
            <Link to={`/lista-de-espera${search}`} className="bg-[#A69076] text-white px-10 py-4 w-full sm:w-auto hover:bg-[#8B7355] transition-all duration-300 text-xs tracking-[0.2em] uppercase font-bold shadow-[0_0_20px_rgba(166,144,118,0.3)] hover:shadow-[0_0_30px_rgba(166,144,118,0.5)]">
              Entrar na lista de espera
            </Link>
            <Link to="/catalogo" className="border border-white/30 text-white px-10 py-4 w-full sm:w-auto hover:border-[#A69076] hover:text-[#A69076] transition-colors duration-300 text-xs tracking-[0.2em] uppercase">
              Explorar o Catálogo
            </Link>
          </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
