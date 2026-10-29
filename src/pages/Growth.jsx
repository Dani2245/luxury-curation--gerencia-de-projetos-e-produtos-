import React, { useState } from 'react';
import OperationLayout from '../components/OperationLayout';
import GrowthPanel from '../components/GrowthPanel';
import IndicatorsManager from '../components/IndicatorsManager';
import ExperimentsManager from '../components/ExperimentsManager';
import { buttonClass, primaryClass } from '../services/operations';

const ABAS = [
  ['painel', 'Painel de growth', GrowthPanel],
  ['indicadores', 'Indicadores', IndicatorsManager],
  ['experimentos', 'Experimentos', ExperimentsManager]
];

// Growth do administrador: painel (RF04), indicadores (RFC19) e experimentos (RFC20)
const Growth = () => {
  const [aba, setAba] = useState('painel');
  const Atual = ABAS.find(([id]) => id === aba)[2];
  return (
    <OperationLayout title="Growth" description="North Star (passaportes vivos), métricas de proteção, funil AARRR e experimentos priorizados pelo ICE Score, conforme o Plano de Growth.">
      <div role="group" aria-label="Seção de growth" className="flex flex-wrap gap-3 mb-6">
        {ABAS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={aba === id} className={aba === id ? primaryClass : buttonClass} onClick={() => setAba(id)}>{label}</button>
        ))}
      </div>
      <Atual />
    </OperationLayout>
  );
};

export default Growth;
