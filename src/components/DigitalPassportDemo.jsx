import React, { useState } from 'react';
import { ShieldCheck, FileText, CheckCircle2, Lock } from 'lucide-react';
import imgWatch from '../assets/placeholders/silver-watch.jpg';

const DigitalPassportDemo = () => {
  const [activeTab, setActiveTab] = useState('autenticidade');

  return (
    <section className="py-24 px-8 bg-[#0a0a0a] border-y border-[#1a1a1a]">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-serif text-white mb-4">Explore o Passaporte Lastro</h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            A prova inquestionável de valor. Interaja com o registro digital de uma peça de nosso acervo e entenda nosso padrão de verificação.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row bg-[#111111] rounded-2xl overflow-hidden border border-[#222222] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
          {/* Left Side: Product Focus */}
          <div className="w-full lg:w-2/5 relative h-80 lg:h-auto bg-[#1a1a1a]">
            <img src={imgWatch} alt="Silver Elegance Watch" className="absolute inset-0 w-full h-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>

            <div className="absolute bottom-0 left-0 p-8 w-full">
              <div className="flex items-center space-x-2 text-[#A69076] mb-3">
                <ShieldCheck size={20} />
                <span className="text-xs uppercase tracking-[0.2em] font-bold">Verificado</span>
              </div>
              <h3 className="text-2xl font-serif text-white mb-1">Elegância Prateada</h3>
              <p className="text-gray-400 text-sm">Ref. LST-8902-X</p>
            </div>
          </div>

          {/* Right Side: Passport Interface */}
          <div className="w-full lg:w-3/5 p-8 lg:p-12 flex flex-col">
            <div className="flex items-center justify-between border-b border-[#222222] pb-6 mb-8">
              <h4 className="text-white text-lg font-serif">Registro Permanente</h4>
              <div className="flex items-center text-gray-500 text-xs space-x-2 bg-[#1a1a1a] px-3 py-1.5 rounded-full">
                <Lock size={12} />
                <span>Segurança Blockchain</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-6 mb-8 border-b border-[#222222]">
              <button
                onClick={() => setActiveTab('autenticidade')}
                className={`pb-4 text-sm font-medium transition-colors duration-300 relative ${activeTab === 'autenticidade' ? 'text-[#A69076]' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Autenticidade
                {activeTab === 'autenticidade' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#A69076]"></div>}
              </button>
              <button
                onClick={() => setActiveTab('historico')}
                className={`pb-4 text-sm font-medium transition-colors duration-300 relative ${activeTab === 'historico' ? 'text-[#A69076]' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Histórico
                {activeTab === 'historico' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#A69076]"></div>}
              </button>
              <button
                onClick={() => setActiveTab('laudos')}
                className={`pb-4 text-sm font-medium transition-colors duration-300 relative ${activeTab === 'laudos' ? 'text-[#A69076]' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Laudos Periciais
                {activeTab === 'laudos' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#A69076]"></div>}
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-grow">
              {activeTab === 'autenticidade' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="flex items-start space-x-4">
                    <CheckCircle2 className="w-6 h-6 text-[#A69076] flex-shrink-0 mt-0.5" />
                    <div>
                      <h5 className="text-white text-sm font-bold mb-1">Certificado de Origem Emitido</h5>
                      <p className="text-gray-400 text-xs leading-relaxed">Documento original do fabricante verificado e digitalizado. Chave criptográfica gerada.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <CheckCircle2 className="w-6 h-6 text-[#A69076] flex-shrink-0 mt-0.5" />
                    <div>
                      <h5 className="text-white text-sm font-bold mb-1">Verificação de Número de Série</h5>
                      <p className="text-gray-400 text-xs leading-relaxed">Combinação exata com os registros da manufatura. Nenhuma irregularidade reportada.</p>
                    </div>
                  </div>
                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] mt-6">
                    <p className="text-gray-500 text-xs text-center italic">"Uma peça impecável, mantendo 100% dos componentes originais de fábrica." - Avaliador</p>
                  </div>
                </div>
              )}

              {activeTab === 'historico' && (
                <div className="relative pl-4 space-y-8 before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-[#222] animate-fadeIn">
                  <div className="relative">
                    <div className="absolute left-[-29px] top-1 w-3 h-3 bg-[#A69076] rounded-full ring-4 ring-[#111]"></div>
                    <span className="text-[#A69076] text-xs font-bold mb-1 block">2026 - Presente</span>
                    <h5 className="text-white text-sm mb-1">Acervo Lastro</h5>
                    <p className="text-gray-500 text-xs">Aquisição e emissão do Passaporte Digital.</p>
                  </div>
                  <div className="relative">
                    <div className="absolute left-[-29px] top-1 w-3 h-3 bg-[#333] rounded-full ring-4 ring-[#111]"></div>
                    <span className="text-gray-400 text-xs font-bold mb-1 block">2018 - 2026</span>
                    <h5 className="text-white text-sm mb-1">Colecionador Privado (Europa)</h5>
                    <p className="text-gray-500 text-xs">Mantido em cofre climatizado. Manutenção registrada.</p>
                  </div>
                  <div className="relative">
                    <div className="absolute left-[-29px] top-1 w-3 h-3 bg-[#333] rounded-full ring-4 ring-[#111]"></div>
                    <span className="text-gray-400 text-xs font-bold mb-1 block">2018</span>
                    <h5 className="text-white text-sm mb-1">Leilão Sotheby's Geneva</h5>
                    <p className="text-gray-500 text-xs">Arrematado como lote principal.</p>
                  </div>
                </div>
              )}

              {activeTab === 'laudos' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] hover:border-[#A69076]/50 transition-colors cursor-pointer group">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-[#222] rounded flex items-center justify-center text-[#A69076]">
                        <FileText size={18} />
                      </div>
                      <div>
                        <h5 className="text-white text-sm font-bold">Laudo de Calibre e Mecanismo</h5>
                        <p className="text-gray-500 text-xs">PDF • 2.4 MB • Emitido por Swiss Expertise</p>
                      </div>
                    </div>
                    <span className="text-gray-600 group-hover:text-[#A69076] transition-colors">&rarr;</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] hover:border-[#A69076]/50 transition-colors cursor-pointer group">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-[#222] rounded flex items-center justify-center text-[#A69076]">
                        <FileText size={18} />
                      </div>
                      <div>
                        <h5 className="text-white text-sm font-bold">Análise de Desgaste e Caixa</h5>
                        <p className="text-gray-500 text-xs">PDF • 1.1 MB • Emitido por L.A. Horology</p>
                      </div>
                    </div>
                    <span className="text-gray-600 group-hover:text-[#A69076] transition-colors">&rarr;</span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};

export default DigitalPassportDemo;
