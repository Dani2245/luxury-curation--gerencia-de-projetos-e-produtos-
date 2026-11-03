import React from 'react';
import { Link } from 'react-router-dom';
export default function FoundingExperts() {
  return <main className="max-w-3xl mx-auto pt-32 pb-20 px-6 space-y-6">
    <p className="text-[#A69076] uppercase text-sm">Programa piloto · X3</p><h1 className="font-serif text-4xl">Perito fundador Lastro</h1>
    <p className="text-gray-300">O programa convida peritos credenciados a emitir um primeiro laudo de autenticidade e avaliação, sem custo de adesão ao piloto. O nome do signatário acompanha o laudo no passaporte e permanece no histórico de propriedade.</p>
    <ol className="list-decimal pl-6 space-y-3 text-gray-400"><li>O grupo entra em contato com o laboratório e registra a resposta.</li><li>A administração cadastra o profissional como Perito após conferir suas credenciais.</li><li>O perito registra parecer técnico, avaliação e fotos, assina o laudo e o vincula ao passaporte.</li><li>O perito pode indicar vendedores; o grupo acompanha a chegada ao diagnóstico.</li></ol>
    <p className="text-gray-400">As condições de uma perícia e sua remuneração são combinadas com o grupo. Esta página apresenta o piloto e não confirma a participação de qualquer laboratório.</p>
    <div className="flex gap-4 flex-wrap"><Link className="border border-[#A69076] px-6 py-3" to="/passaporte-exemplo">Conhecer o passaporte-exemplo</Link><Link className="bg-white text-black px-6 py-3" to="/login">Acessar como perito</Link></div>
  </main>;
}
